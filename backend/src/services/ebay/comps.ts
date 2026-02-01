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
  cachedAt: number;
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
    String(query.limit ?? 20),
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
    const cacheAge = Math.floor((Date.now() - entry.cachedAt) / 1000);
    return { ...entry.result, cached: true, cache_age: cacheAge };
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
  const now = Date.now();
  const expiresAt = now + COMPS_CACHE_TTL_MS;

  compsCache.set(key, {
    result: { ...result, cache_expires_at: new Date(expiresAt).toISOString() },
    cachedAt: now,
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
// QUERY SHAPING (Tokenization & Multi-Query Ladder)
// =============================================================================

const FLUFF_TOKENS = new Set([
  'the', 'and', 'with', 'for', 'new', 'used',
  'mens', 'womens', 'women', 'unisex', 'size',
  'shirt', 'tee', 'tshirt', 't-shirt'
]);

/** Extract identifier-like tokens (model numbers, SKUs, part numbers) */
function extractIdentifiers(text: string): string[] {
  const identifiers: string[] = [];
  // Match: 8-14 digit sequences, or alnum with -/ inside (length >= 5)
  const patterns = [
    /\b\d{8,14}\b/g,                           // long digit sequences
    /\b[A-Z0-9]+-[A-Z0-9-]+\b/gi,              // hyphenated codes (DH1234-001)
    /\b[A-Z0-9]+\/[A-Z0-9]+\b/gi,              // slash codes (MT2K3LL/A)
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      if (m.length >= 5) identifiers.push(m.toLowerCase());
    }
  }
  return [...new Set(identifiers)];
}

/** Tokenize preserving hyphens/slashes inside tokens */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;:!?()[\]{}]+/)
    .map(t => t.replace(/^['"]+|['"]+$/g, ''))  // trim quotes
    .filter(t => t.length > 0);
}

/** Clean keywords: remove fluff, preserve identifiers, cap at 14 tokens */
function cleanKeywords(keywords: string): {
  tokens: string[];
  identifiers: string[];
  brandTokens: string[];  // tokens that must appear in matches
} {
  const identifiers = extractIdentifiers(keywords);
  let tokens = tokenize(keywords);

  // Remove fluff tokens
  tokens = tokens.filter(t => !FLUFF_TOKENS.has(t));

  // Cap at 14 tokens
  tokens = tokens.slice(0, 14);

  // Identify brand tokens (first 1-2 non-fluff, non-identifier tokens)
  const brandTokens = tokens
    .filter(t => !identifiers.includes(t) && t.length > 2)
    .slice(0, 2);

  return { tokens, identifiers, brandTokens };
}

/** Check if query contains a multi-word brand that requires both parts */
function getRequiredBrandPair(tokens: string[]): [string, string] | null {
  // "harley davidson" -> both required to avoid "Harley Quinn"
  if (tokens.includes('harley') && tokens.includes('davidson')) {
    return ['harley', 'davidson'];
  }
  // Add more brand pairs as needed (e.g., "north face", "under armour")
  if (tokens.includes('north') && tokens.includes('face')) {
    return ['north', 'face'];
  }
  if (tokens.includes('under') && tokens.includes('armour')) {
    return ['under', 'armour'];
  }
  return null;
}

/** Build 3-5 query variations in priority order */
function buildQueryLadder(original: string): string[] {
  const { tokens, identifiers } = cleanKeywords(original);
  const queries: string[] = [];

  // 1) Identifier-only query (highest priority if found)
  if (identifiers.length > 0) {
    queries.push(identifiers[0]);
    // 2) Identifier + first 2-3 non-identifier tokens
    const nonIdTokens = tokens.filter(t => !identifiers.includes(t)).slice(0, 3);
    if (nonIdTokens.length > 0) {
      queries.push([identifiers[0], ...nonIdTokens].join(' '));
    }
  }

  // 3) Brand + model + top tokens (max 6)
  if (tokens.length > 0) {
    queries.push(tokens.slice(0, 6).join(' '));
  }

  // 4) Full cleaned query (up to 14 tokens)
  if (tokens.length > 6) {
    queries.push(tokens.join(' '));
  }

  // 5) Broader fallback (top 3-4 tokens)
  if (tokens.length > 4) {
    queries.push(tokens.slice(0, 4).join(' '));
  }

  // Dedupe and return unique queries in order
  return [...new Set(queries)].slice(0, 5);
}

// =============================================================================
// SCORING SYSTEM
// =============================================================================

const ACCESSORY_TERMS = new Set([
  'case', 'cover', 'screen protector', 'protector', 'tempered glass',
  'lens', 'camera lens', 'charger', 'cable', 'adapter', 'dock',
  'replacement', 'parts', 'housing', 'kit', 'bundle', 'lot',
  '2pcs', '3pcs', 'set', 'for iphone', 'for samsung', 'for galaxy',
  'for ipad', 'compatible'
]);

const PRODUCT_KEYWORDS = new Set([
  'iphone', 'galaxy', 'samsung', 'pixel', 'playstation', 'xbox', 'nintendo',
  'macbook', 'ipad', 'airpods', 'nike', 'jordan', 'adidas', 'yeezy',
  'rolex', 'dewalt', 'milwaukee', 'makita', 'dyson', 'gopro'
]);

interface ScoredItem {
  item: EbayCompItem;
  score: number;
}

function scoreCandidate(
  queryTokens: string[],
  identifiers: string[],
  brandTokens: string[],
  requiredBrandPair: [string, string] | null,
  item: EbayCompItem,
  hasPrimaryProduct: boolean,
  queryHasAccessoryTerms: boolean
): number {
  const titleLower = item.title.toLowerCase();
  let score = 0;

  // +100 per identifier match in title
  for (const id of identifiers) {
    if (titleLower.includes(id)) score += 100;
  }

  // +10 per identifier token match, +2 per regular token match
  for (const token of queryTokens) {
    if (titleLower.includes(token)) {
      score += identifiers.includes(token) ? 10 : 2;
    }
  }

  // Must-have brand token check
  // If brand tokens exist and NONE appear in title, heavy penalty
  if (brandTokens.length > 0) {
    const hasBrandMatch = brandTokens.some(bt => titleLower.includes(bt));
    if (!hasBrandMatch) {
      score -= 50;  // Heavy penalty for missing brand entirely
    }
  }

  // Required brand pair check (e.g., Harley-Davidson)
  if (requiredBrandPair) {
    const [first, second] = requiredBrandPair;
    const hasFirst = titleLower.includes(first);
    const hasSecond = titleLower.includes(second);
    // Must have both, or the bigram
    const hasBigram = titleLower.includes(`${first} ${second}`) ||
                      titleLower.includes(`${first}-${second}`);
    if (!hasBigram && !(hasFirst && hasSecond)) {
      score -= 80;  // Very heavy penalty (Harley Quinn != Harley-Davidson)
    }
  }

  // Accessory term handling (improved)
  if (hasPrimaryProduct && !queryHasAccessoryTerms) {
    // Primary product search without accessory terms in query
    // Drop candidates with accessory terms in title
    for (const term of ACCESSORY_TERMS) {
      if (titleLower.includes(term)) {
        score -= 30;
        break;
      }
    }
  }

  // -15 for lot/bundle/set if not in query
  const queryStr = queryTokens.join(' ');
  if (!queryStr.includes('lot') && !queryStr.includes('bundle') && !queryStr.includes('set')) {
    if (/\b(lot|bundle|set|2pcs|3pcs)\b/i.test(titleLower)) {
      score -= 15;
    }
  }

  return score;
}

/** Check if query has accessory terms at the start (accessory intent) */
function queryStartsWithAccessory(keywords: string): boolean {
  const lower = keywords.toLowerCase().trim();
  for (const term of ACCESSORY_TERMS) {
    if (lower.startsWith(term)) return true;
  }
  return false;
}

/** Check if query contains any accessory terms */
function queryHasAccessoryTerms(keywords: string): boolean {
  const lower = keywords.toLowerCase();
  for (const term of ACCESSORY_TERMS) {
    if (lower.includes(term)) return true;
  }
  return false;
}

function hasPrimaryProductIntent(keywords: string, identifiers: string[]): boolean {
  // If query starts with accessory term, it's accessory intent, not primary
  if (queryStartsWithAccessory(keywords)) return false;

  if (identifiers.length > 0) return true;
  const lower = keywords.toLowerCase();
  for (const kw of PRODUCT_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
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
  shippingOptions?: Array<{
    shippingCostType?: string;
    shippingCost?: {
      value: string;
      currency: string;
    };
  }>;
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
   * Get pricing comparables for a query.
   * Requires a valid eBay access token (resolved by the caller; comps does not fetch tokens).
   */
  async getComps(query: EbayCompsQuery, accessToken: string): Promise<EbayCompsResult> {
    const startTime = Date.now();

    // Validate input
    const validatedQuery = EbayCompsQuerySchema.parse(query);

    // Check cache first (cache is independent of user/auth)
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
      console.log(`[eBay Comps] attempting active comps (sold source=${result.source}, sold n=${result.stats.sample_size}, accessTokenPresent=${!!accessToken})`);
      const activeResult = await this.fetchActiveComps(validatedQuery, accessToken);

      // If sold had no data, return activeResult regardless of sample size
      if (result.source === 'none') {
        result = activeResult;
      } else if (activeResult.stats.sample_size > result.stats.sample_size) {
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
   * Fetch active listings using multi-query ladder and reranking.
   * Browse API requires a valid user access token (Bearer); no unauthenticated access.
   */
  private async fetchActiveComps(
    query: EbayCompsQuery,
    accessToken: string
  ): Promise<EbayCompsResult> {
    try {
      const { tokens: queryTokens, identifiers, brandTokens } = cleanKeywords(query.keywords);
      const requiredBrandPair = getRequiredBrandPair(queryTokens);
      const ladder = buildQueryLadder(query.keywords);
      const hasPrimaryProduct = hasPrimaryProductIntent(query.keywords, identifiers);
      const hasAccessoryTerms = queryHasAccessoryTerms(query.keywords);
      const limit = query.limit || 20;
      const targetCandidates = limit * 3;

      console.log(`[eBay Comps] Query ladder: ${JSON.stringify(ladder)}`);

      // Fetch candidates across ladder queries
      const seenIds = new Set<string>();
      const allCandidates: EbayCompItem[] = [];

      for (const ladderQuery of ladder) {
        if (allCandidates.length >= targetCandidates) break;

        const items = await this.searchEbay(ladderQuery, limit, query, accessToken);
        const parsed = this.parseItems(items);

        for (const item of parsed) {
          if (!seenIds.has(item.item_id)) {
            seenIds.add(item.item_id);
            allCandidates.push(item);
          }
        }

        console.log(`[eBay Comps] Ladder "${ladderQuery}": +${parsed.length} items, total unique: ${allCandidates.length}`);
      }

      if (allCandidates.length === 0) {
        return this.buildEmptyResult(query, 'none', [
          'No matching items found on eBay',
          'Try broader search terms',
        ]);
      }

      // Score and rank candidates
      const scored: ScoredItem[] = allCandidates.map(item => ({
        item,
        score: scoreCandidate(
          queryTokens,
          identifiers,
          brandTokens,
          requiredBrandPair,
          item,
          hasPrimaryProduct,
          hasAccessoryTerms
        ),
      }));

      // Sort: descending score, then by total_cost (ascending), then by item_id (stable)
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.item.total_cost !== b.item.total_cost) return a.item.total_cost - b.item.total_cost;
        return a.item.item_id.localeCompare(b.item.item_id);
      });

      const bestScore = scored.length > 0 ? scored[0].score : 0;

      // Partition into quality tiers
      const strongThreshold = Math.max(55, bestScore - 10);
      const mediumThreshold = Math.max(45, bestScore - 20);

      const strong = scored.filter(s => s.score >= strongThreshold);
      const medium = scored.filter(s => s.score >= mediumThreshold && s.score < strongThreshold);

      console.log(`[eBay Comps] match scores: best=${bestScore} strong=${strong.length} medium=${medium.length} total=${scored.length}`);

      // Choose which set to use for stats
      let statsItems: ScoredItem[];
      let matchQuality: 'strong' | 'medium' | 'weak';

      if (strong.length >= 5) {
        statsItems = strong;
        matchQuality = 'strong';
      } else if (strong.length + medium.length >= 5) {
        statsItems = [...strong, ...medium];
        matchQuality = 'medium';
      } else {
        // Weak match quality - use best available items (15-25 range)
        const weakLimit = Math.min(Math.max(15, limit), 25);
        statsItems = scored.slice(0, weakLimit);
        matchQuality = 'weak';
        console.log(`[eBay Comps] Weak match quality: using top ${statsItems.length} items (strong=${strong.length}, medium=${medium.length})`);
      }

      // Take top N from chosen set
      const topItems = statsItems.slice(0, matchQuality === 'weak' ? Math.min(25, Math.max(15, limit)) : limit).map(s => s.item);

      console.log(`[eBay Comps] Reranked: ${allCandidates.length} candidates -> ${topItems.length} results (quality=${matchQuality})`);

      // Stats on reranked results
      const stats = this.calculateStats(topItems, 'active');
      const limitations = this.buildLimitations('active', topItems.length, query);

      // Add match quality messages
      if (matchQuality === 'strong') {
        limitations.push('Stats based on closest matches to your item title');
      } else if (matchQuality === 'medium') {
        limitations.push('Exact match not found; stats based on broader similar items');
      } else if (matchQuality === 'weak') {
        limitations.push(`Weak match quality; add model/UPC/MPN/size/year for better comps (strong: ${strong.length}, medium: ${medium.length})`);
        // Override confidence to low for weak matches
        stats.confidence = topItems.length >= 5 ? 'low' : 'none';
      }

      limitations.push('Results reranked for similarity; still based on active listings');

      return {
        source: 'active',
        data: topItems,
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
      console.error('[eBay Comps] Error:', error);
      return this.buildEmptyResult(query, 'none', [
        'Error fetching eBay data',
        error instanceof Error ? error.message : 'Unknown error',
      ]);
    }
  }

  /** Single eBay search call with bestMatch sorting (fallback to no sort) */
  private async searchEbay(
    keywords: string,
    limit: number,
    query: EbayCompsQuery,
    accessToken: string
  ): Promise<EbayItemSummary[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('q', keywords);
    searchParams.set('limit', String(limit));
    searchParams.set('sort', 'bestMatch');

    if (query.category_id) {
      searchParams.set('category_ids', query.category_id);
    }
    if (query.condition) {
      const conditionId = this.mapConditionToId(query.condition);
      if (conditionId) {
        searchParams.set('filter', `conditionIds:{${conditionId}}`);
      }
    }

    const path = `/buy/browse/v1/item_summary/search?${searchParams.toString()}`;

    let response = await this.ebayClient.request<EbaySearchResponse>({
      method: 'GET',
      path,
      accessToken,
      headers: { 'X-EBAY-C-MARKETPLACE-ID': query.marketplace_id },
    });

    // Fallback: if bestMatch rejected, retry without sort
    if (!response.success && response.error?.error.message?.toLowerCase().includes('sort')) {
      searchParams.delete('sort');
      const fallbackPath = `/buy/browse/v1/item_summary/search?${searchParams.toString()}`;
      response = await this.ebayClient.request<EbaySearchResponse>({
        method: 'GET',
        path: fallbackPath,
        accessToken,
        headers: { 'X-EBAY-C-MARKETPLACE-ID': query.marketplace_id },
      });
    }

    return response.data?.itemSummaries || [];
  }

  /**
   * Parse eBay item summaries into our format
   */
  private parseItems(items: EbayItemSummary[]): EbayCompItem[] {
    return items
      .filter((item) => item.price?.value) // Must have price
      .map((item) => {
        const price = parseFloat(item.price!.value);

        // Extract shipping cost (0 if free shipping or not specified)
        let shippingCost = 0;
        if (item.shippingOptions && item.shippingOptions.length > 0) {
          const firstOption = item.shippingOptions[0];
          if (firstOption.shippingCost?.value) {
            shippingCost = parseFloat(firstOption.shippingCost.value);
          }
          // If shippingCostType is 'FREE', shipping is 0
        }

        return {
          item_id: item.itemId,
          title: item.title,
          price: {
            value: price,
            currency: item.price!.currency || 'USD',
          },
          shipping_cost: shippingCost,
          total_cost: price + shippingCost,
          condition: item.condition || 'Unknown',
          item_url: item.itemWebUrl || `https://www.ebay.com/itm/${item.itemId}`,
          image_url: item.image?.imageUrl,
          seller: item.seller
            ? {
                username: item.seller.username,
                feedback_score: item.seller.feedbackScore,
              }
            : undefined,
        };
      });
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
