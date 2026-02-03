/**
 * eBay Publish Pipeline Validator
 *
 * Pre-validation before any eBay API calls.
 * Validates all required fields to fail fast with clear error messages.
 */

import type { EbayListingDraft } from '../../types/ebay-schemas.js';

// =============================================================================
// VALIDATION ERROR CODES
// =============================================================================

export const VALIDATION_ERROR_CODES = {
  TITLE_REQUIRED: 'VALIDATION_TITLE_REQUIRED',
  TITLE_TOO_LONG: 'VALIDATION_TITLE_TOO_LONG',
  DESCRIPTION_REQUIRED: 'VALIDATION_DESCRIPTION_REQUIRED',
  DESCRIPTION_TOO_LONG: 'VALIDATION_DESCRIPTION_TOO_LONG',
  NO_IMAGES: 'VALIDATION_NO_IMAGES',
  TOO_MANY_IMAGES: 'VALIDATION_TOO_MANY_IMAGES',
  INVALID_CONDITION: 'VALIDATION_INVALID_CONDITION',
  CATEGORY_REQUIRED: 'VALIDATION_CATEGORY_REQUIRED',
  INVALID_PRICE: 'VALIDATION_INVALID_PRICE',
  INVALID_QUANTITY: 'VALIDATION_INVALID_QUANTITY',
  POLICIES_INCOMPLETE: 'VALIDATION_POLICIES_INCOMPLETE',
  LOCATION_REQUIRED: 'VALIDATION_LOCATION_REQUIRED',
} as const;

export type ValidationErrorCode = typeof VALIDATION_ERROR_CODES[keyof typeof VALIDATION_ERROR_CODES];

// =============================================================================
// VALIDATION CONSTRAINTS
// =============================================================================

const CONSTRAINTS = {
  TITLE_MAX_LENGTH: 80,
  DESCRIPTION_MAX_LENGTH: 4000,
  MIN_IMAGES: 1,
  MAX_IMAGES: 12,
  MIN_PRICE: 0,
  MIN_QUANTITY: 1,
} as const;

// Valid eBay condition IDs
const VALID_CONDITIONS = new Set([
  'NEW',
  'LIKE_NEW',
  'VERY_GOOD',
  'GOOD',
  'ACCEPTABLE',
  'new',
  'like_new',
  'very_good',
  'good',
  'acceptable',
  'fair', // Maps to GOOD
  'poor', // Maps to ACCEPTABLE
]);

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

