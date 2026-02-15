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

const PHOTO_ANALYSIS_CONCURRENCY = 3;
const MAX_DISAGREEMENT_PENALTY = 0.15;

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

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sortDimsDescending(dims: { l: number; w: number; h: number }) {
  const sorted = [dims.l, dims.w, dims.h].sort((a, b) => b - a);
  return { l: sorted[0], w: sorted[1], h: sorted[2] };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    const key = normalizeText(trimmed);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(trimmed);
    }
  }

  return output;
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

function buildVisionUserPrompt(input: ItemInput): string {
  let userPrompt = VISION_USER_PROMPT;
  if (!input.userHints) {
    return userPrompt;
  }

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

  return userPrompt;
}

async function analyzeSinglePhoto(photoUrl: string, itemId: string, userPrompt: string): Promise<VisionOutput> {
  const photoStart = Date.now();
  const response = await analyzeImage(
    photoUrl,
    userPrompt,
    VISION_SYSTEM_PROMPT
  );

  const processingTimeMs = Date.now() - photoStart;
  return parseVisionResponse(response, itemId, processingTimeMs);
}

type ScalarValue = string | null;
type ScalarCandidate = { value: ScalarValue; confidence: number };
type GroupedScalar = {
  key: string;
  values: ScalarCandidate[];
  representative: ScalarCandidate;
  support: number;
  avgConfidence: number;
  maxConfidence: number;
};

function groupScalarCandidates(candidates: ScalarCandidate[]): GroupedScalar[] {
  const byValue = new Map<string, ScalarCandidate[]>();

  for (const candidate of candidates) {
    const key = candidate.value === null ? '__null__' : normalizeText(candidate.value);
    if (!byValue.has(key)) {
      byValue.set(key, []);
    }
    byValue.get(key)!.push(candidate);
  }

  return [...byValue.entries()].map(([key, values]) => {
    const avgConfidence = values.reduce((sum, v) => sum + clampConfidence(v.confidence), 0) / values.length;
    const representative = [...values].sort((a, b) => clampConfidence(b.confidence) - clampConfidence(a.confidence))[0];
    return {
      key,
      values,
      representative,
      support: values.length,
      avgConfidence,
      maxConfidence: clampConfidence(representative.confidence),
    };
  });
}

function pickBestGroupedScalar(groups: GroupedScalar[]): GroupedScalar {
  return [...groups].sort((a, b) => {
    if (b.support !== a.support) {
      return b.support - a.support;
    }
    if (b.avgConfidence !== a.avgConfidence) {
      return b.avgConfidence - a.avgConfidence;
    }
    return b.maxConfidence - a.maxConfidence;
  })[0];
}

function disagreementPenalty(selectedSupport: number, totalCandidates: number): number {
  if (totalCandidates <= 1) {
    return 0;
  }
  const disagreementRatio = (totalCandidates - selectedSupport) / totalCandidates;
  return disagreementRatio * MAX_DISAGREEMENT_PENALTY;
}

function mergeScalarCandidates(candidates: ScalarCandidate[]): { value: ScalarValue; confidence: number } | null {
  if (candidates.length === 0) {
    return null;
  }

  const groups = groupScalarCandidates(candidates);
  const selected = pickBestGroupedScalar(groups);
  const penalty = disagreementPenalty(selected.support, candidates.length);

  return {
    value: selected.representative.value,
    confidence: clampConfidence(selected.avgConfidence - penalty),
  };
}

