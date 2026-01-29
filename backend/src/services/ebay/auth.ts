/**
 * eBay Authentication Service
 *
 * Handles OAuth 2.0 Authorization Code flow:
 * - Generate auth URL with state parameter
 * - Exchange authorization code for tokens
 * - Refresh access tokens
 * - Store/retrieve encrypted tokens
 *
 * Security Requirements:
 * - Tokens stored server-side ONLY
 * - Tokens encrypted at rest with AES-256-GCM
 * - State parameter validated to prevent CSRF
 * - Mobile app receives only { connected: boolean }
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import {
  EBAY_API_URLS,
  EBAY_REQUIRED_SCOPES,
  TOKEN_REFRESH_WINDOW_MS,
  tokenNeedsRefresh,
  type EbayTokenSet,
  type EbayConnectedAccount,
  type EbayAuthStartResponse,
  type EbayRedirectContext,
} from '../../types/ebay-schemas.js';
import { encryptToken, decryptToken, generateOAuthState } from './token-crypto.js';
import { getEbayClient, type EbayTokenResponse } from './client.js';

// =============================================================================
// TYPES
// =============================================================================

interface StoredAuthState {
  id: string;
  user_id: string;
  state: string;
  redirect_context: EbayRedirectContext;
  expires_at: string;
  used_at: string | null;
}

interface StoredEbayAccount {
  id: string;
  user_id: string;
  ebay_user_id: string;
  ebay_username: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  scopes: string[];
  marketplace_id: string;
  status: 'active' | 'expired' | 'revoked';
  connected_at: string;
  last_used_at: string | null;
}

// =============================================================================
// EBAY AUTH SERVICE CLASS
// =============================================================================

export class EbayAuthService {
  private supabase: SupabaseClient;
  private ebayClient: ReturnType<typeof getEbayClient>;

  constructor() {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    this.ebayClient = getEbayClient();
  }

  /**
   * Check if eBay OAuth is properly configured
   */
  isConfigured(): boolean {
    return !!(
      env.EBAY_CLIENT_ID &&
      env.EBAY_CLIENT_SECRET &&
      env.EBAY_RUNAME &&
      env.EBAY_TOKEN_ENCRYPTION_KEY
    );
  }

  /**
   * Start OAuth flow - generate auth URL and store state
   */
  async startOAuth(
    userId: string,
    redirectContext: EbayRedirectContext
  ): Promise<EbayAuthStartResponse> {
    if (!this.isConfigured()) {
      throw new Error('eBay OAuth is not configured');
    }

    // Generate cryptographically secure state
    const state = generateOAuthState();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store state in database for CSRF validation
    const { error: insertError } = await this.supabase
      .from('ebay_auth_states')
      .insert({
        user_id: userId,
        state,
        redirect_context: redirectContext,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('[eBay Auth] Failed to store auth state:', insertError);
      throw new Error('Failed to initiate OAuth flow');
    }

    // Build authorization URL
    const urls = EBAY_API_URLS[env.EBAY_ENVIRONMENT as 'sandbox' | 'production'];
    const authUrl = new URL(urls.auth);

    authUrl.searchParams.set('client_id', env.EBAY_CLIENT_ID!);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', env.EBAY_RUNAME!);
    authUrl.searchParams.set('scope', EBAY_REQUIRED_SCOPES.join(' '));
    authUrl.searchParams.set('state', state);

    console.log(`[eBay Auth] OAuth started for user ${userId}, state: ${state.substring(0, 8)}...`);

    return {
      auth_url: authUrl.toString(),
      state,
      expires_at: expiresAt.toISOString(),
    };
  }

  /**
   * Handle OAuth callback - validate state and exchange code for tokens
   */
  async handleCallback(
    code: string,
    state: string
  ): Promise<{ success: boolean; userId: string; redirectContext: EbayRedirectContext }> {
    // Validate state parameter
    const { data: authState, error: stateError } = await this.supabase
      .from('ebay_auth_states')
      .select('*')
      .eq('state', state)
      .is('used_at', null)
      .single();

    if (stateError || !authState) {
      console.error('[eBay Auth] Invalid or expired state parameter');
      throw new Error('Invalid or expired authorization state');
    }

    const storedState = authState as StoredAuthState;

    // Check expiry
    if (new Date(storedState.expires_at) < new Date()) {
      throw new Error('Authorization state has expired');
    }

    // Mark state as used (prevent replay)
    await this.supabase
      .from('ebay_auth_states')
      .update({ used_at: new Date().toISOString() })
      .eq('id', storedState.id);

    // Exchange code for tokens
    const redirectUri = env.EBAY_RUNAME!;
    const tokenResponse = await this.ebayClient.exchangeCodeForTokens(code, redirectUri);

    if (!tokenResponse.success || !tokenResponse.data) {
      console.error('[eBay Auth] Token exchange failed:', tokenResponse.error);
      throw new Error(tokenResponse.error?.error.message || 'Failed to exchange authorization code');
    }

    const tokens = tokenResponse.data;

    // Calculate expiry times
    const now = Date.now();
    const accessTokenExpiresAt = new Date(now + tokens.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(
      now + (tokens.refresh_token_expires_in || 47304000) * 1000 // Default 18 months
    );

    // Get eBay user info from Identity API
    const userInfo = await this.getEbayUserInfo(tokens.access_token);
    const ebayUserId = userInfo.userId;
    const ebayUsername = userInfo.username;

    // Encrypt tokens
    const accessTokenEncrypted = encryptToken(tokens.access_token);
    const refreshTokenEncrypted = encryptToken(tokens.refresh_token!);

    // Store or update account
    const { error: upsertError } = await this.supabase
      .from('ebay_accounts')
      .upsert(
        {
          user_id: storedState.user_id,
          ebay_user_id: ebayUserId,
          ebay_username: ebayUsername || null,
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          access_token_expires_at: accessTokenExpiresAt.toISOString(),
          refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
          scopes: EBAY_REQUIRED_SCOPES,
          marketplace_id: 'EBAY_US',
          status: 'active',
          connected_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,ebay_user_id',
        }
      );

    if (upsertError) {
      console.error('[eBay Auth] Failed to store account:', upsertError);
      throw new Error('Failed to save eBay connection');
    }

    console.log(`[eBay Auth] Successfully connected eBay account for user ${storedState.user_id}`);

    return {
      success: true,
      userId: storedState.user_id,
      redirectContext: storedState.redirect_context as EbayRedirectContext,
    };
  }

  /**
   * Get connected account status (safe for client)
   */
  async getConnectedAccount(userId: string): Promise<EbayConnectedAccount> {
    const { data: account, error } = await this.supabase
      .from('ebay_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error || !account) {
      return { connected: false };
    }

    const storedAccount = account as StoredEbayAccount;

    // Check if refresh token is expired
    const needsReauth = new Date(storedAccount.refresh_token_expires_at) < new Date();

    return {
      connected: true,
      ebay_username: storedAccount.ebay_username || undefined,
      connected_at: storedAccount.connected_at,
      needs_reauth: needsReauth,
      marketplace: 'EBAY_US',
    };
  }

  /**
   * Get valid access token for API calls (with auto-refresh)
   * INTERNAL USE ONLY - never expose tokens to client
   */
  async getAccessToken(userId: string): Promise<string> {
    const { data: account, error } = await this.supabase
      .from('ebay_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error || !account) {
      throw new Error('No connected eBay account');
    }

    const storedAccount = account as StoredEbayAccount;

    // Check if access token needs refresh
    if (tokenNeedsRefresh(storedAccount.access_token_expires_at)) {
      return this.refreshToken(storedAccount);
    }

    // Decrypt and return current token
    return decryptToken(storedAccount.access_token_encrypted);
  }

  /**
   * Refresh access token
   * INTERNAL USE ONLY
   */
  private async refreshToken(account: StoredEbayAccount): Promise<string> {
    // Check if refresh token is expired
    if (new Date(account.refresh_token_expires_at) < new Date()) {
      // Mark account as expired
      await this.supabase
        .from('ebay_accounts')
        .update({ status: 'expired' })
        .eq('id', account.id);

      throw new Error('eBay session expired. Please reconnect your account.');
    }

    // Decrypt refresh token
    const refreshToken = decryptToken(account.refresh_token_encrypted);

    // Call eBay to refresh
    const tokenResponse = await this.ebayClient.refreshAccessToken(refreshToken);

    if (!tokenResponse.success || !tokenResponse.data) {
      console.error('[eBay Auth] Token refresh failed:', tokenResponse.error);

      // Mark account as expired on auth errors
      if (tokenResponse.statusCode === 401) {
        await this.supabase
          .from('ebay_accounts')
          .update({ status: 'expired' })
          .eq('id', account.id);
      }

      throw new Error('Failed to refresh eBay token');
    }

    const tokens = tokenResponse.data;

    // Calculate new expiry
    const accessTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Encrypt new access token
    const accessTokenEncrypted = encryptToken(tokens.access_token);

    // Update stored token
    const { error: updateError } = await this.supabase
      .from('ebay_accounts')
      .update({
        access_token_encrypted: accessTokenEncrypted,
        access_token_expires_at: accessTokenExpiresAt.toISOString(),
        last_used_at: new Date().toISOString(),
      })
      .eq('id', account.id);

    if (updateError) {
      console.error('[eBay Auth] Failed to update token:', updateError);
    }

    console.log(`[eBay Auth] Refreshed token for user ${account.user_id}`);

    return tokens.access_token;
  }

  /**
   * Disconnect eBay account
   */
  async disconnect(userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ebay_accounts')
      .update({ status: 'revoked' })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      console.error('[eBay Auth] Failed to disconnect:', error);
      return false;
    }

    console.log(`[eBay Auth] Disconnected eBay account for user ${userId}`);
    return true;
  }

  /**
   * Get eBay user info from the Identity API
   *
   * Calls GET /commerce/identity/v1/user/ to retrieve the authenticated user's
   * eBay user ID and username.
   *
   * Per EBAY_SOURCE_OF_TRUTH.md Section 5:
   * "there is an OAuth getUser call (GetUser API or Identity API) if you need
   * the owner's eBay user ID"
   */
  private async getEbayUserInfo(
    accessToken: string
  ): Promise<{ userId: string; username?: string }> {
    try {
      const response = await this.ebayClient.authenticatedRequest<{
        userId: string;
        username?: string;
        accountType?: string;
      }>(accessToken, {
        method: 'GET',
        path: '/commerce/identity/v1/user/',
      });

      if (response.success && response.data) {
        console.log(`[eBay Auth] Retrieved user info: ${response.data.username || response.data.userId}`);
        return {
          userId: response.data.userId,
          username: response.data.username,
        };
      }

      // If Identity API fails, generate a fallback ID
      console.warn('[eBay Auth] Identity API call failed, using fallback user ID');
      return {
        userId: `ebay_${Date.now()}`,
        username: undefined,
      };
    } catch (error) {
      // Don't fail the entire OAuth flow if we can't get user info
      console.warn('[eBay Auth] Failed to get user info from Identity API:', error);
      return {
        userId: `ebay_${Date.now()}`,
        username: undefined,
      };
    }
  }

  /**
   * Cleanup expired auth states (call from cron)
   */
  async cleanupExpiredStates(): Promise<number> {
    const { data, error } = await this.supabase.rpc('cleanup_expired_ebay_auth_states');

    if (error) {
      console.error('[eBay Auth] Cleanup failed:', error);
      return 0;
    }

    return data || 0;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let serviceInstance: EbayAuthService | null = null;

/**
 * Get the singleton eBay auth service
 */
export function getEbayAuthService(): EbayAuthService {
  if (!serviceInstance) {
    serviceInstance = new EbayAuthService();
  }
  return serviceInstance;
}
