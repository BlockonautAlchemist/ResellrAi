/**
 * eBay Aspects Service
 *
 * Fetches category-specific item aspects metadata from eBay Taxonomy API.
 * Used to get required/recommended item specifics for a given category.
 *
 * Key functionality:
 * - Fetch item aspects for a category
 * - In-memory cache with 24-hour TTL
 * - Returns required vs recommended aspects
 *
 * API Reference: https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getItemAspectsForCategory
 */

import { getEbayClient } from './client.js';

// =============================================================================
// TYPES
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
 * Complete item aspects metadata for a category
 */
export interface ItemAspectsMetadata {
  categoryId: string;
  categoryTreeId: string;
  requiredAspects: AspectDefinition[];
  recommendedAspects: AspectDefinition[];
  cached: boolean;
  cacheAge?: number;  // Seconds since cached
}

// =============================================================================
// EBAY API RESPONSE TYPES
// =============================================================================

interface EbayAspectValue {
  localizedValue: string;
}

interface EbayAspectConstraint {
  aspectMode: 'FREE_TEXT' | 'SELECTION_ONLY';
  aspectRequired: boolean;
  aspectMaxLength?: number;
}

interface EbayAspect {
  localizedAspectName: string;
  aspectConstraint: EbayAspectConstraint;
  aspectValues?: EbayAspectValue[];
}

interface EbayGetItemAspectsResponse {
  categoryId: string;
  categoryTreeId: string;
  aspects?: EbayAspect[];
}

// =============================================================================
// CATEGORY TREE IDS BY MARKETPLACE
// =============================================================================

/**
 * eBay category tree IDs by marketplace
 * Reference: https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getDefaultCategoryTreeId
 */
export const ASPECT_CATEGORY_TREE_IDS: Record<string, string> = {
  EBAY_US: '0',
  EBAY_GB: '3',
  EBAY_DE: '77',
  EBAY_AU: '15',
  EBAY_CA: '2',
  EBAY_FR: '71',
  EBAY_IT: '101',
  EBAY_ES: '186',
};

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 1000;

interface CacheEntry {
  data: ItemAspectsMetadata;
  timestamp: number;
}

// =============================================================================
// ASPECTS SERVICE
// =============================================================================

export class EbayAspectsService {
  private ebayClient: ReturnType<typeof getEbayClient>;
  private cache: Map<string, CacheEntry> = new Map();

  constructor() {
    this.ebayClient = getEbayClient();
  }

  /**
   * Get item aspects for a category
   *
   * @param categoryId - eBay category ID
   * @param marketplace - Marketplace ID (default: EBAY_US)
   * @param accessToken - User's access token
   * @returns Item aspects metadata with required and recommended aspects
   */
  async getItemAspectsForCategory(
    categoryId: string,
    marketplace: string = 'EBAY_US',
    accessToken: string
  ): Promise<ItemAspectsMetadata> {
    const cacheKey = `${marketplace}:${categoryId}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[eBay Aspects] Cache hit for category ${categoryId}`);
      return {
        ...cached.data,
        cached: true,
        cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000),
      };
    }

    // Get category tree ID for marketplace
    const categoryTreeId = ASPECT_CATEGORY_TREE_IDS[marketplace] || '0';

    // Fetch from eBay Taxonomy API
    console.log(`[eBay Aspects] Fetching aspects for category ${categoryId} (tree: ${categoryTreeId})`);

    try {
      const response = await this.ebayClient.authenticatedRequest<EbayGetItemAspectsResponse>(
        accessToken,
        {
          method: 'GET',
          path: `/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
        }
      );

      if (!response.success || !response.data) {
        console.warn(`[eBay Aspects] Failed to fetch aspects for category ${categoryId}:`, response.error);
        return this.buildEmptyResult(categoryId, categoryTreeId);
      }

      const result = this.normalizeAspects(response.data);

      // Log what we found
      console.log(`[eBay Aspects] Found ${result.requiredAspects.length} required, ${result.recommendedAspects.length} recommended aspects for category ${categoryId}`);
      if (result.requiredAspects.length > 0) {
        console.log(`[eBay Aspects] Required aspects: ${result.requiredAspects.map(a => a.name).join(', ')}`);
      }

      // Update cache
      this.setCache(cacheKey, result);

      return {
        ...result,
        cached: false,
      };
    } catch (error) {
      console.error(`[eBay Aspects] Error fetching aspects for category ${categoryId}:`, error);
      return this.buildEmptyResult(categoryId, categoryTreeId);
    }
  }

  /**
   * Normalize eBay API response to our format
   */
  private normalizeAspects(data: EbayGetItemAspectsResponse): ItemAspectsMetadata {
    const requiredAspects: AspectDefinition[] = [];
    const recommendedAspects: AspectDefinition[] = [];

    if (data.aspects) {
      for (const aspect of data.aspects) {
        const normalized: AspectDefinition = {
          name: aspect.localizedAspectName,
          required: aspect.aspectConstraint.aspectRequired,
          mode: aspect.aspectConstraint.aspectMode,
          maxLength: aspect.aspectConstraint.aspectMaxLength,
        };

        // Extract allowed values for SELECTION_ONLY mode
        if (aspect.aspectConstraint.aspectMode === 'SELECTION_ONLY' && aspect.aspectValues) {
          normalized.allowedValues = aspect.aspectValues.map(v => v.localizedValue);
        }

        if (aspect.aspectConstraint.aspectRequired) {
          requiredAspects.push(normalized);
        } else {
          recommendedAspects.push(normalized);
        }
      }
    }

    return {
      categoryId: data.categoryId,
      categoryTreeId: data.categoryTreeId,
      requiredAspects,
      recommendedAspects,
      cached: false,
    };
  }

  /**
   * Build empty result for error cases
   */
  private buildEmptyResult(categoryId: string, categoryTreeId: string): ItemAspectsMetadata {
    return {
      categoryId,
      categoryTreeId,
      requiredAspects: [],
      recommendedAspects: [],
      cached: false,
    };
  }

  /**
   * Set cache entry with automatic cleanup
   */
  private setCache(key: string, data: ItemAspectsMetadata): void {
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

    console.log(`[eBay Aspects] Cache cleanup: removed ${toRemove} entries`);
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

let serviceInstance: EbayAspectsService | null = null;

export function getEbayAspectsService(): EbayAspectsService {
  if (!serviceInstance) {
    serviceInstance = new EbayAspectsService();
  }
  return serviceInstance;
}
