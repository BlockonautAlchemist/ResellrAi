/**
 * ListingGeneratorService
 * 
 * Generates title and description for listings based on VisionOutput.
 * Follows constitution.md constraints for AI output.
 */

import { generateText } from './openrouter.js';
import type { VisionOutput, ListingDraft, ListingAttribute } from '../types/schemas.js';
import { CONFIDENCE_THRESHOLDS, PLATFORM_LIMITS, requiresConfirmation } from '../types/schemas.js';

/**
 * Forbidden words per constitution.md
 * AI must NEVER use these words in generated content
 */
const FORBIDDEN_WORDS = [
  'authentic',
  'genuine',
  'rare',
  'valuable',
  'investment',
  'original',
  'vintage', // only allowed if truly vintage
  'antique',
  'collectible',
  'mint condition',
  'perfect condition',
  'like new', // must be verified by user
  'never worn',
  'never used',
];

/**
 * System prompt for listing generation
 * Enforces constitution.md constraints
 */
const LISTING_SYSTEM_PROMPT = `You are an expert marketplace listing writer. Generate SEO-optimized titles and descriptions for resale items.

CRITICAL RULES (NEVER VIOLATE):
1. NEVER use these words: ${FORBIDDEN_WORDS.join(', ')}
2. NEVER claim authenticity or genuineness
3. NEVER invent features not visible in the item attributes
4. NEVER guarantee condition - use phrases like "appears to be" or "shows signs of"
5. Use neutral, factual language
6. Focus on what IS visible and confirmed

TITLE RULES:
- Maximum 80 characters
- Include: Brand (if known), Key descriptors, Size (if applicable), Color
- Front-load important keywords for search
- No special characters or ALL CAPS

DESCRIPTION RULES:
- Start with key selling points
- List all known attributes
- Be specific but honest
- Include condition notes with qualifying language
- Keep it scannable with short paragraphs

Return valid JSON only, no markdown.`;

/**
 * Build the prompt for listing generation
 */
function buildGenerationPrompt(vision: VisionOutput): string {
  const attributes = vision.detectedAttributes
    .filter(a => a.confidence >= CONFIDENCE_THRESHOLDS.UNKNOWN)
    .map(a => `${a.key}: ${a.value} (confidence: ${Math.round(a.confidence * 100)}%)`)
    .join('\n');

  const brandInfo = vision.detectedBrand?.value
    ? `Brand: ${vision.detectedBrand.value} (confidence: ${Math.round(vision.detectedBrand.confidence * 100)}%)`
    : 'Brand: Unknown';

  const conditionInfo = vision.detectedCondition
    ? `Condition: ${vision.detectedCondition.value} (confidence: ${Math.round(vision.detectedCondition.confidence * 100)}%)`
    : 'Condition: Not determined';

  return `Generate a marketplace listing for this item:

Category: ${vision.detectedCategory.value}
${brandInfo}
Color: ${vision.detectedColor.value}
${conditionInfo}

Detected Attributes:
${attributes || 'No additional attributes detected'}

Return JSON with this structure:
{
  "title": "SEO-optimized title under 80 characters",
  "description": "Detailed description with key selling points and honest condition notes",
  "suggestedAttributes": [
    { "key": "attribute name", "value": "attribute value" }
  ]
}`;
}

/**
 * Parse the listing generation response
 */
function parseListingResponse(
  response: string,
  vision: VisionOutput
): { title: string; description: string; suggestedAttributes: { key: string; value: string }[] } {
  // Clean up response
  let cleanResponse = response.trim();
  if (cleanResponse.startsWith('```')) {
    cleanResponse = cleanResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  }

  try {
    const parsed = JSON.parse(cleanResponse);
    return {
      title: parsed.title || '',
      description: parsed.description || '',
      suggestedAttributes: parsed.suggestedAttributes || [],
    };
  } catch (error) {
    console.error('Failed to parse listing response:', error);
    
    // Generate fallback content
    const brand = vision.detectedBrand?.value || '';
    const category = vision.detectedCategory.value;
    const color = vision.detectedColor.value;
    
    return {
      title: `${brand} ${category} ${color}`.trim().substring(0, 80),
      description: `${category} in ${color}. Please see photos for condition and details.`,
      suggestedAttributes: [],
    };
  }
}

/**
 * Check content for forbidden words
 */
function containsForbiddenWords(text: string): string[] {
  const lowerText = text.toLowerCase();
  return FORBIDDEN_WORDS.filter(word => lowerText.includes(word.toLowerCase()));
}

/**
 * Remove forbidden words from text
 */
