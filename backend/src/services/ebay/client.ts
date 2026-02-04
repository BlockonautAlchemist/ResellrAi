/**
 * eBay API Client
 *
 * Low-level HTTP client for eBay API calls with:
 * - Environment-aware base URLs (sandbox/production)
 * - Authentication header injection
 * - Retry logic with exponential backoff
 * - Rate limit handling
 * - Structured error responses
 *
 * Security: This client handles tokens server-side only.
 */

import { env } from '../../config/env.js';
import {
  EBAY_API_URLS,
  EbayApiErrorSchema,
  type EbayApiError,
} from '../../types/ebay-schemas.js';
import {
  sanitizeHeaders,
  redactSensitiveHeaders,
} from './header-utils.js';

// =============================================================================
// TYPES
// =============================================================================

export interface EbayApiConfig {
  environment: 'sandbox' | 'production';
  clientId: string;
  clientSecret: string;
}

export interface EbayRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  accessToken?: string;
  timeout?: number;
}

export interface EbayApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: EbayApiError;
  statusCode: number;
  headers: Record<string, string>;
}

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
};

// =============================================================================
// EBAY API CLIENT CLASS
// =============================================================================

export class EbayApiClient {
  private config: EbayApiConfig;
  private urls: typeof EBAY_API_URLS.sandbox;

  constructor(config?: Partial<EbayApiConfig>) {
    this.config = {
      environment: config?.environment ?? (env.EBAY_ENVIRONMENT as 'sandbox' | 'production'),
      clientId: config?.clientId ?? env.EBAY_CLIENT_ID ?? '',
      clientSecret: config?.clientSecret ?? env.EBAY_CLIENT_SECRET ?? '',
    };

    this.urls = EBAY_API_URLS[this.config.environment];
  }

  /**
   * Check if eBay credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.config.clientId && this.config.clientSecret);
  }

  /**
   * Get the OAuth authorization URL
   */
  getAuthUrl(): string {
    return this.urls.auth;
  }

  /**
   * Get the token endpoint URL
   */
  getTokenUrl(): string {
    return this.urls.token;
  }

  /**
   * Get the API base URL
   */
  getApiBaseUrl(): string {
    return this.urls.api;
  }

