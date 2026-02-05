/**
 * eBay Aspects Suggester
 *
 * Maps AI vision attributes to eBay item specifics using fuzzy matching.
 * Handles the translation from AI-detected attributes (e.g., "gender: male")
 * to eBay-compatible aspects (e.g., "Department: Men").
 *
 * Key functionality:
 * - Normalize AI attribute values (handle "Men's", "Mens", "Men", etc.)
 * - Map AI keys to eBay aspect names
 * - Fuzzy match values against allowed values
 * - Track missing required aspects
 */

import type { AspectDefinition, ItemAspectsMetadata } from './aspects.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SuggestionInput {
  categoryId: string;
  aiAttributes: Array<{ key: string; value: string; confidence: number }>;
  detectedBrand?: { value: string | null; confidence: number };
  aspectsMetadata: ItemAspectsMetadata;
}

export interface SuggestionResult {
  suggestedItemSpecifics: Record<string, string>;
  missingRequiredAspects: string[];
  invalidAspects: Array<{
    aspectName: string;
    providedValue: string;
    allowedValues: string[];
    suggestion?: string;  // Fuzzy-matched suggestion
  }>;
  matchDetails: Array<{
    aspectName: string;
    method: 'exact' | 'synonym' | 'fuzzy' | 'direct';
    originalValue: string;
    matchedValue: string;
  }>;
}

// =============================================================================
// AI KEY TO EBAY ASPECT MAPPING
// =============================================================================

/**
 * Maps AI-detected attribute keys to eBay aspect names
 */
const AI_TO_EBAY_MAP: Record<string, string> = {
  // Gender/Department mapping
  'gender': 'Department',
  'department': 'Department',
  'target_audience': 'Department',

  // Size mapping
  'size': 'Size',
  'clothing_size': 'Size',
  'shoe_size': 'Size',

  // Color mapping
  'color': 'Color',
  'main_color': 'Color',
  'primary_color': 'Color',

  // Material mapping
  'material': 'Material',
  'fabric': 'Material',
  'main_material': 'Material',

  // Style mapping
  'style': 'Style',
  'type': 'Type',
  'item_type': 'Type',

  // Pattern mapping
  'pattern': 'Pattern',

  // Sleeve length
  'sleeve_length': 'Sleeve Length',
  'sleeve': 'Sleeve Length',

  // Neckline
  'neckline': 'Neckline',
  'neck_style': 'Neckline',

  // Fit
  'fit': 'Fit',

  // Length
  'length': 'Length',
  'garment_length': 'Length',

  // Brand (special handling)
  'brand': 'Brand',
};

// =============================================================================
// SYNONYM MAPPINGS FOR COMMON VALUES
// =============================================================================

/**
 * Synonyms for Department values
 */
const DEPARTMENT_SYNONYMS: Record<string, string[]> = {
  'Men': ['men', 'mens', 'male', 'guys', 'man', "men's", 'gentleman', 'gentlemen'],
  'Women': ['women', 'womens', 'female', 'ladies', 'woman', "women's", 'lady'],
  'Boys': ['boys', 'boy', 'youth boys', 'kids boys'],
  'Girls': ['girls', 'girl', 'youth girls', 'kids girls'],
  'Unisex': ['unisex', 'neutral', 'all', 'any', 'universal'],
  'Baby': ['baby', 'infant', 'newborn', 'toddler'],
};

/**
 * Synonyms for common Color values
 */
const COLOR_SYNONYMS: Record<string, string[]> = {
  'Black': ['black', 'noir', 'blk', 'ebony'],
  'White': ['white', 'blanc', 'wht', 'ivory', 'cream'],
  'Blue': ['blue', 'bleu', 'navy', 'royal blue', 'sky blue'],
  'Red': ['red', 'rouge', 'crimson', 'scarlet', 'maroon'],
  'Green': ['green', 'vert', 'olive', 'forest', 'emerald'],
  'Gray': ['gray', 'grey', 'charcoal', 'silver'],
  'Brown': ['brown', 'tan', 'beige', 'khaki', 'camel'],
  'Pink': ['pink', 'rose', 'fuchsia', 'magenta'],
  'Purple': ['purple', 'violet', 'lavender', 'plum'],
  'Orange': ['orange', 'coral', 'peach'],
  'Yellow': ['yellow', 'gold', 'mustard'],
  'Multicolor': ['multicolor', 'multi', 'multicolored', 'various', 'mixed'],
};

/**
 * Synonyms for Size values
 */
