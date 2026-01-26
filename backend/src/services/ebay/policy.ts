/**
 * eBay Policy Service
 *
 * Fetches user's existing fulfillment, payment, and return policies from eBay.
 * Users manage policies directly in eBay Seller Hub - we only fetch and display.
 *
 * Policies are required when creating offers:
 * - fulfillmentPolicyId: Shipping/handling settings
 * - paymentPolicyId: Payment method settings
 * - returnPolicyId: Return policy settings
 */

import { getEbayClient } from './client.js';
import { getEbayAuthService } from './auth.js';
import {
  type EbayFulfillmentPolicy,
  type EbayPaymentPolicy,
  type EbayReturnPolicy,
  type EbayUserPolicies,
} from '../../types/ebay-schemas.js';

// =============================================================================
// EBAY API RESPONSE TYPES
// =============================================================================

interface EbayFulfillmentPolicyResponse {
  fulfillmentPolicies?: Array<{
    fulfillmentPolicyId: string;
    name: string;
    marketplaceId: string;
    shippingOptions?: Array<{
      shippingServices?: Array<{
        shippingServiceCode: string;
        shippingCost?: { value: string; currency: string };
      }>;
    }>;
  }>;
}

interface EbayPaymentPolicyResponse {
  paymentPolicies?: Array<{
    paymentPolicyId: string;
    name: string;
    marketplaceId: string;
    paymentMethods?: Array<{
      paymentMethodType: string;
    }>;
  }>;
}

interface EbayReturnPolicyResponse {
  returnPolicies?: Array<{
    returnPolicyId: string;
    name: string;
    marketplaceId: string;
    returnsAccepted: boolean;
    returnPeriod?: {
      value: number;
      unit: string;
    };
  }>;
}

// =============================================================================
// CACHE
// =============================================================================

interface PolicyCache {
  policies: EbayUserPolicies;
  expiresAt: number;
}

const policyCache = new Map<string, PolicyCache>();
const POLICY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// =============================================================================
// POLICY SERVICE
// =============================================================================

export class EbayPolicyService {
  private ebayClient: ReturnType<typeof getEbayClient>;
  private authService: ReturnType<typeof getEbayAuthService>;

  constructor() {
    this.ebayClient = getEbayClient();
    this.authService = getEbayAuthService();
  }

  /**
   * Get all user policies (fulfillment, payment, return)
   */
  async getUserPolicies(userId: string): Promise<EbayUserPolicies> {
    // Check cache
    const cached = policyCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[eBay Policy] Cache hit for user ${userId}`);
      return cached.policies;
    }

    console.log(`[eBay Policy] Fetching policies for user ${userId}...`);

    // Get access token
    const accessToken = await this.authService.getAccessToken(userId);

    // Fetch all policy types in parallel
    const [fulfillment, payment, returnPolicies] = await Promise.all([
      this.fetchFulfillmentPolicies(accessToken),
      this.fetchPaymentPolicies(accessToken),
      this.fetchReturnPolicies(accessToken),
    ]);

    const policies: EbayUserPolicies = {
      fulfillment,
      payment,
      return: returnPolicies,
      fetched_at: new Date().toISOString(),
    };

    // Cache result
    policyCache.set(userId, {
      policies,
      expiresAt: Date.now() + POLICY_CACHE_TTL_MS,
    });

    console.log(
      `[eBay Policy] Fetched ${fulfillment.length} fulfillment, ${payment.length} payment, ${returnPolicies.length} return policies`
    );

    return policies;
  }

  /**
   * Fetch fulfillment (shipping) policies
   */
  private async fetchFulfillmentPolicies(
    accessToken: string
  ): Promise<EbayFulfillmentPolicy[]> {
    try {
      const response = await this.ebayClient.authenticatedRequest<EbayFulfillmentPolicyResponse>(
        accessToken,
        {
          method: 'GET',
          path: '/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US',
        }
      );

      if (!response.success || !response.data?.fulfillmentPolicies) {
        console.warn('[eBay Policy] No fulfillment policies found');
        return [];
      }

      return response.data.fulfillmentPolicies.map((p) => ({
        policy_id: p.fulfillmentPolicyId,
        name: p.name,
        marketplace_id: 'EBAY_US',
        shipping_options: (p.shippingOptions || []).flatMap((opt) =>
          (opt.shippingServices || []).map((svc) => ({
            shipping_service: svc.shippingServiceCode,
            cost: svc.shippingCost ? parseFloat(svc.shippingCost.value) : undefined,
          }))
        ),
      }));
    } catch (error) {
      console.error('[eBay Policy] Error fetching fulfillment policies:', error);
      return [];
    }
  }

  /**
   * Fetch payment policies
   */
  private async fetchPaymentPolicies(accessToken: string): Promise<EbayPaymentPolicy[]> {
    try {
      const response = await this.ebayClient.authenticatedRequest<EbayPaymentPolicyResponse>(
        accessToken,
        {
          method: 'GET',
          path: '/sell/account/v1/payment_policy?marketplace_id=EBAY_US',
        }
      );

      if (!response.success || !response.data?.paymentPolicies) {
        console.warn('[eBay Policy] No payment policies found');
        return [];
      }

      return response.data.paymentPolicies.map((p) => ({
        policy_id: p.paymentPolicyId,
        name: p.name,
        marketplace_id: 'EBAY_US',
        payment_methods: (p.paymentMethods || []).map((m) => m.paymentMethodType),
      }));
    } catch (error) {
      console.error('[eBay Policy] Error fetching payment policies:', error);
      return [];
    }
  }

  /**
   * Fetch return policies
   */
  private async fetchReturnPolicies(accessToken: string): Promise<EbayReturnPolicy[]> {
    try {
      const response = await this.ebayClient.authenticatedRequest<EbayReturnPolicyResponse>(
        accessToken,
        {
          method: 'GET',
          path: '/sell/account/v1/return_policy?marketplace_id=EBAY_US',
        }
      );

      if (!response.success || !response.data?.returnPolicies) {
        console.warn('[eBay Policy] No return policies found');
        return [];
      }

      return response.data.returnPolicies.map((p) => ({
        policy_id: p.returnPolicyId,
        name: p.name,
        marketplace_id: 'EBAY_US',
        returns_accepted: p.returnsAccepted,
        return_period: p.returnPeriod
          ? `${p.returnPeriod.value} ${p.returnPeriod.unit}`
          : undefined,
      }));
    } catch (error) {
      console.error('[eBay Policy] Error fetching return policies:', error);
      return [];
    }
  }

  /**
   * Check if user has all required policies
   */
  async hasRequiredPolicies(userId: string): Promise<{
    valid: boolean;
    missing: string[];
  }> {
    const policies = await this.getUserPolicies(userId);
    const missing: string[] = [];

    if (policies.fulfillment.length === 0) {
      missing.push('fulfillment (shipping)');
    }
    if (policies.payment.length === 0) {
      missing.push('payment');
    }
    if (policies.return.length === 0) {
      missing.push('return');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Clear cache for a user (call after policy changes)
   */
  clearCache(userId: string): void {
    policyCache.delete(userId);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: EbayPolicyService | null = null;

export function getEbayPolicyService(): EbayPolicyService {
  if (!serviceInstance) {
    serviceInstance = new EbayPolicyService();
  }
  return serviceInstance;
}
