import { API_URL, isApiConfigured, supabase } from './supabase';
import { getAnonId } from './identity';

/**
 * API client for ResellrAI backend
 */

const missingApiUrlMessage =
  'EXPO_PUBLIC_API_URL is not configured. Copy .env.example to .env and set your public API URL (ngrok).';

function getApiUrlOrThrow(): string {
  if (!API_URL) {
    throw new Error(missingApiUrlMessage);
  }
  return API_URL;
}

// =============================================================================
// Identity & Usage Limit Helpers
// =============================================================================

async function getIdentityHeaders(): Promise<Record<string, string>> {
  const anonId = await getAnonId();
  const headers: Record<string, string> = { 'x-anon-id': anonId };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Ignore auth errors; treat as anonymous
  }
  return headers;
}

export class UsageLimitError extends Error {
  limitType: 'daily' | 'monthly';
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  resetAt: string;

  constructor(data: {
    limitType: 'daily' | 'monthly';
    dailyUsed: number;
    dailyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
    resetAt: string;
  }) {
    const msg =
      data.limitType === 'daily'
        ? `Daily limit reached (${data.dailyUsed}/${data.dailyLimit})`
        : `Monthly limit reached (${data.monthlyUsed}/${data.monthlyLimit})`;
    super(msg);
    this.name = 'UsageLimitError';
    this.limitType = data.limitType;
    this.dailyUsed = data.dailyUsed;
    this.dailyLimit = data.dailyLimit;
    this.monthlyUsed = data.monthlyUsed;
    this.monthlyLimit = data.monthlyLimit;
    this.resetAt = data.resetAt;
  }
}

// =============================================================================
// Usage Status
// =============================================================================

export interface UsageStatus {
  allowed: boolean;
  isPremium: boolean;
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  resetAt: string;
  limitType?: 'daily' | 'monthly';
}

export async function getUsageStatus(): Promise<UsageStatus> {
  const apiUrl = getApiUrlOrThrow();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(`${apiUrl}/api/v1/usage/status`, {
    headers: identityHeaders,
  });
  if (!response.ok) {
    throw new Error(`Usage status failed: ${response.status}`);
  }
  return response.json();
}

// =============================================================================
// Billing
// =============================================================================

export async function createCheckoutSession(): Promise<{ checkoutUrl: string }> {
  const apiUrl = getApiUrlOrThrow();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(`${apiUrl}/api/v1/billing/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...identityHeaders,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Checkout failed' }));
    throw new Error(error.message || `Checkout failed: ${response.status}`);
  }
  return response.json();
}

export async function createBillingPortal(): Promise<{ portalUrl: string }> {
  const apiUrl = getApiUrlOrThrow();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(`${apiUrl}/api/v1/billing/portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...identityHeaders,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Portal failed' }));
    throw new Error(error.message || `Portal failed: ${response.status}`);
  }
  return response.json();
}

// =============================================================================
// Types (matching backend schemas)
// =============================================================================

export interface GenerateListingRequest {
  photos: string[];
  userHints?: {
    category?: string;
    brand?: string;
    condition?: string;
  };
  platform: 'ebay';
}

export interface ConfidenceValue {
  value: string;
  confidence: number;
}

export interface DetectedAttribute {
  key: string;
  value: string;
  confidence: number;
}

export type PackagingType = 'poly_mailer' | 'small_box' | 'medium_box' | 'large_box' | 'tube' | 'rigid_mailer';

export interface ShippingEstimate {
  packagingType: PackagingType;
  itemDimensionsIn: { l: number; w: number; h: number };
  itemWeightOz: number;
  packageDimensionsIn: { l: number; w: number; h: number };
  packageWeightOz: number;
  confidence: number;
  assumptions: string[];
}

export const PACKAGING_TYPE_LABELS: Record<PackagingType, string> = {
  poly_mailer: 'Poly Mailer',
  small_box: 'Small Box',
  medium_box: 'Medium Box',
  large_box: 'Large Box',
  tube: 'Tube',
  rigid_mailer: 'Rigid Mailer',
};

export interface VisionOutput {
  itemId: string;
  detectedCategory: ConfidenceValue;
  detectedBrand?: { value: string | null; confidence: number };
  detectedColor: ConfidenceValue;
  detectedCondition?: ConfidenceValue;
  detectedAttributes: DetectedAttribute[];
  shippingEstimate?: ShippingEstimate;
  processingTimeMs: number;
}

