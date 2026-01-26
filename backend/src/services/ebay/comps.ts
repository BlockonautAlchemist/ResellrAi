/**
 * eBay Pricing Comps Service
 *
 * Fetches comparable items from eBay and calculates pricing statistics.
 *
 * Data Source Priority:
 * 1. Sold items (if available via API) - labeled as source="sold"
 * 2. Active listings - labeled as source="active"
 * 3. No data - labeled as source="none"
 *
 * Rules:
 * - Always compute: median, avg, min, max, sample_size
 * - Always include limitations text
 * - Deterministic and unit-testable
 * - Log query, counts, timing
 */

import { getEbayClient } from './client.js';
import {
  EbayCompsQuerySchema,
  EbayCompsResultSchema,
  type EbayCompsQuery,
  type EbayCompsResult,
  type EbayCompItem,
  type EbayCompsSource,
  type EbayCompsStats,
  calculateMedian,
  calculateAverage,
  getCompsConfidence,
  COMPS_CACHE_TTL_MS,
  COMPS_SOURCE_MESSAGES,
} from '../../types/ebay-schemas.js';

// =============================================================================
// CACHE
// =============================================================================

interface CacheEntry {
  result: EbayCompsResult;
  expiresAt: number;
}

const compsCache = new Map<string, CacheEntry>();

/**
 * Generate cache key from query
 */
function getCacheKey(query: EbayCompsQuery): string {
  const parts = [
    query.keywords.toLowerCase().trim(),
    query.category_id || '',
    query.condition || '',
    query.brand || '',
    query.marketplace_id,
  ];
  return parts.join('|');
}

/**
 * Get cached result if valid
 */
function getCachedResult(query: EbayCompsQuery): EbayCompsResult | null {
  const key = getCacheKey(query);
  const entry = compsCache.get(key);

  if (entry && entry.expiresAt > Date.now()) {
    return { ...entry.result, cached: true };
  }

  if (entry) {
    compsCache.delete(key);
  }

  return null;
}

/**
 * Store result in cache
 */
function cacheResult(query: EbayCompsQuery, result: EbayCompsResult): void {
  const key = getCacheKey(query);
  const expiresAt = Date.now() + COMPS_CACHE_TTL_MS;

  compsCache.set(key, {
    result: { ...result, cache_expires_at: new Date(expiresAt).toISOString() },
    expiresAt,
  });

  // Clean old entries periodically
  if (compsCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of compsCache.entries()) {
      if (v.expiresAt < now) {
        compsCache.delete(k);
      }
    }
  }
}

// =============================================================================
// EBAY BROWSE API TYPES
// =============================================================================

interface EbaySearchResponse {
  href?: string;
  total?: number;
  limit?: number;
  offset?: number;
  itemSummaries?: EbayItemSummary[];
  warnings?: Array<{ errorId: string; message: string }>;
}

interface EbayItemSummary {
  itemId: string;
  title: string;
  price?: {
    value: string;
    currency: string;
  };
  condition?: string;
  conditionId?: string;
  itemWebUrl?: string;
  image?: {
    imageUrl: string;
  };
  seller?: {
    username: string;
    feedbackScore?: number;
    feedbackPercentage?: string;
  };
  itemEndDate?: string;
  buyingOptions?: string[];
}

// =============================================================================
// COMPS SERVICE
// =============================================================================

export class EbayCompsService {
  private ebayClient: ReturnType<typeof getEbayClient>;

  constructor() {
    this.ebayClient = getEbayClient();
  }

  /**
   * Get pricing comparables for a query
   */
  async getComps(query: EbayCompsQuery): Promise<EbayCompsResult> {
    const startTime = Date.now();

    // Validate input
    const validatedQuery = EbayCompsQuerySchema.parse(query);

    // Check cache first
    const cached = getCachedResult(validatedQuery);
    if (cached) {
      console.log(
        `[eBay Comps] Cache hit for "${validatedQuery.keywords}" (${cached.stats.sample_size} items)`
      );
      return cached;
    }

    console.log(`[eBay Comps] Fetching comps for "${validatedQuery.keywords}"...`);

    // Try to get sold items first, then fall back to active
    let result = await this.fetchSoldComps(validatedQuery);

    if (result.source === 'none' || result.stats.sample_size < 3) {
      // Not enough sold data, try active listings
      const activeResult = await this.fetchActiveComps(validatedQuery);

      if (activeResult.stats.sample_size > result.stats.sample_size) {
        result = activeResult;
      }
    }

    // Add timing
    const duration = Date.now() - startTime;
    console.log(
      `[eBay Comps] Query completed in ${duration}ms: source=${result.source}, count=${result.stats.sample_size}`
    );

    // Cache the result
    cacheResult(validatedQuery, result);

    return result;
  }

  /**
   * Fetch sold/completed items
   * Note: eBay Browse API doesn't directly provide sold items without special access.
   * This attempts to use filters that may indicate completed sales.
   */
  private async fetchSoldComps(query: EbayCompsQuery): Promise<EbayCompsResult> {
    // The Browse API's /item_summary/search endpoint doesn't have a direct "sold" filter
    // for public access. We return none here and rely on active listings.
    // In production with Marketplace Insights API access, this would be implemented.

    const limitations = [
      'Sold item data requires eBay Marketplace Insights API access',
      'Contact eBay Developer Program for sold data access',
    ];

    return this.buildEmptyResult(query, 'none', limitations);
  }

