/**
 * PlatformFormatterService
 * 
 * Formats listings for specific marketplaces (eBay).
 * Handles platform-specific requirements for titles, descriptions, and attributes.
 */

import type { ListingDraft, PlatformVariant, Platform, PlatformAttribute } from '../types/schemas.js';
import { PLATFORM_LIMITS } from '../types/schemas.js';

/**
 * Platform-specific configuration
 */
const PLATFORM_CONFIG = {
  ebay: {
    titleMaxLength: 80,
    descriptionFormat: 'html' as const,
    descriptionMaxLength: 4000,
    requiredAttributeKeys: ['Brand', 'Color'],
    optionalAttributeKeys: ['Size', 'Style', 'Material', 'Type'],
  },
};

/**
 * Convert plain text to basic HTML for eBay
 */
function convertToHtml(text: string): string {
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/);
  
  // Wrap each paragraph in <p> tags
  const htmlParagraphs = paragraphs.map(p => {
    // Convert single newlines to <br>
    const withBreaks = p.replace(/\n/g, '<br>');
    return `<p>${withBreaks}</p>`;
  });
  
  return htmlParagraphs.join('\n');
}

/**
 * Truncate text to max length, preserving word boundaries
 */
function truncateToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  // Find the last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace);
  }
  
  return truncated;
}

/**
 * Extract required attributes for a platform
 */
function extractRequiredAttributes(
  draft: ListingDraft,
  platform: Platform
): PlatformAttribute[] {
  const config = PLATFORM_CONFIG[platform];
  const required: PlatformAttribute[] = [];
  
  // Add brand if we have it
  if (draft.brand?.value && config.requiredAttributeKeys.includes('Brand')) {
    required.push({ key: 'Brand', value: draft.brand.value });
  }
  
  // Extract from attributes array
  for (const attr of draft.attributes) {
    const matchingKey = config.requiredAttributeKeys.find(
      k => k.toLowerCase() === attr.key.toLowerCase()
    );
    if (matchingKey && !required.find(r => r.key === matchingKey)) {
      required.push({ key: matchingKey, value: attr.value });
    }
  }
  
  return required;
}

/**
 * Extract optional attributes for a platform
 */
function extractOptionalAttributes(
  draft: ListingDraft,
  platform: Platform
): PlatformAttribute[] {
  const config = PLATFORM_CONFIG[platform];
  const optional: PlatformAttribute[] = [];
  
  for (const attr of draft.attributes) {
    const matchingKey = config.optionalAttributeKeys.find(
      k => k.toLowerCase() === attr.key.toLowerCase()
    );
    if (matchingKey) {
      optional.push({ key: matchingKey, value: attr.value });
    }
  }
  
  return optional;
}

/**
 * Map category to platform-specific category ID
 * This is a simplified version - in production, you'd have a comprehensive mapping
 */
function mapCategoryId(category: string, platform: Platform): string {
  // Simplified category mapping
  // In production, this would be a comprehensive lookup table
  const categoryMappings: Record<string, Record<Platform, string>> = {
    "Men's Athletic Shoes": { ebay: '15709' },
    "Women's Athletic Shoes": { ebay: '95672' },
    "Men's Clothing": { ebay: '1059' },
    "Women's Clothing": { ebay: '15724' },
    "Handbags": { ebay: '169291' },
    "Jewelry": { ebay: '10968' },
  };
  
  // Try exact match
  if (categoryMappings[category]) {
    return categoryMappings[category][platform];
  }
  
  // Try partial match
  const lowerCategory = category.toLowerCase();
  for (const [key, value] of Object.entries(categoryMappings)) {
    if (lowerCategory.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerCategory)) {
      return value[platform];
    }
  }
  
  // Default categories
  return '1';
}

/**
 * Format a listing for eBay
 */
function formatForEbay(draft: ListingDraft): PlatformVariant {
  const config = PLATFORM_CONFIG.ebay;
  
  // Format title
  const title = truncateToLength(draft.title.value, config.titleMaxLength);
  
  // Format description as HTML
  let description = draft.description.value;
  
  // Add condition note
  description += `\n\nCondition: ${draft.condition.value}`;
  
  // Convert to HTML
  const htmlDescription = convertToHtml(description);
  
  // Truncate if needed
  const finalDescription = truncateToLength(htmlDescription, config.descriptionMaxLength);
  
  return {
    platform: 'ebay',
    title: {
      value: title,
      maxLength: config.titleMaxLength,
      valid: title.length <= config.titleMaxLength,
    },
    description: {
      value: finalDescription,
      format: 'html',
    },
    categoryId: mapCategoryId(draft.category.value, 'ebay'),
    requiredAttributes: extractRequiredAttributes(draft, 'ebay'),
    optionalAttributes: extractOptionalAttributes(draft, 'ebay'),
  };
}

/**
 * Format a listing for a specific platform
 * 
 * @param draft - The listing draft to format
 * @param platform - Target platform ('ebay')
 * @returns Platform-specific formatted listing
 */
export function formatForPlatform(
  draft: ListingDraft,
  platform: Platform
): PlatformVariant {
  switch (platform) {
    case 'ebay':
      return formatForEbay(draft);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Validate a listing against platform requirements
 */
export function validateForPlatform(
  variant: PlatformVariant
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const config = PLATFORM_CONFIG[variant.platform];
  
  // Check title length
  if (variant.title.value.length > config.titleMaxLength) {
    errors.push(`Title exceeds ${config.titleMaxLength} characters`);
  }
  
  // Check description length
  if (variant.description.value.length > config.descriptionMaxLength) {
    errors.push(`Description exceeds ${config.descriptionMaxLength} characters`);
  }
  
  // Check required attributes
  for (const requiredKey of config.requiredAttributeKeys) {
    const hasAttribute = variant.requiredAttributes.some(
      a => a.key.toLowerCase() === requiredKey.toLowerCase()
    );
    if (!hasAttribute) {
      errors.push(`Missing required attribute: ${requiredKey}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get platform limits
 */
export function getPlatformLimits(platform: Platform) {
  return PLATFORM_LIMITS[platform];
}
