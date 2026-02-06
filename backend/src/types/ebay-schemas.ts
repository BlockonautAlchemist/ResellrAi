/**
 * ResellrAI eBay Integration Type Definitions
 *
 * Canonical TypeScript types and Zod validators for eBay integration.
 * Derived from ebay_schemas.md - these schemas are the source of truth.
 *
 * Scope Constraints (v1):
 * - Marketplace: EBAY_US only
 * - Format: Fixed price only (no auctions)
 * - Environment: Sandbox first
 */

import { z } from 'zod';

// =============================================================================
// DATETIME HELPERS
// =============================================================================

/**
 * Loose datetime validator that accepts ISO datetime strings with timezone offsets.
 * Converts "+00:00" suffix to "Z" before parsing, since Zod's datetime() only accepts "Z".
 */
const DateTimeLoose = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/\+00:00$/, 'Z') : v),
  z.string().datetime()
);

// =============================================================================
// ENUMS
// =============================================================================

export const EbayMarketplaceEnum = z.enum(['EBAY_US']);
export type EbayMarketplace = z.infer<typeof EbayMarketplaceEnum>;

export const EbayConditionEnum = z.enum([
  'NEW',
  'LIKE_NEW',
  'NEW_OTHER',
  'NEW_WITH_DEFECTS',
  'MANUFACTURER_REFURBISHED',
  'CERTIFIED_REFURBISHED',
  'SELLER_REFURBISHED',
  'USED_EXCELLENT',
  'USED_VERY_GOOD',
  'USED_GOOD',
  'USED_ACCEPTABLE',
  'FOR_PARTS_OR_NOT_WORKING',
]);
export type EbayCondition = z.infer<typeof EbayConditionEnum>;

export const EbayCompsSourceEnum = z.enum(['sold', 'active', 'none']);
export type EbayCompsSource = z.infer<typeof EbayCompsSourceEnum>;

export const EbayCompsConfidenceEnum = z.enum(['high', 'medium', 'low', 'none']);
export type EbayCompsConfidence = z.infer<typeof EbayCompsConfidenceEnum>;

export const EbayAccountStatusEnum = z.enum(['active', 'expired', 'revoked']);
export type EbayAccountStatus = z.infer<typeof EbayAccountStatusEnum>;

export const EbayRedirectContextEnum = z.enum(['mobile', 'web']);
export type EbayRedirectContext = z.infer<typeof EbayRedirectContextEnum>;

export const EbayErrorRecoveryActionEnum = z.enum([
  'retry',
  'reauth',
  'contact_support',
  'none',
]);
export type EbayErrorRecoveryAction = z.infer<typeof EbayErrorRecoveryActionEnum>;

// =============================================================================
// OAUTH / AUTHENTICATION SCHEMAS
// =============================================================================

/**
 * Request to initiate OAuth flow
 */
export const EbayAuthStartRequestSchema = z.object({
  user_id: z.string().uuid(),
  scopes: z.array(z.string()).optional(),
  redirect_context: EbayRedirectContextEnum,
});
export type EbayAuthStartRequest = z.infer<typeof EbayAuthStartRequestSchema>;

/**
 * Response containing OAuth URL for user redirect
 */
export const EbayAuthStartResponseSchema = z.object({
  auth_url: z.string().url(),
  state: z.string().min(32),
  expires_at: z.string().datetime(),
});
export type EbayAuthStartResponse = z.infer<typeof EbayAuthStartResponseSchema>;

/**
 * Payload received from eBay OAuth callback
 */
export const EbayAuthCallbackPayloadSchema = z.object({
  code: z.string(),
  state: z.string(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});
export type EbayAuthCallbackPayload = z.infer<typeof EbayAuthCallbackPayloadSchema>;

/**
 * Internal token storage (NEVER sent to client)
 */
export const EbayTokenSetSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string().default('User Access Token'),
  scopes: z.array(z.string()),
  access_token_expires_at: z.string().datetime(),
  refresh_token_expires_at: z.string().datetime(),
  ebay_user_id: z.string(),
});
export type EbayTokenSet = z.infer<typeof EbayTokenSetSchema>;

/**
 * User-facing account status (safe for client)
 */
