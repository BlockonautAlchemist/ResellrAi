/**
 * AI Category Suggester
 *
 * Combines vision output + generated title to infer the best eBay category.
 * Uses the eBay Taxonomy API to get category suggestions from multiple queries,
 * then ranks and deduplicates results to pick the best match.
 */

import { getEbayTaxonomyService, type CategorySuggestion } from './taxonomy.js';
import { getEbayAuthService } from './auth.js';
import { getListing } from '../listings-db.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AiCategorySuggestion {
  categoryId: string;
  categoryName: string;
  categoryTreeId: string;
  confidence: number; // 0-1
  reason: string;
}

export interface AiCategorySuggestResult {
  primary: AiCategorySuggestion;
  alternatives: AiCategorySuggestion[];
}

export interface SuggestCategoryInput {
  listingId?: string;
  title?: string;
  description?: string;
  visionOutput?: {
    detectedCategory?: { value: string; confidence: number };
    detectedBrand?: { value: string | null; confidence: number };
    detectedAttributes?: Array<{ key: string; value: string; confidence: number }>;
  };
}

// =============================================================================
// CACHE
// =============================================================================

interface CacheEntry {
  result: AiCategorySuggestResult;
  cachedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const suggestionCache = new Map<string, CacheEntry>();

function getCachedSuggestion(key: string): AiCategorySuggestResult | null {
  const entry = suggestionCache.get(key);
  if (entry && (Date.now() - entry.cachedAt) < CACHE_TTL_MS) {
    return entry.result;
  }
  if (entry) suggestionCache.delete(key);
  return null;
}

function cacheSuggestion(key: string, result: AiCategorySuggestResult): void {
  suggestionCache.set(key, { result, cachedAt: Date.now() });
  // Clean old entries
  if (suggestionCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of suggestionCache.entries()) {
      if ((now - v.cachedAt) > CACHE_TTL_MS) suggestionCache.delete(k);
    }
  }
}

// =============================================================================
// RELEVANCE SCORING
// =============================================================================

const RELEVANCE_SCORES: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const QUERY_SOURCE_WEIGHTS: Record<string, number> = {
  title: 2,
  category: 1.5,
  brandCategory: 1,
};

interface ScoredCategory {
  categoryId: string;
  categoryName: string;
  totalScore: number;
  sources: string[];
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Suggest eBay categories based on listing data and vision output.
 */
export async function suggestCategoryFromListing(
  input: SuggestCategoryInput,
  userId: string
): Promise<AiCategorySuggestResult> {
  let { title, description, visionOutput } = input;

  // If listingId provided, fetch from DB
  if (input.listingId) {
    const cached = getCachedSuggestion(input.listingId);
    if (cached) {
      console.log(`[AI Category] Cache hit for listing ${input.listingId}`);
      return cached;
    }

    const listing = await getListing(input.listingId);
    if (listing) {
      title = title || listing.listing_draft?.title?.value;
      description = description || listing.listing_draft?.description?.value;
      visionOutput = visionOutput || listing.vision_output || undefined;
    }
  }

  // Get access token for Taxonomy API (user token if connected, else app token)
  const authService = getEbayAuthService();
  let accessToken: string;
  try {
    accessToken = await authService.getAccessToken(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ebay_not_connected';
    if (message === 'No connected eBay account' || message === 'ebay_not_connected') {
      accessToken = await authService.getAppAccessToken();
    } else {
      throw err;
    }
  }

  // Build search queries from available data
  const queries: Array<{ query: string; source: string }> = [];

  if (title) {
    queries.push({ query: title, source: 'title' });
  }

  if (visionOutput?.detectedCategory?.value) {
    queries.push({
      query: visionOutput.detectedCategory.value,
      source: 'category',
    });
  }

  if (visionOutput?.detectedBrand?.value && visionOutput?.detectedCategory?.value) {
    queries.push({
      query: `${visionOutput.detectedBrand.value} ${visionOutput.detectedCategory.value}`,
      source: 'brandCategory',
    });
  }

  if (queries.length === 0) {
    throw new Error('No data available to suggest a category. Provide a title or vision output.');
  }

  console.log(`[AI Category] Running ${queries.length} query(s): ${queries.map(q => `"${q.query}" (${q.source})`).join(', ')}`);

  // Call taxonomy API for each query in parallel
  const taxonomyService = getEbayTaxonomyService();
  const results = await Promise.all(
    queries.map(async ({ query, source }) => {
      try {
        const result = await taxonomyService.getCategorySuggestions(query, 'EBAY_US', accessToken);
        return { suggestions: result.suggestions, source };
      } catch (err) {
        console.warn(`[AI Category] Query "${query}" failed:`, err);
        return { suggestions: [] as CategorySuggestion[], source };
      }
    })
  );

  // Deduplicate and score categories
  const categoryScores = new Map<string, ScoredCategory>();

  for (const { suggestions, source } of results) {
    const sourceWeight = QUERY_SOURCE_WEIGHTS[source] ?? 1;
    for (const suggestion of suggestions) {
      const existing = categoryScores.get(suggestion.categoryId);
      const relevanceScore = RELEVANCE_SCORES[suggestion.relevance] ?? 1;
      const score = relevanceScore * sourceWeight;

      if (existing) {
        existing.totalScore += score;
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
      } else {
        categoryScores.set(suggestion.categoryId, {
          categoryId: suggestion.categoryId,
          categoryName: suggestion.categoryName,
          totalScore: score,
          sources: [source],
        });
      }
    }
  }

  // Rank by total score
  const ranked = Array.from(categoryScores.values())
    .sort((a, b) => b.totalScore - a.totalScore);

  if (ranked.length === 0) {
    throw new Error('No category suggestions found. Try a different title or keywords.');
  }

  // Normalize scores to 0-1 confidence
  const maxScore = ranked[0].totalScore;
  const toConfidence = (score: number) => Math.min(1, Math.round((score / maxScore) * 100) / 100);

  const buildReason = (cat: ScoredCategory): string => {
    const sourceNames = cat.sources.map(s => {
      if (s === 'title') return 'listing title';
      if (s === 'category') return 'detected category';
      if (s === 'brandCategory') return 'brand + category';
      return s;
    });
    return `Matched from ${sourceNames.join(' and ')}`;
  };

  const primary: AiCategorySuggestion = {
    categoryId: ranked[0].categoryId,
    categoryName: ranked[0].categoryName,
    categoryTreeId: '0', // EBAY_US
    confidence: toConfidence(ranked[0].totalScore),
    reason: buildReason(ranked[0]),
  };

  const alternatives: AiCategorySuggestion[] = ranked.slice(1, 3).map(cat => ({
    categoryId: cat.categoryId,
    categoryName: cat.categoryName,
    categoryTreeId: '0',
    confidence: toConfidence(cat.totalScore),
    reason: buildReason(cat),
  }));

  const result: AiCategorySuggestResult = { primary, alternatives };

  // Cache by listingId if available
  if (input.listingId) {
    cacheSuggestion(input.listingId, result);
  }

  console.log(`[AI Category] Primary: "${primary.categoryName}" (${primary.categoryId}) confidence=${primary.confidence}`);

  return result;
}
