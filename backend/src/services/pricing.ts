/**
 * PricingService
 * 
 * Estimates price range for items based on detected attributes.
 * Always includes required disclaimer per constitution.md.
 */

import { generateText } from './openrouter.js';
import type { VisionOutput, ListingDraft, PricingSuggestion } from '../types/schemas.js';

/**
 * Required pricing disclaimer per constitution.md
 */
const PRICING_DISCLAIMER = 'Price suggestions are estimates based on similar items. Actual selling price may vary.';

/**
 * System prompt for pricing estimation
 */
const PRICING_SYSTEM_PROMPT = `You are a resale pricing expert. Estimate fair market prices for used items on eBay and Poshmark.

RULES:
1. Be conservative - it's better to underprice than overprice
2. Consider condition heavily in pricing
3. Brand name items command higher prices but verify the brand
4. Provide a range: low (quick sale), mid (fair market), high (patient seller)
5. Explain your reasoning briefly
6. Never guarantee a sale price - these are estimates only
7. If you're uncertain, widen the price range and lower confidence

Return valid JSON only.`;

/**
 * Build pricing prompt from vision and draft data
 */
function buildPricingPrompt(vision: VisionOutput, draft: ListingDraft): string {
  const attributes = draft.attributes
    .map(a => `${a.key}: ${a.value}`)
    .join('\n');

  return `Estimate the resale price range for this item:

Category: ${draft.category.value}
Brand: ${draft.brand?.value || 'Unknown/Unbranded'}
Condition: ${draft.condition.value}
Color: ${vision.detectedColor.value}

Attributes:
${attributes || 'No specific attributes'}

Title: ${draft.title.value}

Consider:
- Similar items sold on eBay/Poshmark
- Brand premium (if applicable)
- Condition impact on price
- Current market demand

Return JSON:
{
  "lowPrice": number (quick sale price),
  "midPrice": number (fair market price),
  "highPrice": number (patient seller price),
  "confidence": 0.0-1.0 (how confident in this estimate),
  "basis": "Brief explanation of pricing rationale"
}`;
}

/**
 * Parse pricing response from AI
 */
function parsePricingResponse(
  response: string,
  itemId: string
): PricingSuggestion {
  // Clean up response
  let cleanResponse = response.trim();
  if (cleanResponse.startsWith('```')) {
    cleanResponse = cleanResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  }

  try {
    const parsed = JSON.parse(cleanResponse);
    
    // Validate prices are reasonable
    const lowPrice = Math.max(1, Math.round(parsed.lowPrice || 10));
    const midPrice = Math.max(lowPrice, Math.round(parsed.midPrice || lowPrice * 1.3));
    const highPrice = Math.max(midPrice, Math.round(parsed.highPrice || midPrice * 1.5));

    return {
      itemId,
      lowPrice,
      midPrice,
      highPrice,
      currency: 'USD',
      basis: parsed.basis || 'Based on similar items in comparable condition',
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      disclaimer: PRICING_DISCLAIMER,
    };
  } catch (error) {
    console.error('Failed to parse pricing response:', error);
    
    // Return conservative fallback pricing
    return {
      itemId,
      lowPrice: 10,
      midPrice: 20,
      highPrice: 35,
      currency: 'USD',
      basis: 'Default estimate - unable to determine specific pricing',
      confidence: 0.3,
      disclaimer: PRICING_DISCLAIMER,
    };
  }
}

/**
 * Estimate price range for an item
 * 
 * @param vision - Vision analysis output
 * @param draft - Generated listing draft
 * @returns Pricing suggestion with range and explanation
 */
export async function estimatePrice(
  vision: VisionOutput,
  draft: ListingDraft
): Promise<PricingSuggestion> {
  const prompt = buildPricingPrompt(vision, draft);
  
  try {
    const response = await generateText(prompt, PRICING_SYSTEM_PROMPT);
    return parsePricingResponse(response, vision.itemId);
  } catch (error) {
    console.error('Pricing estimation failed:', error);
    
    // Return conservative fallback
    return {
      itemId: vision.itemId,
      lowPrice: 10,
      midPrice: 20,
      highPrice: 35,
      currency: 'USD',
      basis: 'Default estimate - pricing service unavailable',
      confidence: 0.2,
      disclaimer: PRICING_DISCLAIMER,
    };
  }
}

/**
 * Regenerate price estimate with additional context
 */
export async function regeneratePrice(
  vision: VisionOutput,
  draft: ListingDraft,
  userContext?: string
): Promise<PricingSuggestion> {
  let prompt = buildPricingPrompt(vision, draft);
  
  if (userContext) {
    prompt += `\n\nAdditional context from seller: ${userContext}`;
  }
  
  prompt += '\n\nGenerate a NEW price estimate, potentially different from previous suggestions.';
  
  try {
    const response = await generateText(prompt, PRICING_SYSTEM_PROMPT);
    return parsePricingResponse(response, vision.itemId);
  } catch (error) {
    console.error('Price regeneration failed:', error);
    return estimatePrice(vision, draft);
  }
}

/**
 * Adjust price based on condition
 * Utility function for manual price adjustments
 */
export function adjustPriceForCondition(
  baseMidPrice: number,
  condition: string
): { lowPrice: number; midPrice: number; highPrice: number } {
  const conditionMultipliers: Record<string, number> = {
    new: 1.0,
    like_new: 0.85,
    good: 0.7,
    fair: 0.5,
    poor: 0.3,
  };

  const multiplier = conditionMultipliers[condition] || 0.7;
  const adjustedMid = Math.round(baseMidPrice * multiplier);

  return {
    lowPrice: Math.round(adjustedMid * 0.7),
    midPrice: adjustedMid,
    highPrice: Math.round(adjustedMid * 1.4),
  };
}