  /**
   * Get Basic auth header for client credentials
   */
  getBasicAuthHeader(): string {
    const credentials = `${this.config.clientId}:${this.config.clientSecret}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<EbayApiResponse<EbayTokenResponse>> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    return this.request<EbayTokenResponse>({
      method: 'POST',
      path: '/identity/v1/oauth2/token',
      body: body.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: this.getBasicAuthHeader(),
      },
    });
  }

  /**
   * Refresh an access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string
  ): Promise<EbayApiResponse<EbayTokenResponse>> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    return this.request<EbayTokenResponse>({
      method: 'POST',
      path: '/identity/v1/oauth2/token',
      body: body.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: this.getBasicAuthHeader(),
      },
    });
  }

  /**
   * Make an authenticated API request
   */
  async authenticatedRequest<T>(
    accessToken: string,
    options: Omit<EbayRequestOptions, 'accessToken'>
  ): Promise<EbayApiResponse<T>> {
    return this.request<T>({
      ...options,
      accessToken,
    });
  }

  /**
   * Core request method with retry logic
   */
  async request<T>(options: EbayRequestOptions): Promise<EbayApiResponse<T>> {
    const { method, path, body, headers = {}, accessToken, timeout = 30000 } = options;

    const url = `${this.urls.api}${path}`;

    // Sanitize custom headers (removes Accept-Language, validates Content-Language)
    const sanitizedCustomHeaders = sanitizeHeaders(headers);

    // Build headers - explicitly exclude Accept-Language as eBay Sell Inventory API
    // rejects it with error 25709 (even valid values like "en-US" may be rejected)
    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...sanitizedCustomHeaders,
    };

    if (accessToken) {
      requestHeaders['Authorization'] = `Bearer ${accessToken}`;
    }

    // Prepare body
    let requestBody: string | undefined;
    if (body) {
      if (typeof body === 'string') {
        requestBody = body;
      } else {
        requestBody = JSON.stringify(body);
        if (!requestHeaders['Content-Type']) {
          requestHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    // Right before fetch, enforce eBay Inventory API header requirements
    if (path.includes('/sell/inventory/')) {
      // Remove any existing Accept-Language variants first (case-insensitive cleanup)
      for (const key of Object.keys(requestHeaders)) {
        if (key.trim().toLowerCase() === 'accept-language') {
          delete requestHeaders[key];
        }
      }
      // Force-set required headers with exact values (no q-values, exact dash format)
      requestHeaders['Accept-Language'] = 'en-US';
      requestHeaders['Content-Language'] = 'en-US';
      if (requestBody) {
        requestHeaders['Content-Type'] = 'application/json';
      }

      // Debug logging
      const redacted = redactSensitiveHeaders(requestHeaders);
      console.log(`[eBay API DEBUG] ${method} ${path}`);
      console.log(`[eBay API DEBUG] Final headers: ${JSON.stringify(redacted)}`);
    }

    // Execute with retries
    let lastError: Error | null = null;
    let lastResponse: EbayApiResponse<T> | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Create Request object to inspect actual wire-level headers
        const req = new Request(url, {
          method,
          headers: requestHeaders,
          body: requestBody,
          signal: controller.signal,
        });

        // Log what fetch will actually send (wire-level headers)
        if (path.includes('/sell/inventory/')) {
          console.log('[WIRE] Headers to be sent:', [...req.headers.entries()]);
        }

        const response = await fetch(req);

        clearTimeout(timeoutId);

        // Parse response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key.toLowerCase()] = value;
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(responseHeaders['retry-after'] || '60', 10);
          console.warn(`[eBay API] Rate limited. Retry after ${retryAfter}s`);

          if (attempt < RETRY_CONFIG.maxRetries) {
            await this.delay(retryAfter * 1000);
            continue;
          }
        }

        // Parse response body
        let data: T | undefined;
        let error: EbayApiError | undefined;

        const contentType = responseHeaders['content-type'] || '';
        if (contentType.includes('application/json')) {
          const json = await response.json();

          if (response.ok) {
            data = json as T;
          } else {
            // Log raw response body for non-2xx to see nested errors[]
            console.log(`[eBay API ERROR] Status ${response.status} raw body:`, JSON.stringify(json, null, 2));
            error = this.parseEbayError(json, response.status);
          }
        } else {
          // Non-JSON response
          if (!response.ok) {
            const text = await response.text();
            // Log raw response body for non-2xx
            console.log(`[eBay API ERROR] Status ${response.status} raw body (non-JSON):`, text.slice(0, 2000));
            error = {
              error: {
                code: `HTTP_${response.status}`,
                message: text.slice(0, 500),
              },
              request_id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            };
          }
        }

        lastResponse = {
          success: response.ok,
          data,
          error,
          statusCode: response.status,
          headers: responseHeaders,
        };

        // Retry on server errors
        if (RETRY_CONFIG.retryableStatuses.includes(response.status) && attempt < RETRY_CONFIG.maxRetries) {
          const delay = Math.min(
            RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffFactor, attempt),
            RETRY_CONFIG.maxDelayMs
          );
          console.warn(`[eBay API] Request failed with ${response.status}, retrying in ${delay}ms...`);
          await this.delay(delay);
          continue;
        }

        return lastResponse;
      } catch (err) {
        lastError = err as Error;

        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = Math.min(
            RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffFactor, attempt),
            RETRY_CONFIG.maxDelayMs
          );
          console.warn(`[eBay API] Request error: ${lastError.message}, retrying in ${delay}ms...`);
          await this.delay(delay);
          continue;
        }
      }
    }

    // All retries exhausted
    if (lastResponse) {
      return lastResponse;
    }

    // Return error response
    return {
      success: false,
      error: {
        error: {
          code: 'NETWORK_ERROR',
          message: lastError?.message || 'Request failed after retries',
        },
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
      statusCode: 0,
      headers: {},
    };
  }

  /**
   * Parse eBay error response into standard format
   */
  private parseEbayError(json: unknown, statusCode: number): EbayApiError {
    // eBay errors come in various formats
    const errorObj = json as Record<string, unknown>;

    // Standard OAuth error format
    if (errorObj.error && typeof errorObj.error === 'string') {
      return {
        error: {
          code: errorObj.error as string,
          message: (errorObj.error_description as string) || 'Authentication error',
        },
        recovery: this.getRecoveryAction(statusCode, errorObj.error as string),
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };
    }

    // eBay API error format
    if (errorObj.errors && Array.isArray(errorObj.errors)) {
      const firstError = errorObj.errors[0] as Record<string, unknown>;
      const errorId = firstError.errorId != null ? String(firstError.errorId) : undefined;
      return {
        error: {
          code: errorId || 'EBAY_ERROR',
          message: (firstError.message as string) || 'eBay API error',
          ebay_error_id: errorId,
        },
        recovery: this.getRecoveryAction(statusCode, errorId || 'EBAY_ERROR'),
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };
    }

    // Unknown format
    return {
      error: {
        code: 'UNKNOWN_ERROR',
        message: JSON.stringify(json),
      },
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Determine recovery action based on error
   */
  private getRecoveryAction(
    statusCode: number,
    errorCode: string
  ): EbayApiError['recovery'] {
    // Auth errors
    if (statusCode === 401 || errorCode === 'invalid_token') {
      return { action: 'reauth', message: 'Please reconnect your eBay account' };
    }

    // Rate limiting
    if (statusCode === 429) {
      return { action: 'retry', retry_after: 60, message: 'Too many requests, please wait' };
    }

    // Server errors
    if (statusCode >= 500) {
      return { action: 'retry', retry_after: 5, message: 'eBay service temporarily unavailable' };
    }

    return { action: 'none' };
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// TOKEN RESPONSE TYPE
// =============================================================================

export interface EbayTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
  refresh_token?: string;
  refresh_token_expires_in?: number; // seconds
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let clientInstance: EbayApiClient | null = null;

/**
 * Get the singleton eBay API client
 */
export function getEbayClient(): EbayApiClient {
  if (!clientInstance) {
    clientInstance = new EbayApiClient();
  }
  return clientInstance;
}

/**
 * Check if eBay integration is available
 */
export function isEbayAvailable(): boolean {
  return getEbayClient().isConfigured();
}
