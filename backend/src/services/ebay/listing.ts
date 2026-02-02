/**
 * eBay Listing Service
 *
 * Handles the complete flow to publish a listing to eBay:
 * 1. Create/replace inventory item (SKU)
 * 2. Create offer
 * 3. Publish offer
 *
 * Uses eBay Sell Inventory API.
 * Requires user to have connected eBay account and configured policies.
 */

import { getEbayClient } from './client.js';
import { getEbayAuthService } from './auth.js';
import { getEbayPolicyService } from './policy.js';
import { getEbayLocationService } from './location.js';
import {
  generateEbaySku,
  type EbayInventoryItemPayload,
  type EbayOfferPayload,
  type EbayPublishResult,
  type EbayPublishStep,
  type EbayListingDraft,
} from '../../types/ebay-schemas.js';

// =============================================================================
// EBAY API RESPONSE TYPES
// =============================================================================

interface EbayCreateOfferResponse {
  offerId: string;
  warnings?: Array<{ errorId: string; message: string }>;
}

interface EbayPublishOfferResponse {
  listingId: string;
  warnings?: Array<{ errorId: string; message: string }>;
}

interface EbayErrorResponse {
  errors?: Array<{
    errorId: string;
    message: string;
    longMessage?: string;
    parameters?: Array<{ name: string; value: string }>;
  }>;
}

// =============================================================================
// CONDITION MAPPING
// =============================================================================

const CONDITION_MAP: Record<string, string> = {
  new: 'NEW',
  like_new: 'LIKE_NEW',
  very_good: 'VERY_GOOD',
  good: 'GOOD',
  fair: 'GOOD', // eBay doesn't have 'fair', map to good
  poor: 'ACCEPTABLE',
  // Direct mappings
  NEW: 'NEW',
  LIKE_NEW: 'LIKE_NEW',
  VERY_GOOD: 'VERY_GOOD',
  GOOD: 'GOOD',
  ACCEPTABLE: 'ACCEPTABLE',
};

// =============================================================================
// LISTING SERVICE
// =============================================================================

export class EbayListingService {
  private ebayClient: ReturnType<typeof getEbayClient>;
  private authService: ReturnType<typeof getEbayAuthService>;
  private policyService: ReturnType<typeof getEbayPolicyService>;
  private locationService: ReturnType<typeof getEbayLocationService>;

  constructor() {
    this.ebayClient = getEbayClient();
    this.authService = getEbayAuthService();
    this.policyService = getEbayPolicyService();
    this.locationService = getEbayLocationService();
  }

