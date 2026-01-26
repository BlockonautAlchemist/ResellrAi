/**
 * ResellrAI Type Definitions
 * 
 * Canonical TypeScript types derived from data_schema.md
 * These types are the source of truth for all data flowing through the system.
 */

import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const ConditionEnum = z.enum(['new', 'like_new', 'good', 'fair', 'poor']);
export type Condition = z.infer<typeof ConditionEnum>;

export const PlatformEnum = z.enum(['ebay']);
export type Platform = z.infer<typeof PlatformEnum>;

export const ListingStatusEnum = z.enum(['draft', 'ready', 'exported']);
export type ListingStatus = z.infer<typeof ListingStatusEnum>;

export const EditTypeEnum = z.enum(['manual', 'regenerate']);
export type EditType = z.infer<typeof EditTypeEnum>;

// =============================================================================
// SCHEMA 1: ItemInput
// =============================================================================

export const UserHintsSchema = z.object({
  category: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  condition: ConditionEnum.nullable().optional(),
});

export const ItemInputSchema = z.object({
  id: z.string().uuid(),
  photos: z.array(z.string()).min(1).max(10),
  userHints: UserHintsSchema.optional(),
  createdAt: z.string().datetime(),
});

export type UserHints = z.infer<typeof UserHintsSchema>;
export type ItemInput = z.infer<typeof ItemInputSchema>;

// =============================================================================
// SCHEMA 2: VisionOutput
// =============================================================================

export const ConfidenceValueSchema = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
});

export const NullableConfidenceValueSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const DetectedAttributeSchema = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
});

export const VisionOutputSchema = z.object({
  itemId: z.string().uuid(),
  detectedCategory: ConfidenceValueSchema,
  detectedBrand: NullableConfidenceValueSchema.optional(),
  detectedColor: ConfidenceValueSchema,
  detectedCondition: ConfidenceValueSchema.optional(),
  detectedAttributes: z.array(DetectedAttributeSchema),
  rawLabels: z.array(z.string()).optional(),
  processingTimeMs: z.number(),
});

export type ConfidenceValue = z.infer<typeof ConfidenceValueSchema>;
export type NullableConfidenceValue = z.infer<typeof NullableConfidenceValueSchema>;
export type DetectedAttribute = z.infer<typeof DetectedAttributeSchema>;
export type VisionOutput = z.infer<typeof VisionOutputSchema>;

// =============================================================================
// SCHEMA 3: ListingDraft
// =============================================================================

export const TitleSchema = z.object({
  value: z.string().max(80),
  charCount: z.number(),
});

export const DescriptionSchema = z.object({
  value: z.string(),
  charCount: z.number(),
});

export const CategorySchema = z.object({
  value: z.string(),
  platformCategoryId: z.string().nullable().optional(),
});

export const ListingAttributeSchema = z.object({
  key: z.string(),
  value: z.string(),
  editable: z.boolean().default(true),
});

export const ConditionFieldSchema = z.object({
  value: z.string(),
  requiresConfirmation: z.boolean().default(true),
});

export const BrandFieldSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean(),
});

export const ListingDraftSchema = z.object({
  itemId: z.string().uuid(),
  title: TitleSchema,
  description: DescriptionSchema,
  category: CategorySchema,
  attributes: z.array(ListingAttributeSchema),
  condition: ConditionFieldSchema,
  brand: BrandFieldSchema.optional(),
  generatedAt: z.string().datetime(),
});

export type Title = z.infer<typeof TitleSchema>;
export type Description = z.infer<typeof DescriptionSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type ListingAttribute = z.infer<typeof ListingAttributeSchema>;
export type ConditionField = z.infer<typeof ConditionFieldSchema>;
export type BrandField = z.infer<typeof BrandFieldSchema>;
export type ListingDraft = z.infer<typeof ListingDraftSchema>;

// =============================================================================
// SCHEMA 4: PricingSuggestion
// =============================================================================

export const PricingSuggestionSchema = z.object({
  itemId: z.string().uuid(),
  lowPrice: z.number().min(0),
  midPrice: z.number().min(0),
  highPrice: z.number().min(0),
  currency: z.string().default('USD'),
  basis: z.string(),
  confidence: z.number().min(0).max(1),
  disclaimer: z.string().default('Price suggestions are estimates based on similar items. Actual selling price may vary.'),
});

export type PricingSuggestion = z.infer<typeof PricingSuggestionSchema>;

// =============================================================================
// SCHEMA 5: PlatformVariant
// =============================================================================