function mergeAttributes(outputs: VisionOutput[]): DetectedAttribute[] {
  type AttributeGroup = {
    keyNorm: string;
    valueNorm: string;
    keyDisplay: string;
    valueDisplay: string;
    support: number;
    avgConfidence: number;
    maxConfidence: number;
  };

  const pairCounts = new Map<string, { keyNorm: string; valueNorm: string; keyDisplay: string; valueDisplay: string; confidences: number[] }>();

  for (const output of outputs) {
    for (const attr of output.detectedAttributes) {
      const keyNorm = normalizeText(attr.key);
      const valueNorm = normalizeText(attr.value);
      const pairKey = `${keyNorm}::${valueNorm}`;

      if (!pairCounts.has(pairKey)) {
        pairCounts.set(pairKey, {
          keyNorm,
          valueNorm,
          keyDisplay: attr.key.trim(),
          valueDisplay: attr.value.trim(),
          confidences: [],
        });
      }

      const group = pairCounts.get(pairKey)!;
      group.confidences.push(clampConfidence(attr.confidence));
      if (clampConfidence(attr.confidence) >= Math.max(...group.confidences)) {
        group.keyDisplay = attr.key.trim() || group.keyDisplay;
        group.valueDisplay = attr.value.trim() || group.valueDisplay;
      }
    }
  }

  const allGroups: AttributeGroup[] = [...pairCounts.values()].map((group) => {
    const support = group.confidences.length;
    const avgConfidence = group.confidences.reduce((sum, c) => sum + c, 0) / support;
    const maxConfidence = Math.max(...group.confidences);
    return {
      keyNorm: group.keyNorm,
      valueNorm: group.valueNorm,
      keyDisplay: group.keyDisplay,
      valueDisplay: group.valueDisplay,
      support,
      avgConfidence,
      maxConfidence,
    };
  });

  const byKey = new Map<string, AttributeGroup[]>();
  for (const group of allGroups) {
    if (!byKey.has(group.keyNorm)) {
      byKey.set(group.keyNorm, []);
    }
    byKey.get(group.keyNorm)!.push(group);
  }

  const merged: DetectedAttribute[] = [];
  for (const groups of byKey.values()) {
    const winner = [...groups].sort((a, b) => {
      if (b.support !== a.support) {
        return b.support - a.support;
      }
      if (b.avgConfidence !== a.avgConfidence) {
        return b.avgConfidence - a.avgConfidence;
      }
      return b.maxConfidence - a.maxConfidence;
    })[0];

    const totalSupport = groups.reduce((sum, group) => sum + group.support, 0);
    const penalty = disagreementPenalty(winner.support, totalSupport);
    merged.push({
      key: winner.keyDisplay,
      value: winner.valueDisplay,
      confidence: clampConfidence(winner.avgConfidence - penalty),
    });
  }

  return merged.sort((a, b) => {
    const keyCmp = a.key.localeCompare(b.key);
    if (keyCmp !== 0) {
      return keyCmp;
    }
    return b.confidence - a.confidence;
  });
}

function mergeRawLabels(outputs: VisionOutput[]): string[] | undefined {
  const labels: string[] = [];
  for (const output of outputs) {
    if (output.rawLabels) {
      labels.push(...output.rawLabels);
    }
  }

  if (labels.length === 0) {
    return undefined;
  }

  return uniqueStrings(labels).sort((a, b) => a.localeCompare(b));
}

function mergeShippingEstimate(outputs: VisionOutput[]): ShippingEstimate | undefined {
  const estimates = outputs
    .map((output) => output.shippingEstimate)
    .filter((estimate): estimate is ShippingEstimate => Boolean(estimate));

  if (estimates.length === 0) {
    return undefined;
  }

  const byPackaging = new Map<string, ShippingEstimate[]>();
  for (const estimate of estimates) {
    if (!byPackaging.has(estimate.packagingType)) {
      byPackaging.set(estimate.packagingType, []);
    }
    byPackaging.get(estimate.packagingType)!.push(estimate);
  }

  const selectedGroup = [...byPackaging.entries()]
    .map(([packagingType, values]) => ({
      packagingType,
      values,
      support: values.length,
      avgConfidence: values.reduce((sum, value) => sum + value.confidence, 0) / values.length,
      maxConfidence: Math.max(...values.map((value) => value.confidence)),
    }))
    .sort((a, b) => {
      if (b.support !== a.support) {
        return b.support - a.support;
      }
      if (b.avgConfidence !== a.avgConfidence) {
        return b.avgConfidence - a.avgConfidence;
      }
      return b.maxConfidence - a.maxConfidence;
    })[0];

  const selectedValues = selectedGroup.values;
  const mergeDims = (getDims: (estimate: ShippingEstimate) => { l: number; w: number; h: number }) =>
    sortDimsDescending({
      l: median(selectedValues.map((value) => getDims(value).l)),
      w: median(selectedValues.map((value) => getDims(value).w)),
      h: median(selectedValues.map((value) => getDims(value).h)),
    });

  const penalty = disagreementPenalty(selectedGroup.support, estimates.length);
  const mergedRaw = {
    packagingType: selectedGroup.packagingType,
    itemDimensionsIn: mergeDims((estimate) => estimate.itemDimensionsIn),
    itemWeightOz: median(selectedValues.map((value) => value.itemWeightOz)),
    packageDimensionsIn: mergeDims((estimate) => estimate.packageDimensionsIn),
    packageWeightOz: median(selectedValues.map((value) => value.packageWeightOz)),
    confidence: clampConfidence(
      (selectedValues.reduce((sum, value) => sum + value.confidence, 0) / selectedValues.length) - penalty
    ),
    assumptions: uniqueStrings(selectedValues.flatMap((value) => value.assumptions)),
  };

  return normalizeShippingEstimate(mergedRaw) || undefined;
}

