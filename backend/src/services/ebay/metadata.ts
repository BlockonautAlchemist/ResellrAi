/**
 * eBay Metadata Service
 *
 * Fetches category-specific metadata from eBay's Sell Metadata API.
 * Used to get valid conditions for a given category to prevent error 25059.
 *
 * Key functionality:
 * - Fetch item condition policies for a category
 * - Map numeric condition IDs to eBay enum values
 * - In-memory cache with 24-hour TTL
 * - Validation helper for server-side condition validation
 */

import { getEbayClient } from './client.js';
import type {
  EbayItemCondition,
  NormalizedItemCondition,
  CategoryConditionsResult,
} from '../../types/ebay-schemas.js';

// =============================================================================
// CONDITION ID MAPPING
// =============================================================================

/**
 * Maps eBay numeric condition IDs to API enum values
 * Reference: https://developer.ebay.com/api-docs/sell/static/metadata/condition-id-values.html
 */
const CONDITION_ID_TO_ENUM: Record<string, string> = {
  '1000': 'NEW',
  '1500': 'NEW_OTHER',
  '1750': 'NEW_WITH_DEFECTS',
  '2000': 'CERTIFIED_REFURBISHED',
  '2010': 'EXCELLENT_REFURBISHED',
  '2020': 'VERY_GOOD_REFURBISHED',
  '2030': 'GOOD_REFURBISHED',
  '2500': 'SELLER_REFURBISHED',
  '2750': 'LIKE_NEW',
  '3000': 'USED_EXCELLENT',
  '4000': 'USED_VERY_GOOD',
  '5000': 'USED_GOOD',
  '6000': 'USED_ACCEPTABLE',
  '7000': 'FOR_PARTS_OR_NOT_WORKING',
};

/**
 * Human-readable labels for condition IDs
 */
const CONDITION_ID_TO_LABEL: Record<string, string> = {
  '1000': 'New',
  '1500': 'New other (see details)',
  '1750': 'New with defects',
  '2000': 'Certified - Refurbished',
  '2010': 'Excellent - Refurbished',
  '2020': 'Very Good - Refurbished',
  '2030': 'Good - Refurbished',
  '2500': 'Seller refurbished',
  '2750': 'Like New',
  '3000': 'Used',
  '4000': 'Very Good',
  '5000': 'Good',
  '6000': 'Acceptable',
  '7000': 'For parts or not working',
};

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 1000;

interface CacheEntry {
  data: CategoryConditionsResult;
  timestamp: number;
}

// =============================================================================
// EBAY API RESPONSE TYPES
// =============================================================================

interface EbayConditionPolicy {
  categoryId: string;
  categoryTreeId: string;
  conditionEnabled: boolean;
  conditionRequired: boolean;
  itemConditions?: Array<{
    conditionId: string;
    conditionDescription: string;
    conditionDescriptorConstraint?: string;
  }>;
}

interface EbayConditionPoliciesResponse {
  itemConditionPolicies?: EbayConditionPolicy[];
}

// =============================================================================
// METADATA SERVICE
// =============================================================================

export class EbayMetadataService {
  private ebayClient: ReturnType<typeof getEbayClient>;
  private cache: Map<string, CacheEntry> = new Map();

  constructor() {
    this.ebayClient = getEbayClient();
  }