  /**
   * Publish a listing to eBay
   *
   * Full flow:
   * 1. Validate user has connected eBay account
   * 2. Validate user has required policies
   * 3. Create/update inventory item
   * 4. Create offer
   * 5. Publish offer
   * 6. Return listing URL with step-by-step progress
   */
  async publishListing(
    userId: string,
    draft: EbayListingDraft,
    policies: {
      fulfillment_policy_id: string;
      payment_policy_id: string;
      return_policy_id: string;
    }
  ): Promise<EbayPublishResult> {
    const attemptedAt = new Date().toISOString();
    const warnings: Array<{ code: string; message: string }> = [];

    // Initialize steps tracking
    const steps: EbayPublishStep[] = [
      { step: 1, name: 'inventory', status: 'pending' },
      { step: 2, name: 'offer', status: 'pending' },
      { step: 3, name: 'publish', status: 'pending' },
    ];

    try {
      console.log(`[eBay Listing] Starting publish for listing ${draft.listing_id}...`);

      // Pre-validation: eBay connection
      const account = await this.authService.getConnectedAccount(userId);
      if (!account.connected) {
        return this.errorResultWithSteps(
          'EBAY_NOT_CONNECTED',
          'Please connect your eBay account first',
          'reauth',
          attemptedAt,
          steps
        );
      }

      if (account.needs_reauth) {
        return this.errorResultWithSteps(
          'EBAY_REAUTH_REQUIRED',
          'Please reconnect your eBay account',
          'reauth',
          attemptedAt,
          steps
        );
      }

      // Pre-validation: Get access token
      const accessToken = await this.authService.getAccessToken(userId);

      // Pre-validation: Ensure inventory location exists (REQUIRED per EBAY_SOURCE_OF_TRUTH.md Section 7)
      const locationResult = await this.locationService.ensureLocationExists(userId);
      if (!locationResult.success || !locationResult.locationKey) {
        return this.errorResultWithSteps(
          'LOCATION_REQUIRED',
          locationResult.error || 'Please set up a shipping location before listing',
          'create_location',
          attemptedAt,
          steps
        );
      }
      const locationKey = locationResult.locationKey;
      console.log(`[eBay Listing] Using location: ${locationKey}`);

      // Generate SKU
      const sku = generateEbaySku(draft.listing_id);
      console.log(`[eBay Listing] Generated SKU: ${sku}`);

      // ===== STEP 1: Create/update inventory item =====
      steps[0].status = 'in_progress';
      const inventoryResult = await this.createInventoryItem(accessToken, sku, draft);
      if (!inventoryResult.success) {
        steps[0].status = 'failed';
        steps[0].error = inventoryResult.error;
        return this.errorResultWithSteps(
          'INVENTORY_ITEM_FAILED',
          inventoryResult.error || 'Failed to create inventory item',
          'retry',
          attemptedAt,
          steps,
          { sku }
        );
      }
      steps[0].status = 'complete';
      steps[0].item_sku = sku;

      // ===== STEP 2: Create offer =====
      steps[1].status = 'in_progress';
      const offerResult = await this.createOffer(accessToken, sku, draft, policies, locationKey);
      if (!offerResult.success || !offerResult.offerId) {
        steps[1].status = 'failed';
        steps[1].error = offerResult.error;
        return this.errorResultWithSteps(
          'OFFER_CREATE_FAILED',
          offerResult.error || 'Failed to create offer',
          'check_details',
          attemptedAt,
          steps,
          { sku }
        );
      }
      steps[1].status = 'complete';
      steps[1].offer_id = offerResult.offerId;

      if (offerResult.warnings) {
        warnings.push(...offerResult.warnings);
      }

      // ===== STEP 3: Publish offer =====
      steps[2].status = 'in_progress';
      const publishResult = await this.publishOffer(accessToken, offerResult.offerId);
      if (!publishResult.success || !publishResult.listingId) {
        steps[2].status = 'failed';
        steps[2].error = publishResult.error;
        return this.errorResultWithSteps(
          'OFFER_PUBLISH_FAILED',
          publishResult.error || 'Failed to publish offer',
          'retry',
          attemptedAt,
          steps,
          { offerId: offerResult.offerId, sku }
        );
      }
      steps[2].status = 'complete';
      steps[2].listing_id = publishResult.listingId;

      if (publishResult.warnings) {
        warnings.push(...publishResult.warnings);
      }

      // Success!
      const listingUrl = `https://www.ebay.com/itm/${publishResult.listingId}`;
      console.log(`[eBay Listing] Successfully published: ${listingUrl}`);

      return {
        success: true,
        listing_id: publishResult.listingId,
        offer_id: offerResult.offerId,
        sku,
        listing_url: listingUrl,
        steps,
        warnings: warnings.length > 0 ? warnings : undefined,
        published_at: new Date().toISOString(),
        attempted_at: attemptedAt,
      };
    } catch (error) {
      console.error('[eBay Listing] Publish error:', error);
      return this.errorResultWithSteps(
        'PUBLISH_ERROR',
        error instanceof Error ? error.message : 'Unknown error occurred',
        'retry',
        attemptedAt,
        steps
      );
    }
  }