  /**
   * Fetch active listings
   */
  private async fetchActiveComps(query: EbayCompsQuery): Promise<EbayCompsResult> {
    try {
      // Build search URL
      const searchParams = new URLSearchParams();
      searchParams.set('q', query.keywords);
      searchParams.set('limit', String(query.limit || 20));

      if (query.category_id) {
        searchParams.set('category_ids', query.category_id);
      }

      // Map condition to eBay condition IDs
      if (query.condition) {
        const conditionId = this.mapConditionToId(query.condition);
        if (conditionId) {
          searchParams.set('filter', `conditionIds:{${conditionId}}`);
        }
      }

      // Add sort by price for better distribution
      searchParams.set('sort', 'price');

      const path = `/buy/browse/v1/item_summary/search?${searchParams.toString()}`;

      // Make API request (Browse API allows unauthenticated requests with app token)
      const response = await this.ebayClient.request<EbaySearchResponse>({
        method: 'GET',
        path,
        headers: {
          'X-EBAY-C-MARKETPLACE-ID': query.marketplace_id,
        },
      });

      if (!response.success || !response.data) {
        console.error('[eBay Comps] Browse API error:', response.error);
        return this.buildEmptyResult(query, 'none', [
          'eBay search temporarily unavailable',
          response.error?.error.message || 'Unknown error',
        ]);
      }

      const items = response.data.itemSummaries || [];

      if (items.length === 0) {
        return this.buildEmptyResult(query, 'none', [
          'No matching items found on eBay',
          'Try broader search terms',
        ]);
      }

      // Parse items
      const compItems = this.parseItems(items);

      // Calculate statistics
      const stats = this.calculateStats(compItems, 'active');

      // Build limitations
      const limitations = this.buildLimitations('active', compItems.length, query);

      return {
        source: 'active',
        data: compItems,
        stats,
        limitations,
        query: {
          keywords: query.keywords,
          category_id: query.category_id,
          marketplace_id: query.marketplace_id,
          executed_at: new Date().toISOString(),
        },
        cached: false,
      };
    } catch (error) {
      console.error('[eBay Comps] Error fetching active comps:', error);
      return this.buildEmptyResult(query, 'none', [
        'Error fetching eBay data',
        error instanceof Error ? error.message : 'Unknown error',
      ]);
    }
  }

  /**
   * Parse eBay item summaries into our format
   */
  private parseItems(items: EbayItemSummary[]): EbayCompItem[] {
    return items
      .filter((item) => item.price?.value) // Must have price
      .map((item) => ({
        item_id: item.itemId,
        title: item.title,
        price: {
          value: parseFloat(item.price!.value),
          currency: item.price!.currency || 'USD',
        },
        condition: item.condition || 'Unknown',
        item_url: item.itemWebUrl || `https://www.ebay.com/itm/${item.itemId}`,
        image_url: item.image?.imageUrl,
        seller: item.seller
          ? {
              username: item.seller.username,
              feedback_score: item.seller.feedbackScore,
            }
          : undefined,
      }));
  }

  /**
   * Calculate pricing statistics
   */
  private calculateStats(items: EbayCompItem[], source: EbayCompsSource): EbayCompsStats {
    const prices = items.map((item) => item.price.value);

    if (prices.length === 0) {
      return {
        median: null,
        average: null,
        min: null,
        max: null,
        sample_size: 0,
        confidence: 'none',
      };
    }

    const sorted = [...prices].sort((a, b) => a - b);

    return {
      median: calculateMedian(prices),
      average: calculateAverage(prices),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      sample_size: prices.length,
      confidence: getCompsConfidence(prices.length, source),
    };
  }

  /**
   * Build limitations text based on result
   */
  private buildLimitations(
    source: EbayCompsSource,
    count: number,
    query: EbayCompsQuery
  ): string[] {
    const limitations: string[] = [];

    if (source === 'active') {
      limitations.push('Prices based on active listings, not actual sales');
      limitations.push('Final selling prices may differ from listing prices');
    }

    if (count < 5) {
      limitations.push('Limited data available - estimates may be less accurate');
    }

    if (!query.category_id) {
      limitations.push('Results not filtered by category - may include unrelated items');
    }

    if (!query.condition) {
      limitations.push('Results include all conditions');
    }

    return limitations;
  }

  /**
   * Build empty result with limitations
   */
  private buildEmptyResult(
    query: EbayCompsQuery,
    source: EbayCompsSource,
    limitations: string[]
  ): EbayCompsResult {
    return {
      source,
      data: [],
      stats: {
        median: null,
        average: null,
        min: null,
        max: null,
        sample_size: 0,
        confidence: 'none',
      },
      limitations,
      query: {
        keywords: query.keywords,
        category_id: query.category_id,
        marketplace_id: query.marketplace_id,
        executed_at: new Date().toISOString(),
      },
      cached: false,
    };
  }

  /**
   * Map our condition enum to eBay condition IDs
   */
  private mapConditionToId(condition: string): string | null {
    const conditionMap: Record<string, string> = {
      NEW: '1000',
      LIKE_NEW: '3000',
      VERY_GOOD: '4000',
      GOOD: '5000',
      ACCEPTABLE: '6000',
    };
    return conditionMap[condition] || null;
  }

  /**
   * Clear the cache (for testing)
   */
  clearCache(): void {
    compsCache.clear();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let serviceInstance: EbayCompsService | null = null;

/**
 * Get the singleton comps service
 */
export function getEbayCompsService(): EbayCompsService {
  if (!serviceInstance) {
    serviceInstance = new EbayCompsService();
  }
  return serviceInstance;
}
