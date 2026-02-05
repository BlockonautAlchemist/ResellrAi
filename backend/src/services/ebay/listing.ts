/**
 * eBay Listing Service
 *
 * Handles the complete 6-step pipeline to publish a listing to eBay:
 * 1. Location: Ensure inventory location exists and is ENABLED
 * 2. Inventory: Create/replace inventory item (SKU)
 * 3. Policies: Fetch/validate policies (use defaults if not provided)
 * 4. Offer: Create offer with policies and location
 * 5. Fees: (Optional) Get listing fees
 * 6. Publish: Publish offer to make it live
 *
 * Uses eBay Sell Inventory API.
 * Requires user to have connected eBay account.
 */

import { getEbayClient } from './client.js';
import { getEbayAuthService } from './auth.js';
import { getEbayPolicyService } from './policy.js';
import { getEbayLocationService } from './location.js';
import { generateTraceId, createPublishLogger, type PublishLogger } from './publish-logger.js';
import { validatePublishInput, formatValidationErrors, validateConditionForCategory, validateItemSpecificsForCategory } from './publish-validator.js';
import { getContentLanguageHeader } from './header-utils.js';
import {
  generateEbaySku,
  EbayInventoryItemPayloadSchema,
  type EbayInventoryItemPayload,
  type EbayOfferPayload,
  type EbayPublishResult,
  type EbayPublishStep,
  type EbayListingDraft,
  type EbayListingFees,
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
  // From internal condition IDs to valid eBay enums
  new: 'NEW',
  like_new: 'LIKE_NEW',
  very_good: 'USED_VERY_GOOD',
  good: 'USED_GOOD',
  fair: 'USED_GOOD', // eBay doesn't have 'fair', map to USED_GOOD
  poor: 'USED_ACCEPTABLE',
  // Direct eBay enum mappings (if already uppercase)
  NEW: 'NEW',
  LIKE_NEW: 'LIKE_NEW',
  USED_VERY_GOOD: 'USED_VERY_GOOD',
  USED_GOOD: 'USED_GOOD',
  USED_ACCEPTABLE: 'USED_ACCEPTABLE',
  USED_EXCELLENT: 'USED_EXCELLENT',
  NEW_OTHER: 'NEW_OTHER',
  NEW_WITH_DEFECTS: 'NEW_WITH_DEFECTS',
  SELLER_REFURBISHED: 'SELLER_REFURBISHED',
  MANUFACTURER_REFURBISHED: 'MANUFACTURER_REFURBISHED',
  CERTIFIED_REFURBISHED: 'CERTIFIED_REFURBISHED',
  FOR_PARTS_OR_NOT_WORKING: 'FOR_PARTS_OR_NOT_WORKING',
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
   * Publish a listing to eBay (backward-compatible wrapper)
   *
   * This method wraps publishFixedPriceListing for backward compatibility.
   * New code should use publishFixedPriceListing directly.
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
    return this.publishFixedPriceListing(userId, draft, policies);
  }

  /**
   * Publish a fixed-price listing to eBay using the 6-step pipeline
   *
   * Pipeline steps:
   * 1. Location: Ensure inventory location exists and is ENABLED
   * 2. Inventory: Create/replace inventory item (SKU)
   * 3. Policies: Fetch/validate policies (use defaults if not provided)
   * 4. Offer: Create offer with policies and location
   * 5. Fees: (Optional) Get listing fees
   * 6. Publish: Publish offer to make it live
   *
   * @param userId - User ID
   * @param draft - Listing draft with all required fields
   * @param policies - Optional policies (will fetch defaults if not provided)
   * @param options - Optional configuration (e.g., enableFees)
   */
  async publishFixedPriceListing(
    userId: string,
    draft: EbayListingDraft,
    policies?: {
      fulfillment_policy_id: string;
      payment_policy_id: string;
      return_policy_id: string;
    },
    options?: {
      enableFees?: boolean;
    }
  ): Promise<EbayPublishResult> {
    const traceId = generateTraceId();
    const logger = createPublishLogger(traceId);
    const attemptedAt = new Date().toISOString();
    const warnings: Array<{ code: string; message: string }> = [];

    // Initialize 6-step tracking
    const steps: EbayPublishStep[] = [
      { step: 1, name: 'location', status: 'pending' },
      { step: 2, name: 'inventory', status: 'pending' },
      { step: 3, name: 'policies', status: 'pending' },
      { step: 4, name: 'offer', status: 'pending' },
      { step: 5, name: 'fees', status: 'pending' },
      { step: 6, name: 'publish', status: 'pending' },
    ];

    // Helper to build error result with traceId
    const errorResult = (
      code: string,
      message: string,
      action: string,
      partial?: { offerId?: string; sku?: string; ebayErrorId?: string; missing?: string[]; invalid?: Array<{ aspect: string; value: string; allowed: string[] }> }
    ): EbayPublishResult => ({
      success: false,
      offer_id: partial?.offerId,
      sku: partial?.sku,
      steps,
      error: {
        code,
        message,
        action,
        ...(partial?.ebayErrorId && { ebay_error_id: partial.ebayErrorId }),
        ...(partial?.missing || partial?.invalid ? { details: { missing: partial.missing, invalid: partial.invalid } } : {}),
      },
      traceId,
      attempted_at: attemptedAt,
    });

    try {
      logger.logInfo('Starting publish pipeline', { listingId: draft.listing_id });

      // ===== STEP 0: Pre-Validation (before any eBay calls) =====
      const validation = validatePublishInput(draft, policies);
      if (!validation.valid) {
        const formatted = formatValidationErrors(validation.errors);
        for (const err of validation.errors) {
          logger.logValidationError(err.field, err.message);
        }
        return errorResult(formatted.code, formatted.message, 'check_details');
      }

      // Pre-validation: eBay connection
      const account = await this.authService.getConnectedAccount(userId);
      if (!account.connected) {
        return errorResult('EBAY_NOT_CONNECTED', 'Please connect your eBay account first', 'reauth');
      }
      if (account.needs_reauth) {
        return errorResult('EBAY_REAUTH_REQUIRED', 'Please reconnect your eBay account', 'reauth');
      }

      // Get access token
      const accessToken = await this.authService.getAccessToken(userId);

      // ===== STEP 0.5: Validate condition for category =====
      // This catches eBay error 25059 before we make any API calls
      if (draft.category_id && draft.condition?.id) {
        logger.logInfo('Validating condition for category', {
          categoryId: draft.category_id,
          conditionId: draft.condition.id,
        });
        const conditionValidation = await validateConditionForCategory(
          draft.category_id,
          draft.condition.id,
          accessToken
        );
        if (!conditionValidation.valid && conditionValidation.error) {
          logger.logValidationError(
            conditionValidation.error.field,
            conditionValidation.error.message
          );
          const validOptions = conditionValidation.validConditions
            ?.map((c) => `${c.label} (${c.apiEnum})`)
            .join(', ');
          return errorResult(
            'VALIDATION_CONDITION_INVALID_FOR_CATEGORY',
            `${conditionValidation.error.message}${validOptions ? `. Valid options: ${validOptions}` : ''}`,
            'check_details'
          );
        }
      }

      // ===== STEP 0.6: Validate item specifics for category =====
      // This catches eBay error 25002 (missing item specifics like Department) before we make API calls
      if (draft.category_id) {
        logger.logInfo('Validating item specifics for category', {
          categoryId: draft.category_id,
          itemSpecificsCount: String(Object.keys(draft.item_specifics || {}).length),
        });
        const itemSpecificsValidation = await validateItemSpecificsForCategory(
          draft.category_id,
          draft.item_specifics || {},
          accessToken
        );

        if (!itemSpecificsValidation.valid) {
          const missingList = itemSpecificsValidation.missing;
          const invalidList = itemSpecificsValidation.invalid;

          if (missingList.length > 0) {
            logger.logValidationError(
              'item_specifics',
              `Missing required item specifics: ${missingList.join(', ')}`
            );
            return errorResult(
              'MISSING_ITEM_SPECIFICS',
              `Required item specifics missing: ${missingList.join(', ')}`,
              'edit_item_specifics',
              { missing: missingList, invalid: invalidList }
            );
          }

          if (invalidList.length > 0) {
            const firstInvalid = invalidList[0];
            logger.logValidationError(
              'item_specifics',
              `Invalid value for ${firstInvalid.aspect}: "${firstInvalid.value}"`
            );
            return errorResult(
              'INVALID_ITEM_SPECIFIC_VALUE',
              `Invalid value for ${firstInvalid.aspect}: "${firstInvalid.value}". Allowed: ${firstInvalid.allowed.slice(0, 10).join(', ')}${firstInvalid.allowed.length > 10 ? '...' : ''}`,
              'edit_item_specifics',
              { missing: missingList, invalid: invalidList }
            );
          }
        }
      }

      // ===== STEP 1: Location =====
      logger.logStepStart('location');
      steps[0].status = 'in_progress';

      const locationResult = await this.locationService.ensureLocationExists(userId);
      if (!locationResult.success || !locationResult.locationKey) {
        steps[0].status = 'failed';
        steps[0].error = locationResult.error;
        logger.logStepFailed('location', locationResult.error || 'Failed to ensure location');
        return errorResult(
          'LOCATION_REQUIRED',
          locationResult.error || 'Please set up a shipping location before listing',
          'create_location'
        );
      }

      // Verify location is ENABLED
      const locationDetails = await this.locationService.getInventoryLocationByKey(
        userId,
        locationResult.locationKey
      );
      if (locationDetails.location?.merchantLocationStatus !== 'ENABLED') {
        steps[0].status = 'failed';
        steps[0].error = 'Location not ENABLED';
        logger.logStepFailed('location', `Location status: ${locationDetails.location?.merchantLocationStatus}`);
        return errorResult(
          'LOCATION_NOT_ENABLED',
          'Inventory location exists but is not ENABLED. Please enable it in eBay Seller Hub.',
          'check_details'
        );
      }

      const locationKey = locationResult.locationKey;
      steps[0].status = 'complete';
      steps[0].merchant_location_key = locationKey;
      logger.logStepComplete('location', { merchantLocationKey: locationKey, status: 'ENABLED' });

      // Generate SKU
      const sku = generateEbaySku(draft.listing_id);
      logger.logInfo('Generated SKU', { sku });

      // ===== STEP 2: Inventory Item =====
      logger.logStepStart('inventory');
      steps[1].status = 'in_progress';

      const inventoryResult = await this.createInventoryItemWithLogger(accessToken, sku, draft, logger);
      if (!inventoryResult.success) {
        steps[1].status = 'failed';
        steps[1].error = inventoryResult.error;
        logger.logStepFailed('inventory', inventoryResult.error || 'Failed to create inventory item');
        return errorResult(
          'INVENTORY_ITEM_FAILED',
          inventoryResult.error || 'Failed to create inventory item',
          'retry',
          { sku, ebayErrorId: inventoryResult.ebayErrorId }
        );
      }
      steps[1].status = 'complete';
      steps[1].item_sku = sku;
      logger.logStepComplete('inventory', { sku });

      // ===== STEP 3: Policies =====
      logger.logStepStart('policies');
      steps[2].status = 'in_progress';

      let resolvedPolicies = policies;
      if (!resolvedPolicies) {
        // Fetch default policies
        const defaultPolicies = await this.policyService.getDefaultPolicies(userId);
        if (!defaultPolicies.fulfillment_policy_id || !defaultPolicies.payment_policy_id || !defaultPolicies.return_policy_id) {
          steps[2].status = 'failed';
          steps[2].error = 'Missing required policies';
          logger.logStepFailed('policies', 'One or more default policies not found');
          return errorResult(
            'POLICIES_MISSING',
            'Missing required business policies. Please configure them in eBay Seller Hub.',
            'check_details'
          );
        }
        resolvedPolicies = {
          fulfillment_policy_id: defaultPolicies.fulfillment_policy_id,
          payment_policy_id: defaultPolicies.payment_policy_id,
          return_policy_id: defaultPolicies.return_policy_id,
        };
        logger.logInfo('Using default policies');
      }

      // Validate all 3 policies are present
      if (!resolvedPolicies.fulfillment_policy_id || !resolvedPolicies.payment_policy_id || !resolvedPolicies.return_policy_id) {
        steps[2].status = 'failed';
        steps[2].error = 'Incomplete policies';
        logger.logStepFailed('policies', 'All 3 policy IDs are required');
        return errorResult(
          'POLICIES_MISSING',
          'All 3 policy IDs are required (fulfillment, payment, return)',
          'check_details'
        );
      }

      steps[2].status = 'complete';
      logger.logStepComplete('policies', {
        fulfillment: resolvedPolicies.fulfillment_policy_id,
        payment: resolvedPolicies.payment_policy_id,
        return: resolvedPolicies.return_policy_id,
      });

      // ===== STEP 4: Create Offer =====
      logger.logStepStart('offer');
      steps[3].status = 'in_progress';

      const offerResult = await this.createOfferWithLogger(
        accessToken,
        sku,
        draft,
        resolvedPolicies,
        locationKey,
        logger
      );
      if (!offerResult.success || !offerResult.offerId) {
        steps[3].status = 'failed';
        steps[3].error = offerResult.error;
        logger.logStepFailed('offer', offerResult.error || 'Failed to create offer');
        return errorResult(
          'OFFER_CREATE_FAILED',
          offerResult.error || 'Failed to create offer',
          'check_details',
          { sku, ebayErrorId: offerResult.ebayErrorId }
        );
      }
      steps[3].status = 'complete';
      steps[3].offer_id = offerResult.offerId;
      logger.logStepComplete('offer', { offerId: offerResult.offerId });

      if (offerResult.warnings) {
        warnings.push(...offerResult.warnings);
      }

      // ===== STEP 5: Listing Fees (Optional) =====
      let fees: EbayListingFees | undefined;
      if (options?.enableFees) {
        logger.logStepStart('fees');
        steps[4].status = 'in_progress';

        const feesResult = await this.getListingFeesWithLogger(accessToken, offerResult.offerId, logger);
        if (feesResult.success && feesResult.fees) {
          fees = feesResult.fees;
          steps[4].status = 'complete';
          logger.logStepComplete('fees', { totalFee: feesResult.fees.total_fee?.value || '0' });
        } else {
          // Fees step is optional, so just skip on failure
          steps[4].status = 'skipped';
          logger.logStepSkipped('fees', feesResult.error || 'Failed to fetch fees');
        }
      } else {
        steps[4].status = 'skipped';
        logger.logStepSkipped('fees', 'Fees step disabled');
      }

      // ===== STEP 6: Publish Offer =====
      logger.logStepStart('publish');
      steps[5].status = 'in_progress';

      const publishResult = await this.publishOfferWithLogger(accessToken, offerResult.offerId, logger);
      if (!publishResult.success || !publishResult.listingId) {
        steps[5].status = 'failed';
        steps[5].error = publishResult.error;
        logger.logStepFailed('publish', publishResult.error || 'Failed to publish offer');
        return errorResult(
          'OFFER_PUBLISH_FAILED',
          publishResult.error || 'Failed to publish offer',
          'retry',
          { offerId: offerResult.offerId, sku, ebayErrorId: publishResult.ebayErrorId }
        );
      }
      steps[5].status = 'complete';
      steps[5].listing_id = publishResult.listingId;

      if (publishResult.warnings) {
        warnings.push(...publishResult.warnings);
      }

      // Success!
      const listingUrl = `https://www.ebay.com/itm/${publishResult.listingId}`;
      logger.logStepComplete('publish', { listingId: publishResult.listingId, listingUrl });

      return {
        success: true,
        listing_id: publishResult.listingId,
        offer_id: offerResult.offerId,
        sku,
        listing_url: listingUrl,
        steps,
        fees,
        warnings: warnings.length > 0 ? warnings : undefined,
        traceId,
        published_at: new Date().toISOString(),
        attempted_at: attemptedAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.logStepFailed('publish', `Unexpected error: ${errorMessage}`);
      console.error('[eBay Listing] Publish error:', error);
      return errorResult('PUBLISH_ERROR', errorMessage, 'retry');
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
      // Validate and build payload
      const validationResult = this.validateAndSanitizePayload(sku, draft);
      if (!validationResult.valid) {
        return { success: false, error: validationResult.error };
      }
      const payload = validationResult.payload;

      // PUT request to create/replace inventory item
      // NOTE: locale goes in Content-Language header, NOT in body
      const response = await this.ebayClient.authenticatedRequest<void>(accessToken, {
        method: 'PUT',
        path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
        body: payload,
        headers: getContentLanguageHeader(),
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
          headers: getContentLanguageHeader(),
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

  // =============================================================================
  // PRIVATE METHODS WITH LOGGER (6-step pipeline)
  // =============================================================================

  /**
   * Create or replace inventory item with structured logging
   */
  private async createInventoryItemWithLogger(
    accessToken: string,
    sku: string,
    draft: EbayListingDraft,
    logger: PublishLogger
  ): Promise<{ success: boolean; error?: string; ebayErrorId?: string }> {
    try {
      // Validate and build payload using centralized helper
      const validationResult = this.validateAndSanitizePayload(sku, draft);
      if (!validationResult.valid) {
        logger.logValidationError('payload', validationResult.error);
        return { success: false, error: validationResult.error };
      }
      const payload = validationResult.payload;

      const path = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
      // NOTE: locale goes in Content-Language header, NOT in body
      const response = await this.ebayClient.authenticatedRequest<void>(accessToken, {
        method: 'PUT',
        path,
        body: payload,
        headers: getContentLanguageHeader(),
      });

      logger.logApiCall({
        step: 'inventory',
        method: 'PUT',
        path,
        statusCode: response.statusCode,
        payloadKeys: ['sku', 'product', 'condition', 'availability'],
        safeValues: { sku },
      });

      if (response.statusCode === 204 || response.statusCode === 200) {
        return { success: true };
      }

      // Log raw error for debugging
      const errorInfo = response.error?.error;
      logger.logInfo('API error response', {
        status: String(response.statusCode),
        errorCode: errorInfo?.code || 'unknown',
        errorMessage: errorInfo?.message || 'no message',
        ebayErrorId: errorInfo?.ebay_error_id != null ? String(errorInfo.ebay_error_id) : 'none',
      });

      return {
        success: false,
        error: errorInfo?.message || `eBay API returned HTTP ${response.statusCode}`,
        ebayErrorId: errorInfo?.ebay_error_id != null ? String(errorInfo.ebay_error_id) : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create offer with structured logging
   */
  private async createOfferWithLogger(
    accessToken: string,
    sku: string,
    draft: EbayListingDraft,
    policies: {
      fulfillment_policy_id: string;
      payment_policy_id: string;
      return_policy_id: string;
    },
    locationKey: string,
    logger: PublishLogger
  ): Promise<{
    success: boolean;
    offerId?: string;
    warnings?: Array<{ code: string; message: string }>;
    error?: string;
    ebayErrorId?: string;
  }> {
    try {
      const payload: EbayOfferPayload = {
        sku,
        marketplaceId: 'EBAY_US',
        format: 'FIXED_PRICE',
        categoryId: draft.category_id,
        merchantLocationKey: locationKey,
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

      const path = '/sell/inventory/v1/offer';
      const response = await this.ebayClient.authenticatedRequest<EbayCreateOfferResponse>(
        accessToken,
        {
          method: 'POST',
          path,
          body: payload,
          headers: getContentLanguageHeader(),
        }
      );

      logger.logApiCall({
        step: 'offer',
        method: 'POST',
        path,
        statusCode: response.statusCode,
        payloadKeys: ['sku', 'marketplaceId', 'format', 'categoryId', 'merchantLocationKey', 'pricingSummary', 'listingPolicies'],
        safeValues: { sku, merchantLocationKey: locationKey, marketplaceId: 'EBAY_US' },
      });

      if (response.success && response.data?.offerId) {
        return {
          success: true,
          offerId: response.data.offerId,
          warnings: response.data.warnings?.map((w) => ({
            code: w.errorId,
            message: w.message,
          })),
        };
      }

      // Log raw error for debugging
      const errorInfo = response.error?.error;
      logger.logInfo('API error response', {
        status: String(response.statusCode),
        errorCode: errorInfo?.code || 'unknown',
        errorMessage: errorInfo?.message || 'no message',
        ebayErrorId: errorInfo?.ebay_error_id != null ? String(errorInfo.ebay_error_id) : 'none',
      });

      return {
        success: false,
        error: errorInfo?.message || `eBay API returned HTTP ${response.statusCode}`,
        ebayErrorId: errorInfo?.ebay_error_id != null ? String(errorInfo.ebay_error_id) : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get listing fees with structured logging
   */
  private async getListingFeesWithLogger(
    accessToken: string,
    offerId: string,
    logger: PublishLogger
  ): Promise<{
    success: boolean;
    fees?: EbayListingFees;
    error?: string;
  }> {
    try {
      const path = `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/get_listing_fees`;
      const response = await this.ebayClient.authenticatedRequest<{
        feeSummaries?: Array<{
          marketplaceId: string;
          fees?: Array<{
            feeType: string;
            amount: { value: string; currency: string };
          }>;
        }>;
      }>(accessToken, {
        method: 'POST',
        path,
      });

      logger.logApiCall({
        step: 'fees',
        method: 'POST',
        path,
        statusCode: response.statusCode,
        safeValues: { offerId },
      });

      if (response.success && response.data?.feeSummaries) {
        const summary = response.data.feeSummaries[0];
        const listingFees = summary?.fees?.map((f) => ({
          fee_type: f.feeType,
          amount: f.amount,
        }));

        // Calculate total fee
        let totalValue = 0;
        let currency = 'USD';
        for (const fee of listingFees || []) {
          totalValue += parseFloat(fee.amount.value);
          currency = fee.amount.currency;
        }

        return {
          success: true,
          fees: {
            marketplace_id: 'EBAY_US',
            listing_fees: listingFees,
            total_fee: {
              value: totalValue.toFixed(2),
              currency,
            },
          },
        };
      }

      return {
        success: false,
        error: 'Failed to fetch listing fees',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Publish offer with structured logging
   */
  private async publishOfferWithLogger(
    accessToken: string,
    offerId: string,
    logger: PublishLogger
  ): Promise<{
    success: boolean;
    listingId?: string;
    warnings?: Array<{ code: string; message: string }>;
    error?: string;
    ebayErrorId?: string;
  }> {
    try {
      const path = `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`;
      const response = await this.ebayClient.authenticatedRequest<EbayPublishOfferResponse>(
        accessToken,
        {
          method: 'POST',
          path,
        }
      );

      logger.logApiCall({
        step: 'publish',
        method: 'POST',
        path,
        statusCode: response.statusCode,
        safeValues: { offerId },
      });

      if (response.success && response.data?.listingId) {
        return {
          success: true,
          listingId: response.data.listingId,
          warnings: response.data.warnings?.map((w) => ({
            code: w.errorId,
            message: w.message,
          })),
        };
      }

      // Log raw error for debugging
      const errorInfo = response.error?.error;
      logger.logInfo('API error response', {
        status: String(response.statusCode),
        errorCode: errorInfo?.code || 'unknown',
        errorMessage: errorInfo?.message || 'no message',
        ebayErrorId: errorInfo?.ebay_error_id != null ? String(errorInfo.ebay_error_id) : 'none',
      });

      return {
        success: false,
        error: errorInfo?.message || `eBay API returned HTTP ${response.statusCode}`,
        ebayErrorId: errorInfo?.ebay_error_id != null ? String(errorInfo.ebay_error_id) : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate and sanitize inventory item payload before sending to eBay
   * Ensures all fields match eBay's schema requirements
   */
  private validateAndSanitizePayload(
    sku: string,
    draft: EbayListingDraft
  ): { valid: true; payload: EbayInventoryItemPayload } | { valid: false; error: string } {
    // Ensure imageUrls is array with valid entries
    const imageUrls = Array.isArray(draft.image_urls)
      ? draft.image_urls.filter(url => typeof url === 'string' && url.length > 0)
      : [];

    if (imageUrls.length === 0) {
      return { valid: false, error: 'At least one image URL is required' };
    }

    // Map condition to valid eBay enum
    const conditionInput = draft.condition.id;
    const condition = CONDITION_MAP[conditionInput] || CONDITION_MAP[conditionInput.toUpperCase()];
    if (!condition) {
      return { valid: false, error: `Invalid condition: ${conditionInput}` };
    }

    // Ensure quantity is a positive integer
    const quantity = Math.max(0, Math.floor(Number(draft.quantity) || 1));

    // Validate aspects are properly shaped
    const aspects = this.convertToAspects(draft.item_specifics);

    const payload: EbayInventoryItemPayload = {
      sku,
      // NOTE: locale is NOT included - it goes in Content-Language header only
      product: {
        title: draft.title.substring(0, 80),
        description: draft.description.substring(0, 4000),
        imageUrls,
        aspects,
      },
      condition: condition as EbayInventoryItemPayload['condition'],
      conditionDescription: draft.condition.description || undefined,
      availability: {
        shipToLocationAvailability: { quantity },
      },
    };

    // Final validation with Zod schema
    const result = EbayInventoryItemPayloadSchema.safeParse(payload);
    if (!result.success) {
      const errors = result.error.issues.map(i => i.message).join(', ');
      return { valid: false, error: `Payload validation failed: ${errors}` };
    }

    return { valid: true, payload: result.data };
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