  /**
   * Create or replace inventory item
   */
  private async createInventoryItem(
    accessToken: string,
    sku: string,
    draft: EbayListingDraft
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Build inventory item payload
      const payload: EbayInventoryItemPayload = {
        sku,
        locale: 'en_US',
        product: {
          title: draft.title,
          description: draft.description,
          imageUrls: draft.image_urls,
          aspects: this.convertToAspects(draft.item_specifics),
        },
        condition: CONDITION_MAP[draft.condition.id] || 'GOOD',
        conditionDescription: draft.condition.description,
        availability: {
          shipToLocationAvailability: {
            quantity: draft.quantity,
          },
        },
      };

      // PUT request to create/replace inventory item
      const response = await this.ebayClient.authenticatedRequest<void>(accessToken, {
        method: 'PUT',
        path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
        body: payload,
        headers: {
          'Content-Language': 'en-US',
        },
      });

      // 204 No Content = success, 200 = success with body
      if (response.statusCode === 204 || response.statusCode === 200) {
        console.log(`[eBay Listing] Inventory item created: ${sku}`);
        return { success: true };
      }

      const errorData = response.error;
      return {
        success: false,
        error: errorData?.error.message || `HTTP ${response.statusCode}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create offer for inventory item
   *
   * merchantLocationKey is REQUIRED per EBAY_SOURCE_OF_TRUTH.md Section 7:
   * "If you don't provide a location, you cannot publish"
   */
  private async createOffer(
    accessToken: string,
    sku: string,
    draft: EbayListingDraft,
    policies: {
      fulfillment_policy_id: string;
      payment_policy_id: string;
      return_policy_id: string;
    },
    locationKey: string
  ): Promise<{
    success: boolean;
    offerId?: string;
    warnings?: Array<{ code: string; message: string }>;
    error?: string;
  }> {
    try {
      // Log the merchantLocationKey being used
      console.log(`[eBay Publish] merchantLocationKey=${locationKey}`);

      // Assert merchantLocationKey is present
      if (!locationKey) {
        return {
          success: false,
          error: JSON.stringify({
            code: 'EBAY_MERCHANT_LOCATION_KEY_MISSING',
            message: 'merchantLocationKey is required but was not provided',
          }),
        };
      }

      const payload: EbayOfferPayload = {
        sku,
        marketplaceId: 'EBAY_US',
        format: 'FIXED_PRICE',
        categoryId: draft.category_id,
        merchantLocationKey: locationKey, // Required per EBAY_SOURCE_OF_TRUTH.md Section 7
        pricingSummary: {
          price: {
            value: draft.price.value.toFixed(2),
            currency: draft.price.currency,
          },
        },
        availableQuantity: draft.quantity,
        listingPolicies: {
          fulfillmentPolicyId: policies.fulfillment_policy_id,
          paymentPolicyId: policies.payment_policy_id,
          returnPolicyId: policies.return_policy_id,
        },
      };

      const response = await this.ebayClient.authenticatedRequest<EbayCreateOfferResponse>(
        accessToken,
        {
          method: 'POST',
          path: '/sell/inventory/v1/offer',
          body: payload,
          headers: {
            'Content-Language': 'en-US',
          },
        }
      );

      if (response.success && response.data?.offerId) {
        console.log(`[eBay Listing] Offer created: ${response.data.offerId}`);
        return {
          success: true,
          offerId: response.data.offerId,
          warnings: response.data.warnings?.map((w) => ({
            code: w.errorId,
            message: w.message,
          })),
        };
      }

      // Log full eBay error response
      const rawError = response.error ? JSON.stringify(response.error) : 'no error body';
      console.error('[eBay Publish] createOffer failed:', {
        status: response.statusCode,
        rawError,
        merchantLocationKey: locationKey,
      });

      // Check for shipping location error and provide user-friendly message
      const errorMessage = response.error?.error.message || 'Failed to create offer';
      let userMessage = errorMessage;
      if (errorMessage.toLowerCase().includes('shipping location required')) {
        userMessage = 'eBay requires an inventory location (warehouse). Your Ship From address is not sufficient - please verify your inventory location is set up correctly in eBay Seller Hub under "Manage Inventory Locations".';
        console.error('[eBay Publish] Shipping location error - raw eBay response:', rawError);
      }

      return {
        success: false,
        error: userMessage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Publish an offer to make it live
   */
  private async publishOffer(
    accessToken: string,
    offerId: string
  ): Promise<{
    success: boolean;
    listingId?: string;
    warnings?: Array<{ code: string; message: string }>;
    error?: string;
  }> {
    try {
      const response = await this.ebayClient.authenticatedRequest<EbayPublishOfferResponse>(
        accessToken,
        {
          method: 'POST',
          path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
        }
      );

      if (response.success && response.data?.listingId) {
        console.log(`[eBay Listing] Offer published, listing ID: ${response.data.listingId}`);
        return {
          success: true,
          listingId: response.data.listingId,
          warnings: response.data.warnings?.map((w) => ({
            code: w.errorId,
            message: w.message,
          })),
        };
      }

      // Log full eBay error response
      const rawError = response.error ? JSON.stringify(response.error) : 'no error body';
      console.error('[eBay Publish] publishOffer failed:', {
        status: response.statusCode,
        rawError,
        offerId,
      });

      // Check for shipping location error
      const errorMessage = response.error?.error.message || 'Failed to publish offer';
      let userMessage = errorMessage;
      if (errorMessage.toLowerCase().includes('shipping location required')) {
        userMessage = 'eBay requires an inventory location (warehouse). Please verify your inventory location exists and is ENABLED in eBay Seller Hub.';
        console.error('[eBay Publish] Shipping location error at publish - raw eBay response:', rawError);
      }

      return {
        success: false,
        error: userMessage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Convert item specifics to eBay aspects format
   */
  private convertToAspects(itemSpecifics: Record<string, string>): Record<string, string[]> {
    const aspects: Record<string, string[]> = {};

    for (const [key, value] of Object.entries(itemSpecifics)) {
      if (value) {
        aspects[key] = [value];
      }
    }

    return aspects;
  }

  /**
   * Build error result (legacy, for backward compatibility)
   */
  private errorResult(
    code: string,
    message: string,
    attemptedAt: string,
    partial?: { offerId?: string; sku?: string }
  ): EbayPublishResult {
    return {
      success: false,
      offer_id: partial?.offerId,
      sku: partial?.sku,
      error: {
        code,
        message,
      },
      attempted_at: attemptedAt,
    };
  }

  /**
   * Build error result with step progress
   */
  private errorResultWithSteps(
    code: string,
    message: string,
    action: string,
    attemptedAt: string,
    steps: EbayPublishStep[],
    partial?: { offerId?: string; sku?: string }
  ): EbayPublishResult {
    return {
      success: false,
      offer_id: partial?.offerId,
      sku: partial?.sku,
      steps,
      error: {
        code,
        message,
        action, // Suggested recovery action
      },
      attempted_at: attemptedAt,
    };
  }

  /**
   * Get listing status from eBay
   */
  async getListingStatus(
    userId: string,
    listingId: string
  ): Promise<{ status: string; url?: string }> {
    try {
      const accessToken = await this.authService.getAccessToken(userId);

      const response = await this.ebayClient.authenticatedRequest<{
        listingId: string;
        listingStatus: string;
      }>(accessToken, {
        method: 'GET',
        path: `/sell/inventory/v1/listing/${encodeURIComponent(listingId)}`,
      });

      if (response.success && response.data) {
        return {
          status: response.data.listingStatus,
          url: `https://www.ebay.com/itm/${listingId}`,
        };
      }