export const EbayConnectedAccountSchema = z.object({
  connected: z.boolean(),
  ebay_username: z.string().optional(),
  connected_at: DateTimeLoose.optional(),
  needs_reauth: z.boolean().optional(),
  marketplace: EbayMarketplaceEnum.optional(),
});
export type EbayConnectedAccount = z.infer<typeof EbayConnectedAccountSchema>;

// =============================================================================
// PRICING COMPS SCHEMAS
// =============================================================================

/**
 * Input query for pricing comparables
 */
export const EbayCompsQuerySchema = z.object({
  keywords: z.string().min(1).max(350),
  category_id: z.string().optional(),
  condition: EbayConditionEnum.optional(),
  brand: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  marketplace_id: EbayMarketplaceEnum.default('EBAY_US'),
});
export type EbayCompsQuery = z.infer<typeof EbayCompsQuerySchema>;

/**
 * Single comparable item
 */
export const EbayCompItemSchema = z.object({
  item_id: z.string(),
  title: z.string(),
  price: z.object({
    value: z.number(),
    currency: z.string().default('USD'),
  }),
  shipping_cost: z.number().default(0),
  total_cost: z.number(), // price + shipping
  condition: z.string(),
  item_url: z.string().url(),
  image_url: z.string().url().optional(),
  sold_date: z.string().datetime().optional(),
  seller: z
    .object({
      username: z.string(),
      feedback_score: z.number().optional(),
    })
    .optional(),
});
export type EbayCompItem = z.infer<typeof EbayCompItemSchema>;

/**
 * Statistical summary of comps
 */
export const EbayCompsStatsSchema = z.object({
  median: z.number().nullable(),
  average: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  sample_size: z.number().int().min(0),
  confidence: EbayCompsConfidenceEnum,
});
export type EbayCompsStats = z.infer<typeof EbayCompsStatsSchema>;

/**
 * Complete pricing comps response
 */
export const EbayCompsResultSchema = z.object({
  source: EbayCompsSourceEnum,
  data: z.array(EbayCompItemSchema),
  stats: EbayCompsStatsSchema,
  limitations: z.array(z.string()),
  query: z.object({
    keywords: z.string(),
    category_id: z.string().optional(),
    marketplace_id: EbayMarketplaceEnum,
    executed_at: z.string().datetime(),
  }),
  cached: z.boolean(),
  cache_age: z.number().optional(), // seconds since cached
  cache_expires_at: z.string().datetime().optional(),
});
export type EbayCompsResult = z.infer<typeof EbayCompsResultSchema>;

// =============================================================================
// PACKAGE WEIGHT AND DIMENSIONS SCHEMA
// =============================================================================

export const WeightUnitEnum = z.enum(['OUNCE', 'POUND']);
export type WeightUnit = z.infer<typeof WeightUnitEnum>;

export const DimensionUnitEnum = z.enum(['INCH', 'CENTIMETER']);
export type DimensionUnit = z.infer<typeof DimensionUnitEnum>;

/**
 * Package weight for shipping
 */
export const PackageWeightSchema = z.object({
  value: z.number().positive(),
  unit: WeightUnitEnum,
});
export type PackageWeight = z.infer<typeof PackageWeightSchema>;

/**
 * Package dimensions for shipping
 */
export const PackageDimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: DimensionUnitEnum,
});
export type PackageDimensions = z.infer<typeof PackageDimensionsSchema>;

// =============================================================================
// LISTING / PUBLISH SCHEMAS
// =============================================================================

/**
 * Pre-publish listing ready for review
 */
export const EbayListingDraftSchema = z.object({
  listing_id: z.string().uuid(),
  title: z.string().max(80),
  description: z.string().max(4000),
  category_id: z.string(),
  category_name: z.string().optional(),
  condition: z.object({
    id: z.string(),
    description: z.string(),
  }),
  price: z.object({
    value: z.number().positive(),
    currency: z.string().default('USD'),
  }),
  quantity: z.number().int().positive().default(1),
  image_urls: z.array(z.string().url()).min(1).max(12),
  item_specifics: z.record(z.string(), z.string()),
  package_weight: PackageWeightSchema.optional(),
  package_dimensions: PackageDimensionsSchema.optional(),
  format: z.literal('FIXED_PRICE'),
  policies: z
    .object({
      fulfillment_policy_id: z.string().optional(),
      payment_policy_id: z.string().optional(),
      return_policy_id: z.string().optional(),
    })
    .optional(),
});
export type EbayListingDraft = z.infer<typeof EbayListingDraftSchema>;