const SIZE_SYNONYMS: Record<string, string[]> = {
  'XS': ['xs', 'extra small', 'x-small', 'xsmall'],
  'S': ['s', 'small', 'sm'],
  'M': ['m', 'medium', 'med'],
  'L': ['l', 'large', 'lg'],
  'XL': ['xl', 'extra large', 'x-large', 'xlarge'],
  'XXL': ['xxl', '2xl', 'xx-large', 'xxlarge', '2x'],
  'XXXL': ['xxxl', '3xl', 'xxx-large', '3x'],
};

// =============================================================================
// VALUE NORMALIZATION
// =============================================================================

/**
 * Normalize a string value for comparison
 * - Lowercase
 * - Trim whitespace
 * - Remove apostrophe-s ("'s", "'s")
 * - Remove common suffixes
 */
function normalizeValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['']s$/i, '')  // Remove 's and 's
    .replace(/['']/g, '')     // Remove remaining apostrophes
    .replace(/-/g, ' ')       // Replace hyphens with spaces
    .replace(/\s+/g, ' ');    // Normalize whitespace
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[a.length][b.length];
}

// =============================================================================
// VALUE MATCHING
// =============================================================================

interface MatchResult {
  matched: boolean;
  value: string;
  method: 'exact' | 'synonym' | 'fuzzy' | 'direct';
}

/**
 * Try to match a value against allowed values using various strategies
 */
function matchValue(
  inputValue: string,
  allowedValues: string[],
  aspectName: string
): MatchResult {
  const normalizedInput = normalizeValue(inputValue);

  // Strategy 1: Exact match (case-insensitive)
  for (const allowed of allowedValues) {
    if (normalizeValue(allowed) === normalizedInput) {
      return { matched: true, value: allowed, method: 'exact' };
    }
  }

  // Strategy 2: Synonym match (for known aspects)
  const synonymMap = getSynonymMapForAspect(aspectName);
  if (synonymMap) {
    for (const [canonical, synonyms] of Object.entries(synonymMap)) {
      if (synonyms.includes(normalizedInput)) {
        // Check if canonical value is in allowed values
        const matchedAllowed = allowedValues.find(
          av => normalizeValue(av) === normalizeValue(canonical)
        );
        if (matchedAllowed) {
          return { matched: true, value: matchedAllowed, method: 'synonym' };
        }
      }
    }
  }

  // Strategy 3: Fuzzy match (Levenshtein distance < 2)
  for (const allowed of allowedValues) {
    const distance = levenshteinDistance(normalizedInput, normalizeValue(allowed));
    if (distance <= 2 && normalizedInput.length > 2) {
      return { matched: true, value: allowed, method: 'fuzzy' };
    }
  }

  // No match found
  return { matched: false, value: inputValue, method: 'direct' };
}

/**
 * Get the appropriate synonym map for an aspect
 */
function getSynonymMapForAspect(aspectName: string): Record<string, string[]> | null {
  const normalized = aspectName.toLowerCase();

  if (normalized === 'department') {
    return DEPARTMENT_SYNONYMS;
  }
  if (normalized === 'color') {
    return COLOR_SYNONYMS;
  }
  if (normalized === 'size') {
    return SIZE_SYNONYMS;
  }

  return null;
}

/**
 * Find the best fuzzy suggestion for an invalid value
 */
function findFuzzySuggestion(inputValue: string, allowedValues: string[]): string | undefined {
  const normalizedInput = normalizeValue(inputValue);
  let bestMatch: { value: string; distance: number } | null = null;

  for (const allowed of allowedValues) {
    const distance = levenshteinDistance(normalizedInput, normalizeValue(allowed));
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { value: allowed, distance };
    }
  }

  // Only suggest if distance is reasonable (< 5)
  if (bestMatch && bestMatch.distance < 5) {
    return bestMatch.value;
  }

  return undefined;
}

// =============================================================================
// MAIN SUGGESTER FUNCTION
// =============================================================================

/**
 * Suggest item specifics based on AI attributes and category metadata
 */
