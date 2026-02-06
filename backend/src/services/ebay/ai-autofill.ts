/**
 * AI-Powered Item Specifics Autofill
 *
 * Uses LLM to fill ALL required item specifics for a given eBay category,
 * not just the ones that fuzzy-match from vision attributes.
 *
 * The LLM receives:
 * - Category name and ID
 * - Required aspect names with allowed values (if SELECTION_ONLY)
 * - Listing title + description
 * - Vision-detected attributes, brand, color, category
 *
 * It returns structured JSON with best-guess values for each required aspect.
 */

import { generateText } from '../openrouter.js';
import type { AspectDefinition, ItemAspectsMetadata } from './aspects.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AutofillInput {
  categoryId: string;
  categoryName: string;
  requiredAspects: AspectDefinition[];
  listing: {
    title: string;
    description: string;
  };
  visionOutput?: {
    detectedAttributes?: Array<{ key: string; value: string; confidence: number }>;
    detectedBrand?: { value: string | null; confidence: number };
    detectedCategory?: { value: string; confidence: number };
    detectedColor?: { value: string; confidence: number };
  };
  currentItemSpecifics: Record<string, string>;
}

export interface AutofillResult {
  itemSpecifics: Record<string, string>;
  filledByAi: string[];
  stillMissing: string[];
}

// =============================================================================
// VALUE COERCION
// =============================================================================

/**
 * For SELECTION_ONLY aspects, find the closest allowed value.
 * Uses case-insensitive exact match, then substring match.
 */
function coerceToAllowedValue(value: string, allowedValues: string[]): string | null {
  if (!allowedValues || allowedValues.length === 0) return value;

  const normalized = value.toLowerCase().trim();

  // Exact match (case-insensitive)
  for (const av of allowedValues) {
    if (av.toLowerCase().trim() === normalized) return av;
  }

  // Substring match (value contains allowed or allowed contains value)
  for (const av of allowedValues) {
    const avLower = av.toLowerCase().trim();
    if (avLower.includes(normalized) || normalized.includes(avLower)) return av;
  }

  // No match found
  return null;
}

// =============================================================================
// LLM PROMPT BUILDING
// =============================================================================

function buildAutofillPrompt(input: AutofillInput, unfilledAspects: AspectDefinition[]): string {
  const aspectDescriptions = unfilledAspects.map(aspect => {
    if (aspect.mode === 'SELECTION_ONLY' && aspect.allowedValues && aspect.allowedValues.length > 0) {
      // Limit displayed values to keep prompt reasonable
      const displayValues = aspect.allowedValues.slice(0, 30);
      const suffix = aspect.allowedValues.length > 30
        ? ` (${aspect.allowedValues.length - 30} more options)`
        : '';
      return `- "${aspect.name}" (MUST be one of: ${displayValues.join(', ')}${suffix})`;
    }
    return `- "${aspect.name}" (free text)`;
  });

  const visionInfo: string[] = [];
  if (input.visionOutput?.detectedBrand?.value) {
    visionInfo.push(`Brand: ${input.visionOutput.detectedBrand.value}`);
  }
  if (input.visionOutput?.detectedCategory?.value) {
    visionInfo.push(`Detected item type: ${input.visionOutput.detectedCategory.value}`);
  }
  if (input.visionOutput?.detectedColor?.value) {
    visionInfo.push(`Color: ${input.visionOutput.detectedColor.value}`);
  }
  if (input.visionOutput?.detectedAttributes) {
    for (const attr of input.visionOutput.detectedAttributes) {
      visionInfo.push(`${attr.key}: ${attr.value}`);
    }
  }

  return `You are filling in required eBay item specifics for a listing.

Category: ${input.categoryName} (ID: ${input.categoryId})
Title: ${input.listing.title}
Description: ${input.listing.description}
${visionInfo.length > 0 ? `\nVision-detected attributes:\n${visionInfo.join('\n')}` : ''}

Fill in EACH of the following required item specifics. For fields marked "MUST be one of", you MUST pick the closest matching value from the provided list. For "free text" fields, provide your best guess.

Required fields to fill:
${aspectDescriptions.join('\n')}

Respond with ONLY a JSON object mapping aspect names to values. Example:
{"Department": "Men", "Size": "L", "Color": "Black"}

If you truly cannot determine a value, use "N/A" for free text fields. For selection fields, pick the most likely value based on the listing context.

JSON:`;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Use LLM to auto-fill required item specifics that haven't been filled yet.
 */
export async function autoFillRequiredItemSpecifics(input: AutofillInput): Promise<AutofillResult> {
  const { requiredAspects, currentItemSpecifics } = input;

  // Filter to only unfilled required aspects
  const unfilledAspects = requiredAspects.filter(
    aspect => !currentItemSpecifics[aspect.name] || currentItemSpecifics[aspect.name].trim() === ''
  );

  if (unfilledAspects.length === 0) {
    console.log('[AI Autofill] All required aspects already filled');
    return {
      itemSpecifics: { ...currentItemSpecifics },
      filledByAi: [],
      stillMissing: [],
    };
  }

  console.log(`[AI Autofill] Filling ${unfilledAspects.length} unfilled required aspects: ${unfilledAspects.map(a => a.name).join(', ')}`);

  const prompt = buildAutofillPrompt(input, unfilledAspects);

  let llmResponse: string;
  try {
    llmResponse = await generateText(prompt, 'You are a precise eBay listing assistant. Return only valid JSON.');
  } catch (err) {
    console.error('[AI Autofill] LLM call failed:', err);
    // Return current specifics with all unfilled as still missing
    return {
      itemSpecifics: { ...currentItemSpecifics },
      filledByAi: [],
      stillMissing: unfilledAspects.map(a => a.name),
    };
  }

  // Parse LLM response
  let parsed: Record<string, string> = {};
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('[AI Autofill] Failed to parse LLM response:', llmResponse);
    return {
      itemSpecifics: { ...currentItemSpecifics },
      filledByAi: [],
      stillMissing: unfilledAspects.map(a => a.name),
    };
  }

  // Process and validate each LLM value
  const merged = { ...currentItemSpecifics };
  const filledByAi: string[] = [];
  const stillMissing: string[] = [];

  for (const aspect of unfilledAspects) {
    // Normalize key matching (LLM might use different casing)
    let llmValue = parsed[aspect.name];
    if (!llmValue) {
      // Try case-insensitive key lookup
      const key = Object.keys(parsed).find(k => k.toLowerCase() === aspect.name.toLowerCase());
      if (key) llmValue = parsed[key];
    }

    if (!llmValue || llmValue.trim() === '' || llmValue === 'N/A') {
      stillMissing.push(aspect.name);
      continue;
    }

    if (aspect.mode === 'SELECTION_ONLY' && aspect.allowedValues) {
      const coerced = coerceToAllowedValue(llmValue, aspect.allowedValues);
      if (coerced) {
        merged[aspect.name] = coerced;
        filledByAi.push(aspect.name);
      } else {
        console.warn(`[AI Autofill] LLM value "${llmValue}" for "${aspect.name}" doesn't match any allowed value`);
        stillMissing.push(aspect.name);
      }
    } else {
      // FREE_TEXT - use directly
      merged[aspect.name] = llmValue;
      filledByAi.push(aspect.name);
    }
  }

  console.log(`[AI Autofill] Filled ${filledByAi.length} aspects by AI: ${filledByAi.join(', ')}`);
  if (stillMissing.length > 0) {
    console.log(`[AI Autofill] Still missing: ${stillMissing.join(', ')}`);
  }

  return {
    itemSpecifics: merged,
    filledByAi,
    stillMissing,
  };
}