      return { status: 'unknown' };
    } catch (error) {
      console.error('[eBay Listing] Error getting status:', error);
      return { status: 'error' };
    }
  }

  /**
   * Build listing draft from our internal listing format
   */
  buildDraftFromListing(
    listingId: string,
    listingDraft: {
      title: { value: string };
      description: { value: string };
      category: { value: string; platformCategoryId?: string | null };
      condition: { value: string };
      brand?: { value: string | null };
      attributes: Array<{ key: string; value: string }>;
    },
    photoUrls: string[],
    price: number
  ): EbayListingDraft {
    // Build item specifics from attributes
    const itemSpecifics: Record<string, string> = {};

    if (listingDraft.brand?.value) {
      itemSpecifics['Brand'] = listingDraft.brand.value;
    }

    for (const attr of listingDraft.attributes) {
      itemSpecifics[attr.key] = attr.value;
    }

    return {
      listing_id: listingId,
      title: listingDraft.title.value.substring(0, 80), // eBay max 80 chars
      description: listingDraft.description.value,
      category_id: listingDraft.category.platformCategoryId || '99', // Default to "Everything Else"
      category_name: listingDraft.category.value,
      condition: {
        id: CONDITION_MAP[listingDraft.condition.value] || 'GOOD',
        description: listingDraft.condition.value,
      },
      price: {
        value: price,
        currency: 'USD',
      },
      quantity: 1,
      image_urls: photoUrls,
      item_specifics: itemSpecifics,
      format: 'FIXED_PRICE',
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: EbayListingService | null = null;

export function getEbayListingService(): EbayListingService {
  if (!serviceInstance) {
    serviceInstance = new EbayListingService();
  }
  return serviceInstance;
}
