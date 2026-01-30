/**
 * eBay Taxonomy API Service
 *
 * Suggests eBay categories based on item attributes using the Commerce Taxonomy API.
 *
 * API Endpoint: GET /commerce/taxonomy/v1/category_tree/{tree_id}/get_category_suggestions
 *
 * Features:
 * - Category suggestions from item title/keywords
 * - 24-hour caching to reduce API calls
 * - Supports US marketplace (tree ID: 0)
 */

import { getEbayClient } from './client.js';
import { z } from 'zod';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Category suggestion from eBay Taxonomy API
 */
export const CategorySuggestionSchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  categoryPath: z.array(z.string()),
  relevance: z.enum(['HIGH', 'MEDIUM', 'LOW']),
});
export type CategorySuggestion = z.infer<typeof CategorySuggestionSchema>;

/**
 * Category suggestions response
 */
export const CategorySuggestionsResultSchema = z.object({
  suggestions: z.array(CategorySuggestionSchema),
  query: z.string(),
  marketplace: z.string(),
  cached: z.boolean(),
  cacheAge: z.number().optional(), // seconds since cached
});
export type CategorySuggestionsResult = z.infer<typeof CategorySuggestionsResultSchema>;

// =============================================================================
// eBay API RESPONSE TYPES
// =============================================================================

interface EbayCategorySuggestionResponse {
  categorySuggestions?: Array<{
    category?: {
      categoryId?: string;
      categoryName?: string;
    };
    categoryTreeNodeAncestors?: Array<{
      categoryId?: string;
      categoryName?: string;
    }>;
    categoryTreeNodeLevel?: number;
    relevancy?: string;
  }>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Category tree IDs by marketplace
 * https://developer.ebay.com/api-docs/commerce/taxonomy/overview.html
 */
export const CATEGORY_TREE_IDS: Record<string, number> = {
  EBAY_US: 0,
  EBAY_UK: 3,
  EBAY_DE: 77,
  EBAY_AU: 15,
  EBAY_CA: 2,
  EBAY_FR: 71,
  EBAY_IT: 101,
  EBAY_ES: 186,
};

/**
 * Cache TTL: 24 hours (categories rarely change)
 */
const TAXONOMY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// =============================================================================
// CACHE
// =============================================================================

interface TaxonomyCacheEntry {
  result: CategorySuggestionsResult;
  cachedAt: number;
}

const taxonomyCache = new Map<string, TaxonomyCacheEntry>();

/**
 * Generate cache key from query and marketplace
 */
function getCacheKey(query: string, marketplace: string): string {
  return `${marketplace}:${query.toLowerCase().trim()}`;
}

/**
 * Get cached result if valid
 */
function getCachedResult(query: string, marketplace: string): CategorySuggestionsResult | null {
  const key = getCacheKey(query, marketplace);
  const entry = taxonomyCache.get(key);

  if (entry && (Date.now() - entry.cachedAt) < TAXONOMY_CACHE_TTL_MS) {
    const cacheAge = Math.floor((Date.now() - entry.cachedAt) / 1000);
    return { ...entry.result, cached: true, cacheAge };
  }

  if (entry) {
    taxonomyCache.delete(key);
  }

  return null;
}

/**
 * Store result in cache
 */
function cacheResult(query: string, marketplace: string, result: CategorySuggestionsResult): void {
  const key = getCacheKey(query, marketplace);
  taxonomyCache.set(key, {
    result: { ...result, cached: false },
    cachedAt: Date.now(),
  });

  // Clean old entries periodically
  if (taxonomyCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of taxonomyCache.entries()) {
      if ((now - v.cachedAt) > TAXONOMY_CACHE_TTL_MS) {
        taxonomyCache.delete(k);
      }
    }
  }
}

// =============================================================================
// TAXONOMY SERVICE
// =============================================================================

export class EbayTaxonomyService {
  private ebayClient: ReturnType<typeof getEbayClient>;

  constructor() {
    this.ebayClient = getEbayClient();
  }

