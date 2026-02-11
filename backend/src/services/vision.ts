/**
 * VisionService
 * 
 * Analyzes item photos using AI vision model to detect:
 * - Category, Brand, Color, Condition
 * - Additional attributes (size, material, style)
 * - Confidence scores for each detection
 */

import { analyzeImage } from './openrouter.js';
import type { ItemInput, VisionOutput, DetectedAttribute, ShippingEstimate } from '../types/schemas.js';
import { VisionOutputSchema, ShippingEstimateSchema, CONFIDENCE_THRESHOLDS } from '../types/schemas.js';

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
- For condition, describe visible wear only. Most items are pre-owned, so default to "good" unless the item is clearly brand new with tags/packaging
- Return valid JSON only, no markdown or explanation

Confidence scoring:
- 0.9-1.0: Clearly visible, no doubt
- 0.7-0.89: Likely correct but some uncertainty
- 0.5-0.69: Best guess, needs user verification
- Below 0.5: Cannot determine reliably

SHIPPING ESTIMATION RULES:
- Estimate item weight and dimensions based on what you see
- Choose packagingType: poly_mailer for soft goods (clothing, fabric), small_box for items < 12x10x6, medium_box for items < 18x14x8, large_box for larger items, tube for posters/prints, rigid_mailer for flat rigid items
- packageWeightOz must include packaging material weight (add 2-6 oz depending on packaging type)
- Sort dimensions so L >= W >= H
- Prefer slight overestimates to avoid shipping label underruns
- Set confidence below 0.5 when item size is ambiguous or hard to judge from the image`;

/**
 * User prompt template for vision analysis
 */
const VISION_USER_PROMPT = `Analyze this item image and return JSON with this exact structure:

{
  "category": { "value": "detected category", "confidence": 0.0-1.0 },
  "brand": { "value": "brand name or null if unknown", "confidence": 0.0-1.0 },
  "color": { "value": "primary color(s)", "confidence": 0.0-1.0 },
  "condition": { "value": "good/like_new/fair/poor/new", "confidence": 0.0-1.0 },
  "attributes": [
    { "key": "Size", "value": "detected size", "confidence": 0.0-1.0 },
    { "key": "Material", "value": "detected material", "confidence": 0.0-1.0 },
    { "key": "Style", "value": "style description", "confidence": 0.0-1.0 }
  ],
  "rawLabels": ["list", "of", "detected", "labels"],
  "shippingEstimate": {
    "packagingType": "poly_mailer|small_box|medium_box|large_box|tube|rigid_mailer",
    "itemDimensionsIn": { "l": 0, "w": 0, "h": 0 },
    "itemWeightOz": 0,
    "packageDimensionsIn": { "l": 0, "w": 0, "h": 0 },
    "packageWeightOz": 0,
    "confidence": 0.0,
    "assumptions": ["list of assumptions made"]
  }
}

Include only attributes you can actually detect from the image. Be specific and accurate.
Always include a shippingEstimate with your best guess for weight and dimensions.`;

/**
 * Normalize and validate a shipping estimate from the vision model.
 * Rounds values, clamps to valid ranges, sorts dims descending, and validates with Zod.
 * Returns null on failure (graceful degradation).
 */
function normalizeShippingEstimate(raw: Record<string, unknown>): ShippingEstimate | null {
  try {
    const roundWeight = (v: number) => Math.round(v);
    const roundDim = (v: number) => Math.round(v * 2) / 2; // nearest 0.5
    const clampWeight = (v: number) => Math.max(1, Math.min(2400, v));
    const clampDim = (v: number) => Math.max(1, Math.min(48, v));

    const sortDims = (dims: { l: number; w: number; h: number }) => {
      const sorted = [dims.l, dims.w, dims.h].sort((a, b) => b - a);
      return { l: sorted[0], w: sorted[1], h: sorted[2] };
    };

    const normDims = (dims: Record<string, unknown>) => {
      const raw = {
        l: clampDim(roundDim(Number(dims?.l) || 1)),
        w: clampDim(roundDim(Number(dims?.w) || 1)),
        h: clampDim(roundDim(Number(dims?.h) || 1)),
      };
      return sortDims(raw);
    };

    const normalized = {
      packagingType: raw.packagingType,
      itemDimensionsIn: normDims((raw.itemDimensionsIn as Record<string, unknown>) || {}),
      itemWeightOz: clampWeight(roundWeight(Number(raw.itemWeightOz) || 1)),
      packageDimensionsIn: normDims((raw.packageDimensionsIn as Record<string, unknown>) || {}),
      packageWeightOz: clampWeight(roundWeight(Number(raw.packageWeightOz) || 1)),
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
      assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map(String) : [],
    };

    const result = ShippingEstimateSchema.safeParse(normalized);
    if (result.success) {
      return result.data;
    }

    console.warn('ShippingEstimate validation failed:', result.error.issues);
    return null;
  } catch (err) {
    console.warn('normalizeShippingEstimate error:', err);
    return null;
  }
}

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

    // Add shipping estimate if present
    if (parsed.shippingEstimate) {
      const normalized = normalizeShippingEstimate(parsed.shippingEstimate);
      if (normalized) {
        visionOutput.shippingEstimate = normalized;
      }
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