/**
 * Payload for eBay Inventory API createOrReplaceInventoryItem
 */
export const EbayInventoryItemPayloadSchema = z.object({
  sku: z.string().max(50),
  // NOTE: locale is NOT in the body - it goes in Content-Language header only
  product: z.object({
    title: z.string().max(80),
    description: z.string().max(4000),
    imageUrls: z.array(z.string().url()).min(1).max(12),
    aspects: z.record(z.string(), z.array(z.string())),
  }),
  condition: EbayConditionEnum,
  conditionDescription: z.string().optional(),
  availability: z.object({
    shipToLocationAvailability: z.object({
      quantity: z.number().int().min(0),
    }),
  }),
  packageWeightAndSize: z.object({
    weight: z.object({
      value: z.number().positive(),
      unit: WeightUnitEnum,
    }),
    dimensions: z.object({
      length: z.number().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
      unit: DimensionUnitEnum,
    }),
  }).optional(),
});
export type EbayInventoryItemPayload = z.infer<typeof EbayInventoryItemPayloadSchema>;

/**
 * Payload for eBay Inventory API createOffer
 */
export const EbayOfferPayloadSchema = z.object({
  sku: z.string(),
  marketplaceId: EbayMarketplaceEnum,
  format: z.literal('FIXED_PRICE'),
  categoryId: z.string(),
  pricingSummary: z.object({
    price: z.object({
      value: z.string(), // String for precision
      currency: z.string().default('USD'),
    }),
  }),
  availableQuantity: z.number().int().positive(),
  listingPolicies: z.object({
    fulfillmentPolicyId: z.string(),
    paymentPolicyId: z.string(),
    returnPolicyId: z.string(),
  }),
  merchantLocationKey: z.string(), // Required per EBAY_SOURCE_OF_TRUTH.md Section 7
});
export type EbayOfferPayload = z.infer<typeof EbayOfferPayloadSchema>;

/**
 * Single publish step status (6-step pipeline)
 */
export const EbayPublishStepSchema = z.object({
  step: z.number().int().min(1).max(6),
  name: z.enum(['location', 'inventory', 'policies', 'offer', 'fees', 'publish']),
  status: z.enum(['pending', 'in_progress', 'complete', 'failed', 'skipped']),
  item_sku: z.string().optional(),
  offer_id: z.string().optional(),
  listing_id: z.string().optional(),
  merchant_location_key: z.string().optional(),
  error: z.string().optional(),
});
export type EbayPublishStep = z.infer<typeof EbayPublishStepSchema>;

/**
 * Listing fees from eBay (optional step)
 */
export const EbayListingFeesSchema = z.object({
  marketplace_id: EbayMarketplaceEnum,
  listing_fees: z.array(
    z.object({
      fee_type: z.string(),
      amount: z.object({
        value: z.string(),
        currency: z.string(),
      }),
    })
  ).optional(),
  total_fee: z.object({
    value: z.string(),
    currency: z.string(),
  }).optional(),
});
export type EbayListingFees = z.infer<typeof EbayListingFeesSchema>;

/**
 * Result of publishing a listing
 */
export const EbayPublishResultSchema = z.object({
  success: z.boolean(),
  listing_id: z.string().optional(),
  offer_id: z.string().optional(),
  sku: z.string().optional(),
  listing_url: z.string().url().optional(),
  steps: z.array(EbayPublishStepSchema).optional(),
  fees: EbayListingFeesSchema.optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      action: z.string().optional(), // Suggested recovery action
      ebay_error_id: z.coerce.string().optional(), // eBay's error ID for debugging
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  warnings: z
    .array(
      z.object({
        code: z.union([z.string(), z.number()]).transform(String),
        message: z.string(),
      })
    )
    .optional(),
  traceId: z.string().uuid().optional(), // Pipeline trace ID for debugging
  published_at: z.string().datetime().optional(),
  attempted_at: z.string().datetime(),
});
export type EbayPublishResult = z.infer<typeof EbayPublishResultSchema>;