export function mergeVisionOutputs(
  outputs: VisionOutput[],
  itemId: string,
  processingTimeMs: number
): VisionOutput {
  if (outputs.length === 0) {
    return {
      itemId,
      detectedCategory: { value: 'Unknown', confidence: 0.1 },
      detectedColor: { value: 'Unknown', confidence: 0.1 },
      detectedAttributes: [],
      processingTimeMs,
    };
  }

  const mergedCategory = mergeScalarCandidates(
    outputs.map((output) => ({
      value: output.detectedCategory.value,
      confidence: output.detectedCategory.confidence,
    }))
  );

  const mergedColor = mergeScalarCandidates(
    outputs.map((output) => ({
      value: output.detectedColor.value,
      confidence: output.detectedColor.confidence,
    }))
  );

  const mergedBrand = mergeScalarCandidates(
    outputs
      .map((output) => output.detectedBrand)
      .filter((brand): brand is NonNullable<VisionOutput['detectedBrand']> => Boolean(brand))
      .map((brand) => ({ value: brand.value, confidence: brand.confidence }))
  );

  const mergedCondition = mergeScalarCandidates(
    outputs
      .map((output) => output.detectedCondition)
      .filter((condition): condition is NonNullable<VisionOutput['detectedCondition']> => Boolean(condition))
      .map((condition) => ({ value: condition.value, confidence: condition.confidence }))
  );

  const mergedOutput: VisionOutput = {
    itemId,
    detectedCategory: {
      value: mergedCategory?.value || 'Unknown',
      confidence: mergedCategory?.confidence ?? 0.1,
    },
    detectedColor: {
      value: mergedColor?.value || 'Unknown',
      confidence: mergedColor?.confidence ?? 0.1,
    },
    detectedAttributes: mergeAttributes(outputs),
    processingTimeMs,
  };

  if (mergedBrand) {
    mergedOutput.detectedBrand = {
      value: mergedBrand.value,
      confidence: mergedBrand.confidence,
    };
  }

  if (mergedCondition && mergedCondition.value !== null) {
    mergedOutput.detectedCondition = {
      value: mergedCondition.value,
      confidence: mergedCondition.confidence,
    };
  }

  const mergedLabels = mergeRawLabels(outputs);
  if (mergedLabels) {
    mergedOutput.rawLabels = mergedLabels;
  }

  const mergedShipping = mergeShippingEstimate(outputs);
  if (mergedShipping) {
    mergedOutput.shippingEstimate = mergedShipping;
  }

  return mergedOutput;
}

export async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  if (limit < 1) {
    throw new Error('Concurrency limit must be >= 1');
  }

  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Analyze an item's photos to detect attributes
 * 
 * @param input - The item input with photos and optional hints
 * @returns Vision output with detected attributes and confidence scores
 */
export async function analyzeItem(input: ItemInput): Promise<VisionOutput> {
  const startTime = Date.now();
  const userPrompt = buildVisionUserPrompt(input);

  try {
    const tasks = input.photos.map((photoUrl, index) => async () => {
      try {
        return await analyzeSinglePhoto(photoUrl, input.id, userPrompt);
      } catch (error) {
        console.warn(`[${input.id}] Vision analysis failed for photo ${index + 1}/${input.photos.length}:`, error);
        return null;
      }
    });

    const results = await runWithConcurrencyLimit(tasks, PHOTO_ANALYSIS_CONCURRENCY);
    const successfulOutputs = results.filter((result): result is VisionOutput => Boolean(result));
    const processingTimeMs = Date.now() - startTime;

    const visionOutput = mergeVisionOutputs(successfulOutputs, input.id, processingTimeMs);

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