export const PlatformTitleSchema = z.object({
  value: z.string(),
  maxLength: z.number(),
  valid: z.boolean(),
});

export const PlatformDescriptionSchema = z.object({
  value: z.string(),
  format: z.enum(['plain', 'html']),
});

export const PlatformAttributeSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const PlatformVariantSchema = z.object({
  platform: PlatformEnum,
  title: PlatformTitleSchema,
  description: PlatformDescriptionSchema,
  categoryId: z.string(),
  requiredAttributes: z.array(PlatformAttributeSchema),
  optionalAttributes: z.array(PlatformAttributeSchema).optional(),
});

export type PlatformTitle = z.infer<typeof PlatformTitleSchema>;
export type PlatformDescription = z.infer<typeof PlatformDescriptionSchema>;
export type PlatformAttribute = z.infer<typeof PlatformAttributeSchema>;
export type PlatformVariant = z.infer<typeof PlatformVariantSchema>;

// =============================================================================
// SCHEMA 6: UserEdit
// =============================================================================

export const UserEditSchema = z.object({
  itemId: z.string().uuid(),
  field: z.string(),
  previousValue: z.any(),
  newValue: z.any(),
  editedAt: z.string().datetime(),
  editType: EditTypeEnum,
});

export type UserEdit = z.infer<typeof UserEditSchema>;

// =============================================================================
// SCHEMA 7: FinalListingPayload
// =============================================================================

export const FinalListingPayloadSchema = z.object({
  itemId: z.string().uuid(),
  platform: PlatformEnum,
  title: z.string(),
  description: z.string(),
  price: z.number().min(0),
  category: z.string(),
  attributes: z.array(PlatformAttributeSchema),
  photos: z.array(z.string().url()),
  status: ListingStatusEnum,
  exportedAt: z.string().datetime().nullable().optional(),
});

export type FinalListingPayload = z.infer<typeof FinalListingPayloadSchema>;

// =============================================================================
// API REQUEST/RESPONSE SCHEMAS
// =============================================================================

export const GenerateListingRequestSchema = z.object({
  photos: z.array(z.string()).min(1).max(10),
  userHints: UserHintsSchema.optional(),
  platform: PlatformEnum,
});

export type GenerateListingRequest = z.infer<typeof GenerateListingRequestSchema>;

export const GenerateListingResponseSchema = z.object({
  itemId: z.string().uuid(),
  visionOutput: VisionOutputSchema,
  listingDraft: ListingDraftSchema,
  pricingSuggestion: PricingSuggestionSchema,
  platformVariant: PlatformVariantSchema,
  photoUrls: z.array(z.string()),
});

export type GenerateListingResponse = z.infer<typeof GenerateListingResponseSchema>;

export const UpdateListingRequestSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  price: z.number().min(0).optional(),
  condition: z.string().optional(),
  attributes: z.array(PlatformAttributeSchema).optional(),
});

export type UpdateListingRequest = z.infer<typeof UpdateListingRequestSchema>;

export const RegenerateFieldRequestSchema = z.object({
  field: z.enum(['title', 'description', 'price']),
});

export type RegenerateFieldRequest = z.infer<typeof RegenerateFieldRequestSchema>;

// =============================================================================
// DATABASE RECORD SCHEMA
// =============================================================================

export const ListingRecordSchema = z.object({
  id: z.string().uuid(),
  item_input: ItemInputSchema,
  vision_output: VisionOutputSchema.nullable(),
  listing_draft: ListingDraftSchema.nullable(),
  pricing_suggestion: PricingSuggestionSchema.nullable(),
  platform: PlatformEnum.nullable(),
  status: ListingStatusEnum,
  photo_urls: z.array(z.string()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type ListingRecord = z.infer<typeof ListingRecordSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Confidence thresholds for AI detection
 */
export const CONFIDENCE_THRESHOLDS = {
  AUTO_ACCEPT: 0.85,      // Auto-accept, no confirmation needed
  REVIEW_REQUIRED: 0.60,  // Show value, flag for user review
  UNKNOWN: 0.60,          // Below this, show as "Unknown"
} as const;

/**
 * Platform character limits
 */
export const PLATFORM_LIMITS = {
  ebay: {
    titleMax: 80,
    descriptionMax: 4000,
  },
} as const;

/**
 * Check if a confidence value requires user confirmation
 */
export function requiresConfirmation(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.AUTO_ACCEPT;
}

/**
 * Check if a confidence value is too low to display
 */
export function isTooLowConfidence(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.UNKNOWN;
}