export interface ListingDraft {
  itemId: string;
  title: { value: string; charCount: number };
  description: { value: string; charCount: number };
  category: { value: string; platformCategoryId?: string | null };
  attributes: { key: string; value: string; editable: boolean }[];
  condition: { value: string; requiresConfirmation: boolean };
  brand?: { value: string | null; confidence: number; requiresConfirmation: boolean };
  generatedAt: string;
}

export interface PricingSuggestion {
  itemId: string;
  lowPrice: number;
  midPrice: number;
  highPrice: number;
  currency: string;
  basis: string;
  confidence: number;
  disclaimer: string;
}

export interface PlatformVariant {
  platform: 'ebay';
  title: { value: string; maxLength: number; valid: boolean };
  description: { value: string; format: 'plain' | 'html' };
  categoryId: string;
  requiredAttributes: { key: string; value: string }[];
  optionalAttributes?: { key: string; value: string }[];
}

export interface GenerateListingResponse {
  itemId: string;
  visionOutput: VisionOutput;
  listingDraft: ListingDraft;
  pricingSuggestion: PricingSuggestion;
  platformVariant: PlatformVariant;
  photoUrls: string[];
  processingTimeMs: number;
}

export interface ListingRecord {
  id: string;
  item_input: any;
  vision_output: VisionOutput | null;
  listing_draft: ListingDraft | null;
  pricing_suggestion: PricingSuggestion | null;
  platform_variant: PlatformVariant | null;
  platform: 'ebay' | null;
  status: 'draft' | 'ready' | 'exported';
  photo_urls: string[];
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Package Weight and Dimensions Types
// =============================================================================

export type WeightUnit = 'OUNCE' | 'POUND';
export type DimensionUnit = 'INCH' | 'CENTIMETER';

export interface PackageWeight {
  value: number;
  unit: WeightUnit;
}

export interface PackageDimensions {
  length: number;
  width: number;
  height: number;
  unit: DimensionUnit;
}

export interface WeightSuggestion extends PackageWeight {
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

export interface DimensionsSuggestion extends PackageDimensions {
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

export interface PackageSuggestion {
  weight: WeightSuggestion;
  dimensions: DimensionsSuggestion;
}

// =============================================================================
// Health Check
// =============================================================================

export async function checkHealth(): Promise<{ status: string }> {
  const apiUrl = getApiUrlOrThrow();
  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}

export async function testConnection(): Promise<boolean> {
  if (!isApiConfigured()) {
    console.warn(missingApiUrlMessage);
    return false;
  }
  try {
    console.log(`[DEBUG] Attempting connection to: ${API_URL}/health`);
    const health = await checkHealth();
    console.log(`[DEBUG] Connection success:`, health);
    return health.status === 'ok';
  } catch (err) {
    console.error(`[DEBUG] Connection failed to ${API_URL}/health:`, err);
    return false;
  }
}

// =============================================================================
// Listings API
// =============================================================================

/**
 * Generate a new listing from photos
 */
export async function generateListing(
  request: GenerateListingRequest
): Promise<GenerateListingResponse> {
  const apiUrl = getApiUrlOrThrow();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(`${apiUrl}/api/v1/listings/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...identityHeaders,
    },
    body: JSON.stringify(request),
  });

  if (response.status === 429) {
    const body = await response.json().catch(() => ({}));
    if (body.error?.code === 'USAGE_LIMIT_EXCEEDED') {
      throw new UsageLimitError(body.error);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `Generate failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get a listing by ID
 */
export async function getListing(id: string): Promise<ListingRecord> {
  const apiUrl = getApiUrlOrThrow();
  const response = await fetch(`${apiUrl}/api/v1/listings/${id}`);

  if (!response.ok) {
    throw new Error(`Get listing failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Update listing fields
 */
export async function updateListing(
  id: string,
  updates: {
    title?: string;
    description?: string;
    condition?: string;
  }
): Promise<ListingRecord> {
  const apiUrl = getApiUrlOrThrow();
  const response = await fetch(`${apiUrl}/api/v1/listings/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Update listing failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Regenerate a specific field
 */
export async function regenerateField(
  id: string,
  field: 'title' | 'description' | 'price'
): Promise<ListingRecord> {
  const apiUrl = getApiUrlOrThrow();
  const response = await fetch(`${apiUrl}/api/v1/listings/${id}/regenerate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ field }),
  });

  if (!response.ok) {
    throw new Error(`Regenerate failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Export listing
 */
export async function exportListing(
  id: string,
  price: number
): Promise<{ success: boolean; listing: ListingRecord; finalPayload: any }> {
  const apiUrl = getApiUrlOrThrow();
  const response = await fetch(`${apiUrl}/api/v1/listings/${id}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ price }),
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get recent listings
 */
export async function getRecentListings(limit: number = 10): Promise<ListingRecord[]> {
  const apiUrl = getApiUrlOrThrow();
  const response = await fetch(`${apiUrl}/api/v1/listings?limit=${limit}`);

  if (!response.ok) {
    throw new Error(`Get listings failed: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// eBay Integration API
// =============================================================================

export interface EbayConnectedAccount {
  connected: boolean;
  ebay_username?: string;
  connected_at?: string;
  needs_reauth?: boolean;
  marketplace?: string;
}

export interface EbayPolicy {
  policy_id: string;
  name: string;
  marketplace_id: string;
}

export interface EbayUserPolicies {
  fulfillment: EbayPolicy[];
  payment: EbayPolicy[];
  return: EbayPolicy[];
  has_required_policies: boolean;
  missing_policies: string[];
  fetched_at: string;
}

export interface EbayPublishStep {
  step: 1 | 2 | 3;
  name: 'inventory' | 'offer' | 'publish';
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  item_sku?: string;
  offer_id?: string;
  listing_id?: string;
  error?: string;
}

export interface EbayPublishResult {
  success: boolean;
  listing_id?: string;
  offer_id?: string;
  sku?: string;
  listing_url?: string;
  steps?: EbayPublishStep[];
  error?: {
    code: string;
    message: string;
    action?: string;
    details?: {
      missing?: string[];
      invalid?: Array<{ aspect: string; value: string; allowed: string[] }>;
    };
  };
  warnings?: Array<{ code: string; message: string }>;
  published_at?: string;
  attempted_at: string;
}

export interface EbayCompItem {
  item_id: string;
  title: string;
  price: { value: number; currency: string };
  shipping_cost: number;
  total_cost: number;
  condition: string;
  item_url: string;
  image_url?: string;
  seller?: {
    username: string;
    feedback_score?: number;
  };
}

export interface EbayCompsResult {
  source: 'sold' | 'active' | 'none';
  source_message: string;
  stats: {
    median: number | null;
    average: number | null;
    min: number | null;
    max: number | null;
    sample_size: number;
    confidence: 'high' | 'medium' | 'low' | 'none';
  };
  limitations: string[];
  data: EbayCompItem[];
  cached: boolean;
  cache_age?: number;
}

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  categoryPath: string[];
  relevance: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface CategorySuggestionsResult {
  suggestions: CategorySuggestion[];
  query: string;
  marketplace: string;
  cached: boolean;
  cacheAge?: number;
}

export interface SellerLocationProfile {
  user_id: string;
  country: string;
  postal_code: string | null;
  city: string | null;
  state_or_province: string | null;
  address_line1: string | null;
  updated_at: string;
}

export interface SaveSellerLocationRequest {
  country?: string;
  postal_code: string;       // Required for US
  city: string;              // Required for US
  state_or_province: string; // Required for US
  address_line1?: string;
}

/**
 * Check eBay integration status (system-level)
 */
export async function getEbayStatus(): Promise<{
  available: boolean;
  configured: boolean;
  environment: string;
}> {
  const apiUrl = getApiUrlOrThrow();
  const response = await fetch(`${apiUrl}/api/v1/ebay/status`);

  if (!response.ok) {
    return { available: false, configured: false, environment: 'unknown' };
  }

  return response.json();
}

/**
 * eBay connection status response
 */
export interface EbayConnectionStatus {
  connected: boolean;
  environment?: string;
  ebay_username?: string | null;
  scopes?: string[];
  last_connected_at?: string;
  needs_reauth?: boolean;
  reason?: string;
}

/**
 * Get per-user eBay connection status
 * This is the authoritative check for whether a user has connected their eBay account.
 */
export async function getEbayConnection(): Promise<EbayConnectionStatus> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(`${apiUrl}/api/v1/ebay/connection?user_id=${anonId}`, {
    headers: identityHeaders,
  });

  // The endpoint always returns 200 with { connected: true/false }
  // It never returns 500 for "not connected"
  if (!response.ok) {
    console.warn('[API] getEbayConnection unexpected status:', response.status);
    return { connected: false };
  }

  return response.json();
}

/**
 * Get eBay connected account status
 */
export async function getEbayAccount(): Promise<EbayConnectedAccount> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(`${apiUrl}/api/v1/ebay/account?user_id=${anonId}`, {
    headers: identityHeaders,
  });

  if (!response.ok) {
    if (response.status === 401) {
      return { connected: false };
    }
    throw new Error(`Get eBay account failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Start eBay OAuth flow
 * @returns Auth URL to open in browser
 */
export async function startEbayOAuth(): Promise<{
  auth_url: string;
  state: string;
  expires_at: string;
}> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const startUrl = `${apiUrl}/api/v1/ebay/oauth/start?redirect_context=mobile`;

  console.log('[eBay OAuth] Calling start endpoint:', startUrl);

  const response = await fetch(startUrl, {
    method: 'GET',
    headers: {
      ...identityHeaders,
      'x-user-id': anonId,
    },
  });

  if (!response.ok) {
    const responseText = await response.text();
    console.log('[eBay OAuth] Start endpoint failed:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText.substring(0, 200),
    });
    let errorMessage = `OAuth start failed: ${response.status}`;
    try {
      const errorData = JSON.parse(responseText);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();

  // Safe logging: hostname + pathname, first 80 chars (no tokens/secrets)
  try {
    const authUrlObj = new URL(data.auth_url);
    console.log('[eBay OAuth] Received auth_url:', {
      hostname: authUrlObj.hostname,
      pathname: authUrlObj.pathname,
      preview: data.auth_url.substring(0, 80) + '...',
    });
  } catch {
    console.log('[eBay OAuth] Received auth_url (invalid URL):', data.auth_url?.substring(0, 80));
  }

  return data;
}

/**
 * Disconnect eBay account
 */
export async function disconnectEbay(): Promise<boolean> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(`${apiUrl}/api/v1/ebay/account?user_id=${anonId}`, {
    method: 'DELETE',
    headers: identityHeaders,
  });

  return response.ok;
}

/**
 * Get user's eBay business policies
 */
export async function getEbayPolicies(): Promise<EbayUserPolicies> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(`${apiUrl}/api/v1/ebay/policies?user_id=${anonId}`, {
    headers: identityHeaders,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `Get policies failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Publish listing to eBay
 */
export async function publishToEbay(
  listingId: string,
  listingData: {
    listing_draft: ListingDraft;
    photo_urls: string[];
    pricing_suggestion: PricingSuggestion;
    item_specifics?: Record<string, string>;  // Optional direct item specifics
    package_weight?: PackageWeight;  // Required for shipping
    package_dimensions?: PackageDimensions;  // Required for shipping
  },
  policies: {
    fulfillment_policy_id: string;
    payment_policy_id: string;
    return_policy_id: string;
  },
  priceOverride?: number
): Promise<EbayPublishResult> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(
    `${apiUrl}/api/v1/ebay/listings/${listingId}/publish?user_id=${anonId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...identityHeaders,
      },
      body: JSON.stringify({
        policies,
        price_override: priceOverride,
        listing_data: listingData,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok && !result.success) {
    // Return the error result rather than throwing
    return result;
  }

  return result;
}

/**
 * Comps filter options
 */
export interface CompsFilters {
  categoryId?: string;
  condition?: 'NEW' | 'LIKE_NEW' | 'VERY_GOOD' | 'GOOD' | 'ACCEPTABLE';
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Get pricing comparables from eBay
 */
export async function getEbayComps(
  keywords: string,
  filters?: CompsFilters
): Promise<EbayCompsResult> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const params = new URLSearchParams();
  params.set('keywords', keywords);
  params.set('user_id', anonId);

  if (filters?.categoryId) params.set('category_id', filters.categoryId);
  if (filters?.condition) params.set('condition', filters.condition);
  if (filters?.brand) params.set('brand', filters.brand);

  const response = await fetch(`${apiUrl}/api/v1/ebay/comps?${params.toString()}`, {
    headers: identityHeaders,
  });

  if (!response.ok) {
    throw new Error(`Get comps failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get category suggestions from eBay Taxonomy API
 */
export async function suggestCategory(
  query: string,
  marketplace: string = 'EBAY_US'
): Promise<CategorySuggestionsResult> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const params = new URLSearchParams();
  params.set('query', query);
  params.set('user_id', anonId);
  params.set('marketplace', marketplace);

  const response = await fetch(
    `${apiUrl}/api/v1/ebay/categories/suggest?${params.toString()}`,
    { headers: identityHeaders }
  );

  if (!response.ok) {
    throw new Error(`Category suggest failed: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

// =============================================================================
// Category Conditions API
// =============================================================================

/**
 * Normalized condition option for a category
 */
export interface CategoryCondition {
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
  conditions: CategoryCondition[];
  cached: boolean;
  cacheAge?: number;
}

/**
 * Get valid conditions for a specific eBay category
 *
 * @param categoryId - eBay category ID
 * @param marketplace - Marketplace ID (default: EBAY_US)
 */
export async function getCategoryConditions(
  categoryId: string,
  marketplace: string = 'EBAY_US'
): Promise<CategoryConditionsResult> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const params = new URLSearchParams();
  params.set('user_id', anonId);
  params.set('marketplace', marketplace);

  const response = await fetch(
    `${apiUrl}/api/v1/ebay/categories/${encodeURIComponent(categoryId)}/conditions?${params.toString()}`,
    { headers: identityHeaders }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    // Return empty conditions on failure (let eBay validate)
    if (response.status === 401) {
      throw new Error(error.message || 'Please connect your eBay account');
    }
    console.warn('[API] getCategoryConditions failed:', error);
    return {
      categoryId,
      conditionRequired: false,
      conditions: [],
      cached: false,
    };
  }

  return response.json();
}

// =============================================================================
// Item Specifics / Aspects API
// =============================================================================

/**
 * Single aspect definition from eBay
 */
export interface AspectDefinition {
  name: string;                     // e.g., "Department", "Size", "Color"
  required: boolean;                // Whether this aspect is required for the category
  mode: 'FREE_TEXT' | 'SELECTION_ONLY';  // Whether values must be from allowed list
  allowedValues?: string[];         // Allowed values for SELECTION_ONLY mode
  maxLength?: number;               // Max length for FREE_TEXT mode
}

/**
 * Item aspects metadata for a category
 */
export interface ItemAspectsMetadata {
  categoryId: string;
  categoryTreeId: string;
  requiredAspects: AspectDefinition[];
  recommendedAspects: AspectDefinition[];
  cached: boolean;
  cacheAge?: number;
}

/**
 * Result from suggesting item specifics
 */
export interface SuggestionResult {
  suggestedItemSpecifics: Record<string, string>;
  missingRequiredAspects: string[];
  invalidAspects: Array<{
    aspectName: string;
    providedValue: string;
    allowedValues: string[];
    suggestion?: string;
  }>;
  matchDetails?: Array<{
    aspectName: string;
    method: 'exact' | 'synonym' | 'fuzzy' | 'direct';
    originalValue: string;
    matchedValue: string;
  }>;
}

/**
 * Get item specifics metadata for a category
 *
 * @param categoryId - eBay category ID
 * @param marketplace - Marketplace ID (default: EBAY_US)
 */
export async function getCategoryItemAspects(
  categoryId: string,
  marketplace: string = 'EBAY_US'
): Promise<ItemAspectsMetadata> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const params = new URLSearchParams();
  params.set('user_id', anonId);
  params.set('marketplace', marketplace);

  const response = await fetch(
    `${apiUrl}/api/v1/ebay/category/${encodeURIComponent(categoryId)}/item_specifics?${params.toString()}`,
    { headers: identityHeaders }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    if (response.status === 401) {
      throw new Error(error.message || 'Please connect your eBay account');
    }
    console.warn('[API] getCategoryItemAspects failed:', error);
    // Return empty metadata on failure (let eBay validate)
    return {
      categoryId,
      categoryTreeId: '0',
      requiredAspects: [],
      recommendedAspects: [],
      cached: false,
    };
  }

  return response.json();
}

/**
 * Suggest item specifics based on AI attributes
 *
 * @param categoryId - eBay category ID
 * @param aiAttributes - AI-detected attributes
 * @param detectedBrand - Detected brand (optional)
 * @param marketplace - Marketplace ID (default: EBAY_US)
 */
export async function suggestItemSpecifics(
  categoryId: string,
  aiAttributes: Array<{ key: string; value: string; confidence: number }>,
  detectedBrand?: { value: string | null; confidence: number },
  marketplace: string = 'EBAY_US'
): Promise<SuggestionResult> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const params = new URLSearchParams();
  params.set('user_id', anonId);
  params.set('marketplace', marketplace);

  const response = await fetch(
    `${apiUrl}/api/v1/ebay/category/${encodeURIComponent(categoryId)}/suggest_item_specifics?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...identityHeaders,
      },
      body: JSON.stringify({
        aiAttributes,
        detectedBrand,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    console.warn('[API] suggestItemSpecifics failed:', error);
    // Return empty result on failure
    return {
      suggestedItemSpecifics: {},
      missingRequiredAspects: [],
      invalidAspects: [],
    };
  }

  return response.json();
}

// =============================================================================
// Seller Location Profile API
// =============================================================================

/**
 * Get user's saved seller location profile
 */
export async function getSellerLocation(): Promise<SellerLocationProfile | null> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(
    `${apiUrl}/api/v1/ebay/profile/location?user_id=${anonId}`,
    { headers: identityHeaders }
  );

  if (!response.ok) {
    throw new Error(`Get seller location failed: ${response.status}`);
  }

  const result = await response.json();
  return result.profile;
}

/**
 * Save user's seller location profile
 */
export async function saveSellerLocation(
  location: SaveSellerLocationRequest
): Promise<SellerLocationProfile> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(
    `${apiUrl}/api/v1/ebay/profile/location?user_id=${anonId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...identityHeaders,
      },
      body: JSON.stringify(location),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `Save seller location failed: ${response.status}`);
  }

  const result = await response.json();
  return result.profile;
}

// =============================================================================
// AI Category Suggestion + Autofill API
// =============================================================================

/**
 * Single AI category suggestion
 */
export interface AiCategorySuggestion {
  categoryId: string;
  categoryName: string;
  categoryTreeId: string;
  confidence: number;
  reason: string;
}

/**
 * AI category suggestion response
 */
export interface AiCategorySuggestResponse {
  primary: AiCategorySuggestion;
  alternatives: AiCategorySuggestion[];
}

/**
 * AI autofill response
 */
export interface AiAutofillResponse {
  itemSpecifics: Record<string, string>;
  filledByAi: string[];
  stillMissing: string[];
  aspectsMetadata: {
    requiredAspects: AspectDefinition[];
    recommendedAspects: AspectDefinition[];
  };
}

/**
 * Get AI-powered category suggestion for a listing
 */
export async function suggestAiCategory(
  listingId: string
): Promise<AiCategorySuggestResponse> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(
    `${apiUrl}/api/v1/ebay/ai/category-suggest?user_id=${anonId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...identityHeaders },
      body: JSON.stringify({ listingId }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `AI category suggest failed: ${response.status}`);
  }

  return response.json();
}

/**
 * AI-powered autofill of required item specifics
 */
export async function autofillItemSpecifics(
  listingId: string,
  categoryId: string,
  currentSpecifics: Record<string, string> = {}
): Promise<AiAutofillResponse> {
  const apiUrl = getApiUrlOrThrow();
  const anonId = await getAnonId();
  const identityHeaders = await getIdentityHeaders();
  const response = await fetch(
    `${apiUrl}/api/v1/ebay/ai/autofill-specifics?user_id=${anonId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...identityHeaders },
      body: JSON.stringify({
        listingId,
        categoryId,
        categoryTreeId: '0',
        currentItemSpecifics: currentSpecifics,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    console.warn('[API] autofillItemSpecifics failed:', error);
    // Return empty result on failure
    return {
      itemSpecifics: currentSpecifics,
      filledByAi: [],
      stillMissing: [],
      aspectsMetadata: { requiredAspects: [], recommendedAspects: [] },
    };
  }

  return response.json();
}
