/**
 * eBay Header Utilities
 *
 * Provides header validation and sanitization for eBay API requests.
 * Fixes error 25709: "Invalid value for header Accept-Language"
 *
 * The eBay Sell Inventory API does NOT support Accept-Language header.
 * This module defensively removes it and validates Content-Language.
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Valid language header format: lowercase-UPPERCASE (e.g., "en-US", "de-DE")
 * Per eBay documentation, Content-Language must be in BCP 47 format
 */
const LANGUAGE_HEADER_REGEX = /^[a-z]{2}-[A-Z]{2}$/;

/**
 * Headers that should be redacted in logs
 */
const SENSITIVE_HEADERS = ['authorization', 'x-ebay-c-marketplace-id'];

/**
 * Default Content-Language for eBay US marketplace
 */
export const DEFAULT_CONTENT_LANGUAGE = 'en-US';

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a language header value (Content-Language or Accept-Language)
 *
 * Valid formats: "en-US", "de-DE", etc. (lowercase-UPPERCASE)
 * Invalid: "en_US", "en-us", "US", "EBAY_US", undefined, null, '', arrays, objects
 *
 * @param name - Header name (for error messages)
 * @param value - Header value to validate
 * @returns Object with valid flag and optional error message
 */
export function validateLanguageHeader(
  name: string,
  value: unknown
): { valid: boolean; error?: string } {
  // Reject null, undefined, empty
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: `${name} cannot be empty` };
  }

  // Reject non-strings (arrays, objects, numbers)
  if (typeof value !== 'string') {
    return { valid: false, error: `${name} must be a string, got ${typeof value}` };
  }

  // Validate format
  if (!LANGUAGE_HEADER_REGEX.test(value)) {
    return {
      valid: false,
      error: `${name} must be in format "xx-XX" (e.g., "en-US"), got "${value}"`,
    };
  }

  return { valid: true };
}

// =============================================================================
// SANITIZATION
// =============================================================================

/**
 * Sanitize headers for eBay API requests
 *
 * - Removes Accept-Language (not supported by Sell Inventory API, causes error 25709)
 * - Validates Content-Language if present
 *
 * @param headers - Headers object to sanitize
 * @returns Sanitized headers object (new object, original not modified)
 */
export function sanitizeHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.trim().toLowerCase();

    // Skip Accept-Language entirely - eBay Inventory API rejects it with error 25709
    if (lowerKey === 'accept-language') {
      console.warn(
        `[eBay API] Removing Accept-Language header - not supported by Sell Inventory API`
      );
      continue;
    }

    // Validate Content-Language if present
    if (lowerKey === 'content-language') {
      const validation = validateLanguageHeader('Content-Language', value);
      if (!validation.valid) {
        console.warn(
          `[eBay API] Invalid Content-Language header: ${validation.error}. Using default: ${DEFAULT_CONTENT_LANGUAGE}`
        );
        sanitized[key] = DEFAULT_CONTENT_LANGUAGE;
        continue;
      }
    }

    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Get the standard Content-Language header for eBay US marketplace
 *
 * @returns Headers object with Content-Language set
 */
export function getContentLanguageHeader(): Record<string, string> {
  return {
    'Content-Language': DEFAULT_CONTENT_LANGUAGE,
  };
}

// =============================================================================
// LOGGING UTILITIES
// =============================================================================

/**
 * Redact sensitive headers for safe logging
 *
 * Redacts Authorization, API keys, etc. to prevent token leakage in logs
 *
 * @param headers - Headers object to redact
 * @returns New headers object with sensitive values redacted
 */
export function redactSensitiveHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_HEADERS.includes(lowerKey)) {
      // Redact but show type of auth
      if (lowerKey === 'authorization') {
        if (value.startsWith('Bearer ')) {
          redacted[key] = 'Bearer [REDACTED]';
        } else if (value.startsWith('Basic ')) {
          redacted[key] = 'Basic [REDACTED]';
        } else {
          redacted[key] = '[REDACTED]';
        }
      } else {
        redacted[key] = '[REDACTED]';
      }
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Format headers for debug logging
 *
 * @param method - HTTP method (GET, POST, PUT, etc.)
 * @param path - API path
 * @param headers - Headers to log (will be redacted)
 */
export function logRequestHeaders(
  method: string,
  path: string,
  headers: Record<string, string>
): void {
  const redacted = redactSensitiveHeaders(headers);
  console.log(`[eBay API] ${method} ${path}`);
  console.log(`Headers: ${JSON.stringify(redacted)}`);
}
