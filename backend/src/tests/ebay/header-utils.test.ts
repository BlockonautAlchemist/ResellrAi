/**
 * Header Utilities Tests
 *
 * Tests for eBay header validation and sanitization.
 * Fixes error 25709: "Invalid value for header Accept-Language"
 *
 * Run with: npx tsx src/tests/ebay/header-utils.test.ts
 */

import {
  validateLanguageHeader,
  sanitizeHeaders,
  getContentLanguageHeader,
  redactSensitiveHeaders,
  DEFAULT_CONTENT_LANGUAGE,
} from '../../services/ebay/header-utils.js';

async function runTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║     Header Utilities Tests                ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // =============================================================================
  // validateLanguageHeader Tests
  // =============================================================================

  // Test 1: Valid "en-US" format
  try {
    const result = validateLanguageHeader('Content-Language', 'en-US');
    if (result.valid) {
      console.log('✅ Test 1: Valid "en-US" format accepted');
      passed++;
    } else {
      console.log('❌ Test 1: Valid "en-US" format rejected:', result.error);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 1: Error:', error);
    failed++;
  }

  // Test 2: Valid "de-DE" format
  try {
    const result = validateLanguageHeader('Content-Language', 'de-DE');
    if (result.valid) {
      console.log('✅ Test 2: Valid "de-DE" format accepted');
      passed++;
    } else {
      console.log('❌ Test 2: Valid "de-DE" format rejected:', result.error);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 2: Error:', error);
    failed++;
  }

  // Test 3: Invalid "en_US" format (underscore instead of hyphen)
  try {
    const result = validateLanguageHeader('Content-Language', 'en_US');
    if (!result.valid && result.error?.includes('xx-XX')) {
      console.log('✅ Test 3: Invalid "en_US" format rejected');
      passed++;
    } else {
      console.log('❌ Test 3: Invalid "en_US" format should be rejected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 3: Error:', error);
    failed++;
  }

  // Test 4: Invalid "en-us" format (lowercase country)
  try {
    const result = validateLanguageHeader('Content-Language', 'en-us');
    if (!result.valid) {
      console.log('✅ Test 4: Invalid "en-us" format rejected');
      passed++;
    } else {
      console.log('❌ Test 4: Invalid "en-us" format should be rejected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 4: Error:', error);
    failed++;
  }

  // Test 5: Invalid "US" format (no language code)
  try {
    const result = validateLanguageHeader('Content-Language', 'US');
    if (!result.valid) {
      console.log('✅ Test 5: Invalid "US" format rejected');
      passed++;
    } else {
      console.log('❌ Test 5: Invalid "US" format should be rejected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 5: Error:', error);
    failed++;
  }

  // Test 6: Invalid "EBAY_US" format
  try {
    const result = validateLanguageHeader('Content-Language', 'EBAY_US');
    if (!result.valid) {
      console.log('✅ Test 6: Invalid "EBAY_US" format rejected');
      passed++;
    } else {
      console.log('❌ Test 6: Invalid "EBAY_US" format should be rejected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 6: Error:', error);
    failed++;
  }

  // Test 7: Invalid undefined value
  try {
    const result = validateLanguageHeader('Content-Language', undefined);
    if (!result.valid && result.error?.includes('empty')) {
      console.log('✅ Test 7: undefined value rejected');
      passed++;
    } else {
      console.log('❌ Test 7: undefined value should be rejected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 7: Error:', error);
    failed++;
  }

  // Test 8: Invalid null value
  try {
    const result = validateLanguageHeader('Content-Language', null);
    if (!result.valid && result.error?.includes('empty')) {
      console.log('✅ Test 8: null value rejected');
      passed++;
    } else {
      console.log('❌ Test 8: null value should be rejected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 8: Error:', error);
    failed++;
  }

  // Test 9: Invalid empty string
  try {
    const result = validateLanguageHeader('Content-Language', '');
    if (!result.valid && result.error?.includes('empty')) {
      console.log('✅ Test 9: empty string rejected');
      passed++;
    } else {
      console.log('❌ Test 9: empty string should be rejected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 9: Error:', error);
    failed++;
  }

  // Test 10: Invalid object value
  try {
    const result = validateLanguageHeader('Content-Language', { locale: 'en-US' });
    if (!result.valid && result.error?.includes('string')) {
      console.log('✅ Test 10: object value rejected');
      passed++;
    } else {
      console.log('❌ Test 10: object value should be rejected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 10: Error:', error);
    failed++;
  }

  // Test 11: Invalid array value
  try {
    const result = validateLanguageHeader('Content-Language', ['en-US']);
    if (!result.valid && result.error?.includes('string')) {
      console.log('✅ Test 11: array value rejected');
      passed++;
    } else {
      console.log('❌ Test 11: array value should be rejected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 11: Error:', error);
    failed++;
  }

  // =============================================================================
  // sanitizeHeaders Tests
  // =============================================================================

  // Test 12: sanitizeHeaders removes Accept-Language
  try {
    const headers = {
      'Accept-Language': 'en-US',
      'Content-Language': 'en-US',
      'Accept': 'application/json',
    };
    const sanitized = sanitizeHeaders(headers);

    if (!('Accept-Language' in sanitized) && sanitized['Content-Language'] === 'en-US') {
      console.log('✅ Test 12: sanitizeHeaders removes Accept-Language');
      passed++;
    } else {
      console.log('❌ Test 12: sanitizeHeaders should remove Accept-Language');
      console.log('   Got:', sanitized);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 12: Error:', error);
    failed++;
  }

  // Test 13: sanitizeHeaders preserves other headers
  try {
    const headers = {
      'Content-Language': 'en-US',
      'Accept': 'application/json',
      'X-Custom-Header': 'custom-value',
    };
    const sanitized = sanitizeHeaders(headers);

    if (
      sanitized['Content-Language'] === 'en-US' &&
      sanitized['Accept'] === 'application/json' &&
      sanitized['X-Custom-Header'] === 'custom-value'
    ) {
      console.log('✅ Test 13: sanitizeHeaders preserves other headers');
      passed++;
    } else {
      console.log('❌ Test 13: sanitizeHeaders should preserve other headers');
      console.log('   Got:', sanitized);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 13: Error:', error);
    failed++;
  }

  // Test 14: sanitizeHeaders fixes invalid Content-Language
  try {
    const headers = {
      'Content-Language': 'en_US', // Invalid format
    };
    const sanitized = sanitizeHeaders(headers);

    if (sanitized['Content-Language'] === DEFAULT_CONTENT_LANGUAGE) {
      console.log('✅ Test 14: sanitizeHeaders fixes invalid Content-Language');
      passed++;
    } else {
      console.log('❌ Test 14: sanitizeHeaders should fix invalid Content-Language');
      console.log('   Got:', sanitized['Content-Language']);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 14: Error:', error);
    failed++;
  }

  // =============================================================================
  // getContentLanguageHeader Tests
  // =============================================================================

  // Test 15: getContentLanguageHeader returns correct format
  try {
    const headers = getContentLanguageHeader();

    if (headers['Content-Language'] === 'en-US') {
      console.log('✅ Test 15: getContentLanguageHeader returns "en-US"');
      passed++;
    } else {
      console.log('❌ Test 15: getContentLanguageHeader should return "en-US"');
      console.log('   Got:', headers);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 15: Error:', error);
    failed++;
  }

  // =============================================================================
  // redactSensitiveHeaders Tests
  // =============================================================================

  // Test 16: redactSensitiveHeaders redacts Authorization Bearer
  try {
    const headers = {
      'Authorization': 'Bearer v^1.1#i^1#r^0#secret_token_value',
      'Content-Language': 'en-US',
    };
    const redacted = redactSensitiveHeaders(headers);

    if (
      redacted['Authorization'] === 'Bearer [REDACTED]' &&
      redacted['Content-Language'] === 'en-US'
    ) {
      console.log('✅ Test 16: redactSensitiveHeaders redacts Bearer token');
      passed++;
    } else {
      console.log('❌ Test 16: redactSensitiveHeaders should redact Bearer token');
      console.log('   Got:', redacted);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 16: Error:', error);
    failed++;
  }

  // Test 17: redactSensitiveHeaders redacts Authorization Basic
  try {
    const headers = {
      'Authorization': 'Basic c2VjcmV0OnBhc3N3b3Jk',
    };
    const redacted = redactSensitiveHeaders(headers);

    if (redacted['Authorization'] === 'Basic [REDACTED]') {
      console.log('✅ Test 17: redactSensitiveHeaders redacts Basic auth');
      passed++;
    } else {
      console.log('❌ Test 17: redactSensitiveHeaders should redact Basic auth');
      console.log('   Got:', redacted);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 17: Error:', error);
    failed++;
  }

  // Test 18: redactSensitiveHeaders preserves non-sensitive headers
  try {
    const headers = {
      'Content-Language': 'en-US',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    const redacted = redactSensitiveHeaders(headers);

    if (
      redacted['Content-Language'] === 'en-US' &&
      redacted['Accept'] === 'application/json' &&
      redacted['Content-Type'] === 'application/json'
    ) {
      console.log('✅ Test 18: redactSensitiveHeaders preserves non-sensitive headers');
      passed++;
    } else {
      console.log('❌ Test 18: redactSensitiveHeaders should preserve non-sensitive headers');
      console.log('   Got:', redacted);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 18: Error:', error);
    failed++;
  }

  // Test 19: redactSensitiveHeaders handles case-insensitive header names
  try {
    const headers = {
      'authorization': 'Bearer token123',
    };
    const redacted = redactSensitiveHeaders(headers);

    if (redacted['authorization'] === 'Bearer [REDACTED]') {
      console.log('✅ Test 19: redactSensitiveHeaders handles lowercase header names');
      passed++;
    } else {
      console.log('❌ Test 19: redactSensitiveHeaders should handle lowercase header names');
      console.log('   Got:', redacted);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 19: Error:', error);
    failed++;
  }

  // =============================================================================
  // Edge Cases
  // =============================================================================

  // Test 20: Empty headers object
  try {
    const sanitized = sanitizeHeaders({});

    if (Object.keys(sanitized).length === 0) {
      console.log('✅ Test 20: sanitizeHeaders handles empty object');
      passed++;
    } else {
      console.log('❌ Test 20: sanitizeHeaders should handle empty object');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 20: Error:', error);
    failed++;
  }

  // Test 21: Case-insensitive Accept-Language removal
  try {
    const headers = {
      'accept-language': 'en-US',
      'ACCEPT-LANGUAGE': 'de-DE',
    };
    const sanitized = sanitizeHeaders(headers);

    const hasAcceptLanguage = Object.keys(sanitized).some(
      k => k.toLowerCase() === 'accept-language'
    );

    if (!hasAcceptLanguage) {
      console.log('✅ Test 21: sanitizeHeaders removes Accept-Language case-insensitively');
      passed++;
    } else {
      console.log('❌ Test 21: sanitizeHeaders should remove all Accept-Language variants');
      console.log('   Got:', sanitized);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 21: Error:', error);
    failed++;
  }

  // =============================================================================
  // Summary
  // =============================================================================

  console.log('\n═══════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