export function suggestItemSpecifics(input: SuggestionInput): SuggestionResult {
  const { aiAttributes, detectedBrand, aspectsMetadata } = input;

  const suggestedItemSpecifics: Record<string, string> = {};
  const missingRequiredAspects: string[] = [];
  const invalidAspects: SuggestionResult['invalidAspects'] = [];
  const matchDetails: SuggestionResult['matchDetails'] = [];

  // Build a map of all aspects (required + recommended) by name
  const allAspects = new Map<string, AspectDefinition>();
  for (const aspect of aspectsMetadata.requiredAspects) {
    allAspects.set(aspect.name.toLowerCase(), aspect);
  }
  for (const aspect of aspectsMetadata.recommendedAspects) {
    allAspects.set(aspect.name.toLowerCase(), aspect);
  }

  // Process detected brand first
  if (detectedBrand?.value && detectedBrand.confidence > 0.5) {
    const brandAspect = allAspects.get('brand');
    if (brandAspect) {
      if (brandAspect.mode === 'SELECTION_ONLY' && brandAspect.allowedValues) {
        const matchResult = matchValue(detectedBrand.value, brandAspect.allowedValues, 'Brand');
        if (matchResult.matched) {
          suggestedItemSpecifics['Brand'] = matchResult.value;
          matchDetails.push({
            aspectName: 'Brand',
            method: matchResult.method,
            originalValue: detectedBrand.value,
            matchedValue: matchResult.value,
          });
        }
      } else {
        // FREE_TEXT mode - use value directly
        suggestedItemSpecifics['Brand'] = detectedBrand.value;
        matchDetails.push({
          aspectName: 'Brand',
          method: 'direct',
          originalValue: detectedBrand.value,
          matchedValue: detectedBrand.value,
        });
      }
    }
  }

  // Process AI attributes
  for (const attr of aiAttributes) {
    const ebayAspectName = AI_TO_EBAY_MAP[attr.key.toLowerCase()];
    if (!ebayAspectName) {
      continue; // No mapping for this AI attribute
    }

    const aspect = allAspects.get(ebayAspectName.toLowerCase());
    if (!aspect) {
      continue; // Category doesn't have this aspect
    }

    // Skip if we already have a value for this aspect (from brand)
    if (suggestedItemSpecifics[aspect.name]) {
      continue;
    }

    if (aspect.mode === 'SELECTION_ONLY' && aspect.allowedValues) {
      // Must match against allowed values
      const matchResult = matchValue(attr.value, aspect.allowedValues, aspect.name);

      if (matchResult.matched) {
        suggestedItemSpecifics[aspect.name] = matchResult.value;
        matchDetails.push({
          aspectName: aspect.name,
          method: matchResult.method,
          originalValue: attr.value,
          matchedValue: matchResult.value,
        });
      } else {
        // Value doesn't match - track as invalid
        const suggestion = findFuzzySuggestion(attr.value, aspect.allowedValues);
        invalidAspects.push({
          aspectName: aspect.name,
          providedValue: attr.value,
          allowedValues: aspect.allowedValues.slice(0, 20), // Limit for readability
          suggestion,
        });
      }
    } else {
      // FREE_TEXT mode - use value directly
      suggestedItemSpecifics[aspect.name] = attr.value;
      matchDetails.push({
        aspectName: aspect.name,
        method: 'direct',
        originalValue: attr.value,
        matchedValue: attr.value,
      });
    }
  }

  // Check for missing required aspects
  for (const required of aspectsMetadata.requiredAspects) {
    if (!suggestedItemSpecifics[required.name]) {
      // Check if it's in invalid aspects (we tried but failed to match)
      const wasInvalid = invalidAspects.find(ia => ia.aspectName === required.name);
      if (!wasInvalid) {
        missingRequiredAspects.push(required.name);
      }
    }
  }

  // Log summary
  console.log(`[Aspects Suggester] Category ${input.categoryId}:`);
  console.log(`  - Suggested: ${Object.keys(suggestedItemSpecifics).join(', ') || 'none'}`);
  console.log(`  - Missing required: ${missingRequiredAspects.join(', ') || 'none'}`);
  console.log(`  - Invalid values: ${invalidAspects.map(ia => ia.aspectName).join(', ') || 'none'}`);

  return {
    suggestedItemSpecifics,
    missingRequiredAspects,
    invalidAspects,
    matchDetails,
  };
}

/**
 * Validate that all required aspects are present and valid
 */
export function validateItemSpecifics(
  itemSpecifics: Record<string, string>,
  aspectsMetadata: ItemAspectsMetadata
): {
  valid: boolean;
  missing: string[];
  invalid: Array<{ aspect: string; value: string; allowed: string[] }>;
} {
  const missing: string[] = [];
  const invalid: Array<{ aspect: string; value: string; allowed: string[] }> = [];

  for (const required of aspectsMetadata.requiredAspects) {
    const value = itemSpecifics[required.name];

    if (!value || value.trim() === '') {
      missing.push(required.name);
      continue;
    }

    // Check if value is valid for SELECTION_ONLY aspects
    if (required.mode === 'SELECTION_ONLY' && required.allowedValues) {
      const matchResult = matchValue(value, required.allowedValues, required.name);
      if (!matchResult.matched) {
        invalid.push({
          aspect: required.name,
          value,
          allowed: required.allowedValues.slice(0, 20),
        });
      }
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}
