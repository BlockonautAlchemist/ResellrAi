/**
 * Weight and Dimensions Defaults Service
 *
 * Provides default package weights and dimensions based on AI-detected apparel type.
 * Used to pre-populate the shipping details for eBay listings.
 */

import type { WeightUnit, DimensionUnit } from '../../types/ebay-schemas.js';

// =============================================================================
// TYPES
// =============================================================================

export interface WeightSuggestion {
  value: number;
  unit: WeightUnit;
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

export interface DimensionsSuggestion {
  length: number;
  width: number;
  height: number;
  unit: DimensionUnit;
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

export interface PackageSuggestion {
  weight: WeightSuggestion;
  dimensions: DimensionsSuggestion;
}

interface AIAttribute {
  key: string;
  value: string;
  confidence?: number;
}

// =============================================================================
// WEIGHT DEFAULTS TABLE
// =============================================================================

/**
 * Default weights in ounces for common apparel types
 * Based on typical shipping weights including packaging
 */
const APPAREL_WEIGHTS: Record<string, number> = {
  // Tops - Light
  't-shirt': 8,
  'tee': 8,
  'tank top': 6,
  'tank': 6,
  'crop top': 6,
  'camisole': 4,

  // Tops - Medium
  'long sleeve': 10,
  'polo': 10,
  'blouse': 10,
  'button-down': 12,
  'button down': 12,
  'dress shirt': 12,
  'henley': 10,

  // Tops - Heavy
  'hoodie': 24,
  'sweatshirt': 24,
  'sweater': 16,
  'cardigan': 14,
  'pullover': 18,
  'fleece': 20,

  // Outerwear
  'jacket': 32,
  'coat': 48,
  'blazer': 24,
  'vest': 12,
  'windbreaker': 16,
  'parka': 48,
  'puffer': 32,

  // Bottoms
  'jeans': 28,
  'denim': 28,
  'pants': 24,
  'trousers': 24,
  'chinos': 20,
  'shorts': 12,
  'skirt': 12,
  'leggings': 8,
  'sweatpants': 20,
  'joggers': 18,

  // Dresses
  'dress': 16,
  'maxi dress': 20,
  'mini dress': 12,
  'romper': 12,
  'jumpsuit': 20,

  // Footwear
  'shoes': 32,
  'sneakers': 32,
  'boots': 48,
  'sandals': 16,
  'heels': 24,
  'flats': 16,
  'loafers': 24,
  'athletic shoes': 32,

  // Accessories
  'hat': 6,
  'cap': 6,
  'beanie': 4,
  'scarf': 6,
  'belt': 8,
  'tie': 4,
  'socks': 4,
  'gloves': 4,

  // Athletic
  'sports bra': 6,
  'athletic shorts': 10,
  'yoga pants': 10,
  'jersey': 12,
};

// Default fallback weight
const DEFAULT_WEIGHT_OZ = 16; // 1 lb

// =============================================================================
// DIMENSIONS DEFAULTS TABLE
// =============================================================================

/**
 * Default dimensions in inches for common apparel types
 * Based on typical folded/packaged dimensions for shipping
 * Format: [length, width, height]
 */
const APPAREL_DIMENSIONS: Record<string, [number, number, number]> = {
  // Tops - Light (folded flat in poly mailer or small box)
  't-shirt': [10, 8, 1],
  'tee': [10, 8, 1],
  'tank top': [10, 8, 1],
  'tank': [10, 8, 1],
  'crop top': [8, 6, 1],
  'camisole': [8, 6, 1],

  // Tops - Medium
  'long sleeve': [12, 10, 2],
  'polo': [12, 10, 2],
  'blouse': [12, 10, 2],
  'button-down': [12, 10, 2],
  'button down': [12, 10, 2],
  'dress shirt': [12, 10, 2],
  'henley': [12, 10, 2],

  // Tops - Heavy (need box)
  'hoodie': [14, 12, 4],
  'sweatshirt': [14, 12, 4],
  'sweater': [14, 12, 3],
  'cardigan': [14, 12, 3],
  'pullover': [14, 12, 3],
  'fleece': [14, 12, 4],

  // Outerwear (larger boxes)
  'jacket': [16, 14, 5],
  'coat': [18, 14, 6],
  'blazer': [16, 14, 4],
  'vest': [14, 12, 2],
  'windbreaker': [14, 12, 3],
  'parka': [18, 14, 6],
  'puffer': [16, 14, 6],

  // Bottoms
  'jeans': [14, 12, 3],
  'denim': [14, 12, 3],
  'pants': [14, 12, 3],
  'trousers': [14, 12, 3],
  'chinos': [14, 12, 2],
  'shorts': [12, 10, 2],
  'skirt': [12, 10, 2],
  'leggings': [10, 8, 1],
  'sweatpants': [14, 12, 3],
  'joggers': [14, 12, 3],

  // Dresses
  'dress': [14, 12, 3],
  'maxi dress': [16, 12, 3],
  'mini dress': [12, 10, 2],
  'romper': [12, 10, 2],
  'jumpsuit': [16, 12, 4],

  // Footwear (shoe boxes)
  'shoes': [14, 10, 5],
  'sneakers': [14, 10, 5],
  'boots': [16, 12, 7],
  'sandals': [12, 8, 4],
  'heels': [12, 8, 5],
  'flats': [12, 8, 4],
  'loafers': [13, 9, 5],
  'athletic shoes': [14, 10, 5],

  // Accessories
  'hat': [12, 10, 6],
  'cap': [10, 8, 4],
  'beanie': [8, 6, 2],
  'scarf': [10, 8, 2],
  'belt': [12, 6, 2],
  'tie': [10, 4, 1],
  'socks': [8, 6, 1],
  'gloves': [10, 6, 2],

  // Athletic
  'sports bra': [8, 6, 1],
  'athletic shorts': [10, 8, 2],
  'yoga pants': [12, 10, 2],
  'jersey': [14, 12, 2],
};

// Default fallback dimensions (small box)
const DEFAULT_DIMENSIONS: [number, number, number] = [12, 10, 3];

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Get default weight suggestion based on AI-detected attributes
 *
 * Looks for apparel type, product type, or category matches in the
 * AI attributes and returns an appropriate weight suggestion.
 *
 * @param aiAttributes - Array of AI-detected attributes with key/value pairs
 * @param categoryId - Optional eBay category ID (for future category-based defaults)
 * @returns WeightSuggestion with value, unit, confidence, and source
 */
export function getDefaultWeight(
  aiAttributes: AIAttribute[],
  categoryId?: string
): WeightSuggestion {
  // Keys to check for apparel type
  const typeKeys = ['apparelType', 'productType', 'type', 'category', 'garmentType', 'itemType'];

  // Find the apparel type from AI attributes
  let apparelType: string | null = null;
  let matchedAttribute: AIAttribute | null = null;

  for (const attr of aiAttributes) {
    const keyLower = attr.key.toLowerCase();
    if (typeKeys.some(k => keyLower.includes(k.toLowerCase()))) {
      apparelType = attr.value.toLowerCase();
      matchedAttribute = attr;
      break;
    }
  }

  // If no type found, try to find any attribute value that matches our weight table
  if (!apparelType) {
    for (const attr of aiAttributes) {
      const valueLower = attr.value.toLowerCase();
      if (APPAREL_WEIGHTS[valueLower]) {
        apparelType = valueLower;
        matchedAttribute = attr;
        break;
      }
    }
  }

  // Look up weight from apparel type
  if (apparelType) {
    // Try exact match first
    let weight = APPAREL_WEIGHTS[apparelType];

    // If no exact match, try partial match
    if (!weight) {
      for (const [key, oz] of Object.entries(APPAREL_WEIGHTS)) {
        if (apparelType.includes(key) || key.includes(apparelType)) {
          weight = oz;
          break;
        }
      }
    }

    if (weight) {
      const confidence = matchedAttribute?.confidence
        ? matchedAttribute.confidence >= 0.8 ? 'high' : matchedAttribute.confidence >= 0.5 ? 'medium' : 'low'
        : 'medium';

      console.log(`[Weight Defaults] Matched "${apparelType}" to ${weight} oz (confidence: ${confidence})`);

      return {
        value: weight,
        unit: 'OUNCE',
        confidence,
        source: `Based on detected ${matchedAttribute?.key || 'type'}: ${apparelType}`,
      };
    }
  }

  // Fallback to default weight
  console.log(`[Weight Defaults] No match found, using default ${DEFAULT_WEIGHT_OZ} oz`);

  return {
    value: DEFAULT_WEIGHT_OZ,
    unit: 'OUNCE',
    confidence: 'low',
    source: 'Default weight (1 lb)',
  };
}

/**
 * Get default dimensions suggestion based on AI-detected attributes
 *
 * @param aiAttributes - Array of AI-detected attributes with key/value pairs
 * @param categoryId - Optional eBay category ID (for future category-based defaults)
 * @returns DimensionsSuggestion with length, width, height, unit, confidence, and source
 */
export function getDefaultDimensions(
  aiAttributes: AIAttribute[],
  categoryId?: string
): DimensionsSuggestion {
  // Keys to check for apparel type
  const typeKeys = ['apparelType', 'productType', 'type', 'category', 'garmentType', 'itemType'];

  // Find the apparel type from AI attributes
  let apparelType: string | null = null;
  let matchedAttribute: AIAttribute | null = null;

  for (const attr of aiAttributes) {
    const keyLower = attr.key.toLowerCase();
    if (typeKeys.some(k => keyLower.includes(k.toLowerCase()))) {
      apparelType = attr.value.toLowerCase();
      matchedAttribute = attr;
      break;
    }
  }

  // If no type found, try to find any attribute value that matches our dimensions table
  if (!apparelType) {
    for (const attr of aiAttributes) {
      const valueLower = attr.value.toLowerCase();
      if (APPAREL_DIMENSIONS[valueLower]) {
        apparelType = valueLower;
        matchedAttribute = attr;
        break;
      }
    }
  }

  // Look up dimensions from apparel type
  if (apparelType) {
    // Try exact match first
    let dims = APPAREL_DIMENSIONS[apparelType];

    // If no exact match, try partial match
    if (!dims) {
      for (const [key, dimensions] of Object.entries(APPAREL_DIMENSIONS)) {
        if (apparelType.includes(key) || key.includes(apparelType)) {
          dims = dimensions;
          break;
        }
      }
    }

    if (dims) {
      const confidence = matchedAttribute?.confidence
        ? matchedAttribute.confidence >= 0.8 ? 'high' : matchedAttribute.confidence >= 0.5 ? 'medium' : 'low'
        : 'medium';

      console.log(`[Dimensions Defaults] Matched "${apparelType}" to ${dims[0]}x${dims[1]}x${dims[2]} in (confidence: ${confidence})`);

      return {
        length: dims[0],
        width: dims[1],
        height: dims[2],
        unit: 'INCH',
        confidence,
        source: `Based on detected ${matchedAttribute?.key || 'type'}: ${apparelType}`,
      };
    }
  }

  // Fallback to default dimensions
  console.log(`[Dimensions Defaults] No match found, using default ${DEFAULT_DIMENSIONS.join('x')} in`);

  return {
    length: DEFAULT_DIMENSIONS[0],
    width: DEFAULT_DIMENSIONS[1],
    height: DEFAULT_DIMENSIONS[2],
    unit: 'INCH',
    confidence: 'low',
    source: 'Default dimensions (12x10x3 in)',
  };
}

/**
 * Get both weight and dimensions suggestions
 *
 * @param aiAttributes - Array of AI-detected attributes with key/value pairs
 * @param categoryId - Optional eBay category ID
 * @returns PackageSuggestion with both weight and dimensions
 */
export function getDefaultPackageDetails(
  aiAttributes: AIAttribute[],
  categoryId?: string
): PackageSuggestion {
  return {
    weight: getDefaultWeight(aiAttributes, categoryId),
    dimensions: getDefaultDimensions(aiAttributes, categoryId),
  };
}

/**
 * Convert weight between ounces and pounds
 */
export function convertWeight(value: number, fromUnit: WeightUnit, toUnit: WeightUnit): number {
  if (fromUnit === toUnit) return value;
  if (fromUnit === 'OUNCE' && toUnit === 'POUND') return value / 16;
  if (fromUnit === 'POUND' && toUnit === 'OUNCE') return value * 16;
  return value;
}

/**
 * Format weight for display (e.g., "1 lb 8 oz" for 24 oz)
 */
export function formatWeightDisplay(value: number, unit: WeightUnit): string {
  if (unit === 'POUND') {
    return value === 1 ? '1 lb' : `${value} lb`;
  }

  // For ounces, show as lb + oz if >= 16 oz
  if (value >= 16) {
    const pounds = Math.floor(value / 16);
    const ounces = value % 16;
    if (ounces === 0) {
      return pounds === 1 ? '1 lb' : `${pounds} lb`;
    }
    return `${pounds} lb ${ounces} oz`;
  }

  return `${value} oz`;
}

/**
 * Format dimensions for display (e.g., "12 x 10 x 3 in")
 */
export function formatDimensionsDisplay(length: number, width: number, height: number, unit: DimensionUnit): string {
  const unitLabel = unit === 'INCH' ? 'in' : 'cm';
  return `${length} x ${width} x ${height} ${unitLabel}`;
}
