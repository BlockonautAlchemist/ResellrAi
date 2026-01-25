/**
 * VisionService
 * 
 * Analyzes item photos using AI vision model to detect:
 * - Category, Brand, Color, Condition
 * - Additional attributes (size, material, style)
 * - Confidence scores for each detection
 */

import { analyzeImage } from './openrouter.js';
import type { ItemInput, VisionOutput, DetectedAttribute } from '../types/schemas.js';
import { VisionOutputSchema, CONFIDENCE_THRESHOLDS } from '../types/schemas.js';

/**
 * System prompt for vision analysis
 * Follows constitution.md constraints - never fabricate, always include confidence
 */
const VISION_SYSTEM_PROMPT = `You are an expert product analyst for resale marketplaces. Analyze the item in the image and extract attributes.

CRITICAL RULES:
- Be conservative with confidence scores
- If you cannot clearly see or identify something, set confidence below 0.6
- NEVER fabricate brand names - if unsure, set brand to null
- NEVER guess model numbers or SKUs
- For condition, describe visible wear only
- Return valid JSON only, no markdown or explanation

Confidence scoring:
- 0.9-1.0: Clearly visible, no doubt
- 0.7-0.89: Likely correct but some uncertainty
- 0.5-0.69: Best guess, needs user verification
- Below 0.5: Cannot determine reliably`;

/**
 * User prompt template for vision analysis
 */
const VISION_USER_PROMPT = `Analyze this item image and return JSON with this exact structure:

{
  "category": { "value": "detected category", "confidence": 0.0-1.0 },
  "brand": { "value": "brand name or null if unknown", "confidence": 0.0-1.0 },
  "color": { "value": "primary color(s)", "confidence": 0.0-1.0 },
  "condition": { "value": "new/like_new/good/fair/poor", "confidence": 0.0-1.0 },
  "attributes": [
    { "key": "Size", "value": "detected size", "confidence": 0.0-1.0 },
    { "key": "Material", "value": "detected material", "confidence": 0.0-1.0 },
    { "key": "Style", "value": "style description", "confidence": 0.0-1.0 }
  ],
  "rawLabels": ["list", "of", "detected", "labels"]
}

Include only attributes you can actually detect from the image. Be specific and accurate.`;

/**
 * Parse the raw AI response into a structured VisionOutput
 */
function parseVisionResponse(response: string, itemId: string, processingTimeMs: number): VisionOutput {
  // Clean up response - remove markdown if present
  let cleanResponse = response.trim();
  if (cleanResponse.startsWith('```')) {
    cleanResponse = cleanResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  }

  try {
    const parsed = JSON.parse(cleanResponse);

    // Build the VisionOutput object
    const visionOutput: VisionOutput = {
      itemId,
      detectedCategory: {
        value: parsed.category?.value || 'Unknown',
        confidence: parsed.category?.confidence || 0.5,
      },
      detectedColor: {
        value: parsed.color?.value || 'Unknown',
        confidence: parsed.color?.confidence || 0.5,
      },
      detectedAttributes: [],
      processingTimeMs,
    };

    // Add brand if present
    if (parsed.brand) {
      visionOutput.detectedBrand = {
        value: parsed.brand.value,
        confidence: parsed.brand.confidence || 0.5,
      };
    }

    // Add condition if present
    if (parsed.condition) {
      visionOutput.detectedCondition = {
        value: parsed.condition.value || 'good',
        confidence: parsed.condition.confidence || 0.5,
      };
    }

    // Add detected attributes
    if (Array.isArray(parsed.attributes)) {
      visionOutput.detectedAttributes = parsed.attributes.map((attr: { key: string; value: string; confidence?: number }) => ({
        key: attr.key,
        value: attr.value,
        confidence: attr.confidence || 0.5,
      }));
    }

    // Add raw labels if present
    if (Array.isArray(parsed.rawLabels)) {
      visionOutput.rawLabels = parsed.rawLabels;
    }

    return visionOutput;
  } catch (parseError) {
    console.error('Failed to parse vision response:', parseError);
    console.error('Raw response:', response);

    // Return a minimal valid output
    return {
      itemId,
      detectedCategory: { value: 'Unknown', confidence: 0.3 },
      detectedColor: { value: 'Unknown', confidence: 0.3 },
      detectedAttributes: [],
      processingTimeMs,
    };
  }
}

/**
 * Analyze an item's photos to detect attributes
 * 
 * @param input - The item input with photos and optional hints
 * @returns Vision output with detected attributes and confidence scores
 */
export async function analyzeItem(input: ItemInput): Promise<VisionOutput> {
  const startTime = Date.now();

  // Use the first photo for primary analysis
  // In future versions, we could analyze multiple photos and merge results
  const primaryPhotoUrl = input.photos[0];

  // Build the prompt with user hints if provided
  let userPrompt = VISION_USER_PROMPT;
  if (input.userHints) {
    const hints: string[] = [];
    if (input.userHints.brand) {
      hints.push(`User says brand is: ${input.userHints.brand}`);
    }
    if (input.userHints.category) {
      hints.push(`User says category is: ${input.userHints.category}`);
    }
    if (input.userHints.condition) {
      hints.push(`User says condition is: ${input.userHints.condition}`);
    }
    if (hints.length > 0) {
      userPrompt += `\n\nUser-provided hints (use to guide but verify from image):\n${hints.join('\n')}`;
    }
  }

  try {
    // Call the vision model
    const response = await analyzeImage(
      primaryPhotoUrl,
      userPrompt,
      VISION_SYSTEM_PROMPT
    );

    const processingTimeMs = Date.now() - startTime;

    // Parse the response
    const visionOutput = parseVisionResponse(response, input.id, processingTimeMs);

    // Validate the output
    const validated = VisionOutputSchema.safeParse(visionOutput);
    if (!validated.success) {
      console.warn('Vision output validation warnings:', validated.error.issues);
    }

    return visionOutput;
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    console.error('Vision analysis failed:', error);

    // Return minimal output on error
    return {
      itemId: input.id,
      detectedCategory: { value: 'Unknown', confidence: 0.1 },
      detectedColor: { value: 'Unknown', confidence: 0.1 },
      detectedAttributes: [],
      processingTimeMs,
    };
  }
}

/**
 * Analyze multiple photos and merge results
 * Uses the primary photo for main detection, others for additional attributes
 */
export async function analyzeItemMultiPhoto(input: ItemInput): Promise<VisionOutput> {
  // For v1, we just use the first photo
  // Future enhancement: analyze multiple photos and merge results
  return analyzeItem(input);
}

/**
 * Filter attributes by confidence threshold
 */
export function filterByConfidence(
  attributes: DetectedAttribute[],
  threshold: number = CONFIDENCE_THRESHOLDS.REVIEW_REQUIRED
): DetectedAttribute[] {
  return attributes.filter(attr => attr.confidence >= threshold);
}