// =============================================================================
// POLICY SCHEMAS
// =============================================================================

/**
 * eBay fulfillment policy summary
 */
export const EbayFulfillmentPolicySchema = z.object({
  policy_id: z.string(),
  name: z.string(),
  marketplace_id: EbayMarketplaceEnum,
  shipping_options: z.array(
    z.object({
      shipping_service: z.string(),
      cost: z.number().optional(),
    })
  ),
});
export type EbayFulfillmentPolicy = z.infer<typeof EbayFulfillmentPolicySchema>;

/**
 * eBay payment policy summary
 */
export const EbayPaymentPolicySchema = z.object({
  policy_id: z.string(),
  name: z.string(),
  marketplace_id: EbayMarketplaceEnum,
  payment_methods: z.array(z.string()),
});
export type EbayPaymentPolicy = z.infer<typeof EbayPaymentPolicySchema>;

/**
 * eBay return policy summary
 */
export const EbayReturnPolicySchema = z.object({
  policy_id: z.string(),
  name: z.string(),
  marketplace_id: EbayMarketplaceEnum,
  returns_accepted: z.boolean(),
  return_period: z.string().optional(),
});
export type EbayReturnPolicy = z.infer<typeof EbayReturnPolicySchema>;

/**
 * Combined user policies response
 */
export const EbayUserPoliciesSchema = z.object({
  fulfillment: z.array(EbayFulfillmentPolicySchema),
  payment: z.array(EbayPaymentPolicySchema),
  return: z.array(EbayReturnPolicySchema),
  fetched_at: z.string().datetime(),
});
export type EbayUserPolicies = z.infer<typeof EbayUserPoliciesSchema>;

// =============================================================================
// INVENTORY LOCATION SCHEMAS
// =============================================================================

/**
 * Address for inventory location
 * Per EBAY_SOURCE_OF_TRUTH.md Section 7:
 * "You must supply an address (country, and either city+state or postal code)"
 */
export const EbayLocationAddressSchema = z.object({
  addressLine1: z.string().max(128).optional(),
  addressLine2: z.string().max(128).optional(),
  city: z.string().max(128).optional(),
  stateOrProvince: z.string().max(128).optional(),
  postalCode: z.string().max(64).optional(),
  country: z.string().length(2).default('US'), // ISO 3166-1 alpha-2
});
export type EbayLocationAddress = z.infer<typeof EbayLocationAddressSchema>;

/**
 * Payload for creating an inventory location
 * PUT /sell/inventory/v1/location/{merchantLocationKey}
 */
export const EbayInventoryLocationPayloadSchema = z.object({
  name: z.string().max(256).optional(),
  location: z.object({
    address: EbayLocationAddressSchema,
  }),
  locationTypes: z.array(z.enum(['WAREHOUSE', 'STORE', 'FULFILLMENT_CENTER'])).default(['WAREHOUSE']),
  merchantLocationStatus: z.enum(['ENABLED', 'DISABLED']).default('ENABLED'),
});
export type EbayInventoryLocationPayload = z.infer<typeof EbayInventoryLocationPayloadSchema>;

/**
 * Single inventory location from eBay
 */
export const EbayInventoryLocationSchema = z.object({
  merchantLocationKey: z.string(),
  name: z.string().optional(),
  location: z.object({
    address: EbayLocationAddressSchema,
  }).optional(),
  locationTypes: z.array(z.string()).optional(),
  merchantLocationStatus: z.string().optional(),
});
export type EbayInventoryLocation = z.infer<typeof EbayInventoryLocationSchema>;

/**
 * Response from eBay getInventoryLocations
 */
export const EbayInventoryLocationsResponseSchema = z.object({
  locations: z.array(EbayInventoryLocationSchema).default([]),
  total: z.number().int().min(0).default(0),
});
export type EbayInventoryLocationsResponse = z.infer<typeof EbayInventoryLocationsResponseSchema>;

/**
 * Request to create location via our API
 */