export interface ValidationError {
  code: ValidationErrorCode;
  field: string;
  message: string;
  constraint?: number | string;
  actual?: number | string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// =============================================================================
// VALIDATOR
// =============================================================================

/**
 * Validate all required fields for publishing to eBay
 * Returns structured validation errors for each invalid field
 */
export function validatePublishInput(
  draft: EbayListingDraft,
  policies?: {
    fulfillment_policy_id?: string;
    payment_policy_id?: string;
    return_policy_id?: string;
  },
  merchantLocationKey?: string
): ValidationResult {
  const errors: ValidationError[] = [];

  // Title validation
  if (!draft.title || draft.title.trim().length === 0) {
    errors.push({
      code: VALIDATION_ERROR_CODES.TITLE_REQUIRED,
      field: 'title',
      message: 'Title is required',
    });
  } else if (draft.title.length > CONSTRAINTS.TITLE_MAX_LENGTH) {
    errors.push({
      code: VALIDATION_ERROR_CODES.TITLE_TOO_LONG,
      field: 'title',
      message: `Title exceeds maximum length of ${CONSTRAINTS.TITLE_MAX_LENGTH} characters`,
      constraint: CONSTRAINTS.TITLE_MAX_LENGTH,
      actual: draft.title.length,
    });
  }

  // Description validation
  if (!draft.description || draft.description.trim().length === 0) {
    errors.push({
      code: VALIDATION_ERROR_CODES.DESCRIPTION_REQUIRED,
      field: 'description',
      message: 'Description is required',
    });
  } else if (draft.description.length > CONSTRAINTS.DESCRIPTION_MAX_LENGTH) {
    errors.push({
      code: VALIDATION_ERROR_CODES.DESCRIPTION_TOO_LONG,
      field: 'description',
      message: `Description exceeds maximum length of ${CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`,
      constraint: CONSTRAINTS.DESCRIPTION_MAX_LENGTH,
      actual: draft.description.length,
    });
  }

  // Images validation
  if (!draft.image_urls || draft.image_urls.length < CONSTRAINTS.MIN_IMAGES) {
    errors.push({
      code: VALIDATION_ERROR_CODES.NO_IMAGES,
      field: 'image_urls',
      message: `At least ${CONSTRAINTS.MIN_IMAGES} image is required`,
      constraint: CONSTRAINTS.MIN_IMAGES,
      actual: draft.image_urls?.length || 0,
    });
  } else if (draft.image_urls.length > CONSTRAINTS.MAX_IMAGES) {
    errors.push({
      code: VALIDATION_ERROR_CODES.TOO_MANY_IMAGES,
      field: 'image_urls',
      message: `Maximum ${CONSTRAINTS.MAX_IMAGES} images allowed`,
      constraint: CONSTRAINTS.MAX_IMAGES,
      actual: draft.image_urls.length,
    });
  }

  // Condition validation
  if (!draft.condition?.id) {
    errors.push({
      code: VALIDATION_ERROR_CODES.INVALID_CONDITION,
      field: 'condition.id',
      message: 'Condition is required',
    });
  } else if (!VALID_CONDITIONS.has(draft.condition.id)) {
    errors.push({
      code: VALIDATION_ERROR_CODES.INVALID_CONDITION,
      field: 'condition.id',
      message: `Invalid condition: ${draft.condition.id}. Valid values: NEW, LIKE_NEW, VERY_GOOD, GOOD, ACCEPTABLE`,
      actual: draft.condition.id,
    });
  }

  // Category validation
  if (!draft.category_id || draft.category_id.trim().length === 0) {
    errors.push({
      code: VALIDATION_ERROR_CODES.CATEGORY_REQUIRED,
      field: 'category_id',
      message: 'Category ID is required',
    });
  }

  // Price validation
  if (!draft.price?.value || draft.price.value <= CONSTRAINTS.MIN_PRICE) {
    errors.push({
      code: VALIDATION_ERROR_CODES.INVALID_PRICE,
      field: 'price.value',
      message: 'Price must be greater than 0',
      constraint: CONSTRAINTS.MIN_PRICE,
      actual: draft.price?.value || 0,
    });
  }

  // Quantity validation
  if (!draft.quantity || draft.quantity < CONSTRAINTS.MIN_QUANTITY) {
    errors.push({
      code: VALIDATION_ERROR_CODES.INVALID_QUANTITY,
      field: 'quantity',
      message: `Quantity must be at least ${CONSTRAINTS.MIN_QUANTITY}`,
      constraint: CONSTRAINTS.MIN_QUANTITY,
      actual: draft.quantity || 0,
    });
  }

  // Policies validation (if provided, all 3 must be present)
  if (policies) {
    const missingPolicies: string[] = [];
    if (!policies.fulfillment_policy_id) {
      missingPolicies.push('fulfillment_policy_id');
    }
    if (!policies.payment_policy_id) {
      missingPolicies.push('payment_policy_id');
    }
    if (!policies.return_policy_id) {
      missingPolicies.push('return_policy_id');
    }
    if (missingPolicies.length > 0 && missingPolicies.length < 3) {
      errors.push({
        code: VALIDATION_ERROR_CODES.POLICIES_INCOMPLETE,
        field: 'policies',
        message: `Missing policy IDs: ${missingPolicies.join(', ')}. All 3 policies are required.`,
        actual: `missing: ${missingPolicies.join(', ')}`,
      });
    }
  }

  // Location validation
  if (merchantLocationKey !== undefined && (!merchantLocationKey || merchantLocationKey.trim().length === 0)) {
    errors.push({
      code: VALIDATION_ERROR_CODES.LOCATION_REQUIRED,
      field: 'merchantLocationKey',
      message: 'Merchant location key is required',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format validation errors for API response
 */
export function formatValidationErrors(errors: ValidationError[]): {
  code: string;
  message: string;
  details: ValidationError[];
} {
  const primaryError = errors[0];
  return {
    code: primaryError.code,
    message: errors.length === 1
      ? primaryError.message
      : `Validation failed: ${errors.length} errors`,
    details: errors,
  };
}