  /**
   * Get category suggestions for a query
   *
   * @param query - Search query (item title, keywords, brand)
   * @param marketplace - eBay marketplace ID (default: EBAY_US)
   * @returns Array of suggested categories with relevance
   */
  async getCategorySuggestions(
    query: string,
    marketplace: string = 'EBAY_US'
  ): Promise<CategorySuggestionsResult> {
    const startTime = Date.now();

    // Validate query
    if (!query || query.trim().length === 0) {
      return {
        suggestions: [],
        query,
        marketplace,
        cached: false,
      };
    }

    const normalizedQuery = query.trim();

    // Check cache first
    const cached = getCachedResult(normalizedQuery, marketplace);
    if (cached) {
      console.log(
        `[eBay Taxonomy] Cache hit for "${normalizedQuery}" (${cached.suggestions.length} suggestions)`
      );
      return cached;
    }

    console.log(`[eBay Taxonomy] Fetching suggestions for "${normalizedQuery}"...`);

    try {
      // Get the category tree ID for the marketplace
      const treeId = CATEGORY_TREE_IDS[marketplace] ?? 0;

      // Build the API path
      const searchParams = new URLSearchParams();
      searchParams.set('q', normalizedQuery);

      const path = `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?${searchParams.toString()}`;

      // Make API request (Taxonomy API allows unauthenticated requests)
      const response = await this.ebayClient.request<EbayCategorySuggestionResponse>({
        method: 'GET',
        path,
        headers: {
          'Accept-Language': 'en-US',
        },
      });

      if (!response.success || !response.data) {
        console.error('[eBay Taxonomy] API error:', response.error);
        return {
          suggestions: [],
          query: normalizedQuery,
          marketplace,
          cached: false,
        };
      }

      // Parse suggestions
      const suggestions = this.parseSuggestions(response.data);

      const result: CategorySuggestionsResult = {
        suggestions,
        query: normalizedQuery,
        marketplace,
        cached: false,
      };

      // Cache the result
      cacheResult(normalizedQuery, marketplace, result);

      const duration = Date.now() - startTime;
      console.log(
        `[eBay Taxonomy] Query completed in ${duration}ms: ${suggestions.length} suggestions`
      );

      return result;
    } catch (error) {
      console.error('[eBay Taxonomy] Error fetching suggestions:', error);
      return {
        suggestions: [],
        query: normalizedQuery,
        marketplace,
        cached: false,
      };
    }
  }

  /**
   * Parse eBay API response into our format
   */
  private parseSuggestions(data: EbayCategorySuggestionResponse): CategorySuggestion[] {
    if (!data.categorySuggestions || !Array.isArray(data.categorySuggestions)) {
      return [];
    }

    return data.categorySuggestions
      .filter(suggestion => suggestion.category?.categoryId && suggestion.category?.categoryName)
      .map(suggestion => {
        // Build category path from ancestors
        const ancestors = suggestion.categoryTreeNodeAncestors || [];
        const categoryPath = [
          ...ancestors.map(a => a.categoryName || '').filter(Boolean),
          suggestion.category!.categoryName!,
        ];

        // Map eBay relevancy to our enum
        const relevance = this.mapRelevancy(suggestion.relevancy);

        return {
          categoryId: suggestion.category!.categoryId!,
          categoryName: suggestion.category!.categoryName!,
          categoryPath,
          relevance,
        };
      })
      .slice(0, 10); // Limit to top 10 suggestions
  }

  /**
   * Map eBay relevancy string to our enum
   */
  private mapRelevancy(relevancy?: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (!relevancy) return 'MEDIUM';

    const upper = relevancy.toUpperCase();
    if (upper === 'HIGH') return 'HIGH';
    if (upper === 'LOW') return 'LOW';
    return 'MEDIUM';
  }

  /**
   * Get the default category tree ID for a marketplace
   */
  getCategoryTreeId(marketplace: string): number {
    return CATEGORY_TREE_IDS[marketplace] ?? 0;
  }

  /**
   * Clear the cache (for testing)
   */
  clearCache(): void {
    taxonomyCache.clear();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let serviceInstance: EbayTaxonomyService | null = null;

/**
 * Get the singleton taxonomy service
 */
export function getEbayTaxonomyService(): EbayTaxonomyService {
  if (!serviceInstance) {
    serviceInstance = new EbayTaxonomyService();
  }
  return serviceInstance;
}