export const CreateLocationRequestSchema = z
  .object({
    name: z.string().max(256).optional(),
    addressLine1: z.string().max(128).optional(),
    city: z.string().max(128).optional(),
    stateOrProvince: z.string().max(128).optional(),
    postalCode: z.string().max(64).optional(),
    country: z.string().length(2).default('US'),
  })
  .refine(
    (data) => {
      if (data.country === 'US') {
        return !!data.postalCode && !!data.city && !!data.stateOrProvince;
      }
      return !!data.postalCode || (!!data.city && !!data.stateOrProvince);
    },
    {
      message: 'US locations require city, state, AND postal code',
    }
  );
export type CreateLocationRequest = z.infer<typeof CreateLocationRequestSchema>;

/**
 * Request to save seller location profile
 * For US: requires city, state, AND postal_code
 * For non-US: requires postal_code OR (city AND state_or_province)
 */
export const SaveSellerLocationRequestSchema = z
  .object({
    country: z.string().length(2).default('US'),
    postal_code: z.string().max(64).optional(),
    city: z.string().max(128).optional(),
    state_or_province: z.string().max(128).optional(),
    address_line1: z.string().max(128).optional(),
  })
  .refine(
    (data) => {
      // For US, require all three: city, state, AND postal_code
      if (data.country === 'US') {
        return !!data.postal_code && !!data.city && !!data.state_or_province;
      }
      // Non-US: keep original logic
      return !!data.postal_code || (!!data.city && !!data.state_or_province);
    },
    {
      message: 'US locations require city, state, AND postal code',
    }
  );
export type SaveSellerLocationRequest = z.infer<typeof SaveSellerLocationRequestSchema>;

/**
 * Seller location profile stored in database
 */
export const SellerLocationProfileSchema = z.object({
  user_id: z.string().uuid(),
  country: z.string().length(2),
  postal_code: z.string().max(64).nullable(),
  city: z.string().max(128).nullable(),
  state_or_province: z.string().max(128).nullable(),
  address_line1: z.string().max(128).nullable(),
  updated_at: z.string().datetime(),
});
export type SellerLocationProfile = z.infer<typeof SellerLocationProfileSchema>;

// =============================================================================
// ERROR SCHEMAS
// =============================================================================

/**
 * Standardized error response
 */
export const EbayApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    ebay_error_id: z.coerce.string().optional(),
  }),
  recovery: z
    .object({
      action: EbayErrorRecoveryActionEnum,
      retry_after: z.number().int().optional(),
      message: z.string().optional(),
    })
    .optional(),
  request_id: z.string(),
  timestamp: z.string().datetime(),
});
export type EbayApiError = z.infer<typeof EbayApiErrorSchema>;

// =============================================================================
// DATABASE RECORD EXTENSIONS
// =============================================================================

/**
 * eBay-specific fields for listings table
 */
export const ListingEbayFieldsSchema = z.object({
  pricing_comps: EbayCompsResultSchema.nullable().optional(),
  ebay_publish: EbayPublishResultSchema.nullable().optional(),
  ebay_offer_id: z.string().nullable().optional(),
  ebay_sku: z.string().nullable().optional(),
  ebay_listing_id: z.string().nullable().optional(),
  ebay_published_at: z.string().datetime().nullable().optional(),
});
export type ListingEbayFields = z.infer<typeof ListingEbayFieldsSchema>;

/**
 * eBay account database record
 */
export const EbayAccountRecordSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  ebay_user_id: z.string(),
  ebay_username: z.string().nullable(),
  access_token_encrypted: z.string(),
  refresh_token_encrypted: z.string(),
  access_token_expires_at: z.string().datetime(),
  refresh_token_expires_at: z.string().datetime(),
  scopes: z.array(z.string()),
  marketplace_id: EbayMarketplaceEnum,
  status: EbayAccountStatusEnum,
  connected_at: z.string().datetime(),
  last_used_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type EbayAccountRecord = z.infer<typeof EbayAccountRecordSchema>;

/**
 * OAuth state record for CSRF protection
 */
export const EbayAuthStateRecordSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  state: z.string(),
  redirect_context: EbayRedirectContextEnum,
  expires_at: z.string().datetime(),
  used_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type EbayAuthStateRecord = z.infer<typeof EbayAuthStateRecordSchema>;

// =============================================================================
// API REQUEST/RESPONSE SCHEMAS
// =============================================================================

/**
 * GET /api/v1/ebay/comps request (query params)
 */