function sanitizeContent(text: string): string {
  let sanitized = text;
  FORBIDDEN_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    sanitized = sanitized.replace(regex, '');
  });
  // Clean up extra spaces
  return sanitized.replace(/\s+/g, ' ').trim();
}

/**
 * Generate a complete listing draft from vision output
 */
export async function generateListing(vision: VisionOutput): Promise<ListingDraft> {
  const prompt = buildGenerationPrompt(vision);
  
  const response = await generateText(prompt, LISTING_SYSTEM_PROMPT);
  const parsed = parseListingResponse(response, vision);
  
  // Check for forbidden words and sanitize
  const titleForbidden = containsForbiddenWords(parsed.title);
  const descForbidden = containsForbiddenWords(parsed.description);
  
  if (titleForbidden.length > 0 || descForbidden.length > 0) {
    console.warn('AI generated forbidden words, sanitizing:', {
      title: titleForbidden,
      description: descForbidden,
    });
  }
  
  const sanitizedTitle = sanitizeContent(parsed.title);
  const sanitizedDescription = sanitizeContent(parsed.description);
  
  // Ensure title is within limits
  const finalTitle = sanitizedTitle.substring(0, PLATFORM_LIMITS.ebay.titleMax);
  
  // Build attributes array from vision output
  const attributes: ListingAttribute[] = vision.detectedAttributes
    .filter(a => a.confidence >= CONFIDENCE_THRESHOLDS.UNKNOWN)
    .map(a => ({
      key: a.key,
      value: a.value,
      editable: true,
    }));
  
  // Add any new attributes suggested by the LLM
  parsed.suggestedAttributes.forEach(attr => {
    if (!attributes.find(a => a.key.toLowerCase() === attr.key.toLowerCase())) {
      attributes.push({
        key: attr.key,
        value: attr.value,
        editable: true,
      });
    }
  });

  // Build the listing draft
  const draft: ListingDraft = {
    itemId: vision.itemId,
    title: {
      value: finalTitle,
      charCount: finalTitle.length,
    },
    description: {
      value: sanitizedDescription,
      charCount: sanitizedDescription.length,
    },
    category: {
      value: vision.detectedCategory.value,
      platformCategoryId: null,
    },
    attributes,
    condition: {
      value: vision.detectedCondition?.value || 'good',
      requiresConfirmation: true, // Always require confirmation per constitution
    },
    generatedAt: new Date().toISOString(),
  };

  // Add brand if detected
  if (vision.detectedBrand?.value) {
    draft.brand = {
      value: vision.detectedBrand.value,
      confidence: vision.detectedBrand.confidence,
      requiresConfirmation: requiresConfirmation(vision.detectedBrand.confidence),
    };
  }

  return draft;
}

/**
 * Regenerate a specific field of the listing
 */
export async function regenerateField(
  draft: ListingDraft,
  field: 'title' | 'description',
  vision: VisionOutput
): Promise<string> {
  const attributesList = draft.attributes
    .map(a => `${a.key}: ${a.value}`)
    .join(', ');

  let prompt: string;
  
  if (field === 'title') {
    prompt = `Generate a NEW, different title for this item:
Category: ${draft.category.value}
Brand: ${draft.brand?.value || 'Unknown'}
Current title: ${draft.title.value}
Attributes: ${attributesList}

Requirements:
- Maximum 80 characters
- SEO-optimized for marketplace search
- Different from the current title
- No forbidden words (authentic, genuine, rare, valuable, etc.)

Return JSON: { "title": "new title here" }`;
  } else {
    prompt = `Generate a NEW, different description for this item:
Category: ${draft.category.value}
Brand: ${draft.brand?.value || 'Unknown'}
Condition: ${draft.condition.value}
Attributes: ${attributesList}
Current description: ${draft.description.value}

Requirements:
- Highlight key selling points
- Be specific but honest
- Different from the current description
- No forbidden words (authentic, genuine, rare, valuable, etc.)

Return JSON: { "description": "new description here" }`;
  }

  const response = await generateText(prompt, LISTING_SYSTEM_PROMPT);
  
  // Parse response
  let cleanResponse = response.trim();
  if (cleanResponse.startsWith('```')) {
    cleanResponse = cleanResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  }

  try {
    const parsed = JSON.parse(cleanResponse);
    const newValue = field === 'title' ? parsed.title : parsed.description;
    return sanitizeContent(newValue);
  } catch {
    console.error('Failed to parse regeneration response');
    return field === 'title' ? draft.title.value : draft.description.value;
  }
}