  /**
   * Get item condition policies for a category
   *
   * @param categoryId - eBay category ID
   * @param marketplace - Marketplace ID (default: EBAY_US)
   * @param accessToken - User's access token
   * @returns Normalized conditions with API enum values
   */
  async getItemConditionPolicies(
    categoryId: string,
    marketplace: string = 'EBAY_US',
    accessToken: string
  ): Promise<CategoryConditionsResult> {
    const cacheKey = `${marketplace}:${categoryId}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return {
        ...cached.data,
        cached: true,
        cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000),
      };
    }

    // Fetch from eBay API
    try {
      const filter = encodeURIComponent(`categoryIds:{${categoryId}}`);
      const response = await this.ebayClient.authenticatedRequest<EbayConditionPoliciesResponse>(
        accessToken,
        {
          method: 'GET',
          path: `/sell/metadata/v1/marketplace/${marketplace}/get_item_condition_policies?filter=${filter}`,
        }
      );

      if (!response.success || !response.data?.itemConditionPolicies) {
        console.warn(`[eBay Metadata] Failed to fetch conditions for category ${categoryId}:`, response.error);
        return this.buildEmptyResult(categoryId);
      }

      const policy = response.data.itemConditionPolicies[0];
      if (!policy) {
        console.warn(`[eBay Metadata] No policy found for category ${categoryId}`);
        return this.buildEmptyResult(categoryId);
      }

      const result = this.normalizeConditions(categoryId, policy);

      // Update cache
      this.setCache(cacheKey, result);

      return {
        ...result,
        cached: false,
      };
    } catch (error) {
      console.error(`[eBay Metadata] Error fetching conditions for category ${categoryId}:`, error);
      return this.buildEmptyResult(categoryId);
    }
  }

  /**
   * Validate that a condition is valid for a given category
   *
   * @param categoryId - eBay category ID
   * @param conditionId - Condition ID (numeric string or enum)
   * @param accessToken - User's access token
   * @param marketplace - Marketplace ID
   * @returns Validation result with valid conditions if invalid
   */
  async validateCondition(
    categoryId: string,
    conditionId: string,
    accessToken: string,
    marketplace: string = 'EBAY_US'
  ): Promise<{
    valid: boolean;
    error?: string;
    validConditions?: NormalizedItemCondition[];
  }> {
    const policies = await this.getItemConditionPolicies(categoryId, marketplace, accessToken);

    // If no conditions returned, assume any condition is valid (let eBay validate)
    if (policies.conditions.length === 0) {
      return { valid: true };
    }

    // Check if condition is in the allowed list
    // Support both numeric IDs and enum values
    const isValid = policies.conditions.some(
      (c) => c.id === conditionId || c.apiEnum === conditionId
    );

    if (isValid) {
      return { valid: true };
    }

    // Build error message with valid options
    const validOptions = policies.conditions.map((c) => c.label).join(', ');
    return {
      valid: false,
      error: `Condition "${conditionId}" is not valid for category ${categoryId}. Valid conditions: ${validOptions}`,
      validConditions: policies.conditions,
    };
  }

  /**
   * Get the API enum value for a condition ID
   */
  getConditionEnum(conditionId: string): string | undefined {
    return CONDITION_ID_TO_ENUM[conditionId];
  }

  /**
   * Normalize eBay condition policy to frontend format
   */
  private normalizeConditions(
    categoryId: string,
    policy: EbayConditionPolicy
  ): CategoryConditionsResult {
    const conditions: NormalizedItemCondition[] = [];

    if (policy.itemConditions) {
      for (const item of policy.itemConditions) {
        const apiEnum = CONDITION_ID_TO_ENUM[item.conditionId];
        const label = CONDITION_ID_TO_LABEL[item.conditionId] || item.conditionDescription;

        if (apiEnum) {
          conditions.push({
            id: item.conditionId,
            label,
            description: item.conditionDescription,
            apiEnum,
          });
        }
      }
    }

    return {
      categoryId,
      conditionRequired: policy.conditionRequired,
      conditions,
      cached: false,
    };
  }

  /**
   * Build empty result for error cases
   */
  private buildEmptyResult(categoryId: string): CategoryConditionsResult {
    return {
      categoryId,
      conditionRequired: false,
      conditions: [],
      cached: false,
    };
  }

  /**
   * Set cache entry with automatic cleanup
   */
  private setCache(key: string, data: CategoryConditionsResult): void {
    // Clean up old entries if cache is full
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      this.cleanupCache();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Remove oldest entries from cache
   */
  private cleanupCache(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 20%
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }

    console.log(`[eBay Metadata] Cache cleanup: removed ${toRemove} entries`);
  }

  /**
   * Clear the cache (for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats (for debugging)
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_ENTRIES,
      ttlMs: CACHE_TTL_MS,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: EbayMetadataService | null = null;

export function getEbayMetadataService(): EbayMetadataService {
  if (!serviceInstance) {
    serviceInstance = new EbayMetadataService();
  }
  return serviceInstance;
}