export const GetEbayCompsRequestSchema = EbayCompsQuerySchema;
export type GetEbayCompsRequest = z.infer<typeof GetEbayCompsRequestSchema>;

/**
 * POST /api/v1/listings/:id/ebay/publish request
 */
export const PublishToEbayRequestSchema = z.object({
  policies: z
    .object({
      fulfillment_policy_id: z.string(),
      payment_policy_id: z.string(),
      return_policy_id: z.string(),
    })
    .optional(),
  price_override: z.number().positive().optional(),
});
export type PublishToEbayRequest = z.infer<typeof PublishToEbayRequestSchema>;

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * eBay API URLs by environment
 */
export const EBAY_API_URLS = {
  sandbox: {
    auth: 'https://auth.sandbox.ebay.com/oauth2/authorize',
    token: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
    api: 'https://api.sandbox.ebay.com',
  },
  production: {
    auth: 'https://auth.ebay.com/oauth2/authorize',
    token: 'https://api.ebay.com/identity/v1/oauth2/token',
    api: 'https://api.ebay.com',
  },
} as const;

/**
 * Required eBay OAuth scopes for listing
 */
export const EBAY_REQUIRED_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
] as const;

/**
 * Comps confidence thresholds
 */
export const COMPS_CONFIDENCE_THRESHOLDS = {
  HIGH: 10, // 10+ sold items = high confidence
  MEDIUM: 5, // 5-9 items = medium
  LOW: 1, // 1-4 items = low
} as const;

/**
 * Comps cache TTL (15 minutes)
 */
export const COMPS_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Token refresh window (5 minutes before expiry)
 */
export const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

/**
 * UI display messages for pricing source (required by spec)
 */
export const COMPS_SOURCE_MESSAGES = {
  sold: (count: number) => `Based on ${count} recently sold items`,
  active: (count: number) =>
    `Based on ${count} active listings (no recent sales data)`,
  none: () => 'No comparable items found',
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine confidence level from sample size
 */
export function getCompsConfidence(
  sampleSize: number,
  source: EbayCompsSource
): EbayCompsConfidence {
  if (sampleSize === 0 || source === 'none') return 'none';
  if (source === 'active') return 'medium'; // Active listings always medium
  if (sampleSize >= COMPS_CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (sampleSize >= COMPS_CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

/**
 * Calculate median from array of numbers
 */
export function calculateMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate average from array of numbers
 */
export function calculateAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Generate a unique SKU for eBay inventory
 */
export function generateEbaySku(listingId: string): string {
  const timestamp = Date.now().toString(36);
  const shortId = listingId.split('-')[0];
  return `RSAI-${shortId}-${timestamp}`.toUpperCase();
}

/**
 * Check if token needs refresh
 */
export function tokenNeedsRefresh(expiresAt: string): boolean {
  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  return expiryTime - now <= TOKEN_REFRESH_WINDOW_MS;
}

/**
 * Generate comps source message for UI
 */
export function getCompsSourceMessage(
  source: EbayCompsSource,
  sampleSize: number
): string {
  return COMPS_SOURCE_MESSAGES[source](sampleSize);
}

// =============================================================================
// ITEM ASPECTS SCHEMAS (Taxonomy API)
// =============================================================================

/**
 * Single aspect definition from eBay Taxonomy API
 */
export const AspectDefinitionSchema = z.object({
  name: z.string(),                           // e.g., "Department", "Size", "Color"
  required: z.boolean(),                      // Whether this aspect is required
  mode: z.enum(['FREE_TEXT', 'SELECTION_ONLY']),  // Whether values must be from allowed list
  allowedValues: z.array(z.string()).optional(),  // Allowed values for SELECTION_ONLY mode
  maxLength: z.number().optional(),           // Max length for FREE_TEXT mode
});
export type AspectDefinition = z.infer<typeof AspectDefinitionSchema>;

/**
 * Complete item aspects metadata for a category
 */
export const ItemAspectsMetadataSchema = z.object({
  categoryId: z.string(),
  categoryTreeId: z.string(),
  requiredAspects: z.array(AspectDefinitionSchema),
  recommendedAspects: z.array(AspectDefinitionSchema),
  cached: z.boolean(),
  cacheAge: z.number().optional(),
});
export type ItemAspectsMetadata = z.infer<typeof ItemAspectsMetadataSchema>;

/**
 * Input for suggesting item specifics
 */
export const SuggestionInputSchema = z.object({
  categoryId: z.string(),
  aiAttributes: z.array(z.object({
    key: z.string(),
    value: z.string(),
    confidence: z.number(),
  })),
  detectedBrand: z.object({
    value: z.string().nullable(),
    confidence: z.number(),
  }).optional(),
});
export type SuggestionInput = z.infer<typeof SuggestionInputSchema>;

/**
 * Result from suggesting item specifics
 */
export const SuggestionResultSchema = z.object({
  suggestedItemSpecifics: z.record(z.string(), z.string()),
  missingRequiredAspects: z.array(z.string()),
  invalidAspects: z.array(z.object({
    aspectName: z.string(),
    providedValue: z.string(),
    allowedValues: z.array(z.string()),
    suggestion: z.string().optional(),
  })),
  matchDetails: z.array(z.object({
    aspectName: z.string(),
    method: z.enum(['exact', 'synonym', 'fuzzy', 'direct']),
    originalValue: z.string(),
    matchedValue: z.string(),
  })).optional(),
});
export type SuggestionResult = z.infer<typeof SuggestionResultSchema>;

// =============================================================================
// ITEM CONDITION SCHEMAS (Metadata API)
// =============================================================================

/**
 * Item condition from eBay Metadata API
 */
export interface EbayItemCondition {
  conditionId: string;        // "1000", "3000", etc.
  conditionDescription: string;  // "New", "Used", etc.
  conditionHelpText?: string;
}

/**
 * Normalized condition for frontend consumption
 */
export interface NormalizedItemCondition {
  id: string;           // Numeric ID ("1000", "3000", etc.)
  label: string;        // Human-readable ("New", "Used - Good", etc.)
  description?: string; // Help text for the condition
  apiEnum: string;      // eBay API enum (NEW, USED_GOOD, etc.)
}

/**
 * Result from fetching category conditions
 */
export interface CategoryConditionsResult {
  categoryId: string;
  conditionRequired: boolean;
  conditions: NormalizedItemCondition[];
  cached: boolean;
  cacheAge?: number;  // Seconds since cached
}

// =============================================================================
// AI CATEGORY SUGGESTION SCHEMAS
// =============================================================================

/**
 * Single AI category suggestion
 */
export const AiCategorySuggestionSchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  categoryTreeId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export type AiCategorySuggestion = z.infer<typeof AiCategorySuggestionSchema>;

/**
 * Request for AI category suggestion
 */
export const AiCategorySuggestRequestSchema = z.object({
  listingId: z.string().uuid().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
}).refine(
  data => !!data.listingId || !!data.title,
  { message: 'Either listingId or title is required' }
);
export type AiCategorySuggestRequest = z.infer<typeof AiCategorySuggestRequestSchema>;

/**
 * Response from AI category suggestion
 */
export const AiCategorySuggestResponseSchema = z.object({
  primary: AiCategorySuggestionSchema,
  alternatives: z.array(AiCategorySuggestionSchema),
});
export type AiCategorySuggestResponse = z.infer<typeof AiCategorySuggestResponseSchema>;

// =============================================================================
// AI AUTOFILL ITEM SPECIFICS SCHEMAS
// =============================================================================

/**
 * Request for AI autofill item specifics
 */
export const AiAutofillRequestSchema = z.object({
  listingId: z.string().uuid(),
  categoryId: z.string(),
  categoryTreeId: z.string().default('0'),
  currentItemSpecifics: z.record(z.string(), z.string()).default({}),
});
export type AiAutofillRequest = z.infer<typeof AiAutofillRequestSchema>;

/**
 * Response from AI autofill item specifics
 */
export const AiAutofillResponseSchema = z.object({
  itemSpecifics: z.record(z.string(), z.string()),
  filledByAi: z.array(z.string()),
  stillMissing: z.array(z.string()),
  aspectsMetadata: z.object({
    requiredAspects: z.array(AspectDefinitionSchema),
    recommendedAspects: z.array(AspectDefinitionSchema),
  }),
});
export type AiAutofillResponse = z.infer<typeof AiAutofillResponseSchema>;
