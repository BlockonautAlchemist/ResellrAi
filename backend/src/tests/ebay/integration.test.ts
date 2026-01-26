/**
 * eBay Integration Tests
 *
 * Comprehensive tests for:
 * - OAuth start URL generation
 * - Token refresh logic
 * - Comps query validation
 * - Publish flow validation
 * - Error handling
 *
 * Run with: npx tsx src/tests/ebay/integration.test.ts
 */

import { config } from 'dotenv';
config();

import {
  EBAY_ERROR_CODES,
  EBAY_ERROR_MESSAGES,
  buildEbayError,
  createErrorResponse,
  isRetryableError,
  requiresReauth,
  classifyEbayError,
} from '../../services/ebay/errors.js';
import {
  EBAY_API_URLS,
  EBAY_REQUIRED_SCOPES,
  EbayCompsQuerySchema,
  EbayPublishResultSchema,
  tokenNeedsRefresh,
  TOKEN_REFRESH_WINDOW_MS,
} from '../../types/ebay-schemas.js';

async function runTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║     eBay Integration Tests (Phase 6)      ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // ==========================================================================
  // OAUTH URL TESTS
  // ==========================================================================

  console.log('--- OAuth URL Tests ---\n');

  // Test 1: Sandbox auth URL format
  try {
    const sandboxUrl = EBAY_API_URLS.sandbox.auth;

    if (sandboxUrl.includes('sandbox') && sandboxUrl.includes('ebay.com')) {
      console.log('✅ Test 1: Sandbox auth URL contains sandbox domain');
      passed++;
    } else {
      console.log(`❌ Test 1: Invalid sandbox URL: ${sandboxUrl}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 1: Error:', error);
    failed++;
  }

  // Test 2: Production auth URL format
  try {
    const prodUrl = EBAY_API_URLS.production.auth;

    if (!prodUrl.includes('sandbox') && prodUrl.includes('ebay.com')) {
      console.log('✅ Test 2: Production auth URL does not contain sandbox');
      passed++;
    } else {
      console.log(`❌ Test 2: Invalid production URL: ${prodUrl}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 2: Error:', error);
    failed++;
  }

  // Test 3: Required scopes are defined
  try {
    const hasInventory = EBAY_REQUIRED_SCOPES.some((s) => s.includes('sell.inventory'));
    const hasAccount = EBAY_REQUIRED_SCOPES.some((s) => s.includes('sell.account'));
    const hasFulfillment = EBAY_REQUIRED_SCOPES.some((s) => s.includes('sell.fulfillment'));

    if (hasInventory && hasAccount && hasFulfillment) {
      console.log('✅ Test 3: All required OAuth scopes defined');
      passed++;
    } else {
      console.log('❌ Test 3: Missing required scopes');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 3: Error:', error);
    failed++;
  }

  // ==========================================================================
  // TOKEN REFRESH TESTS
  // ==========================================================================

  console.log('\n--- Token Refresh Tests ---\n');

  // Test 4: Token not expired - no refresh needed
  try {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    const needsRefresh = tokenNeedsRefresh(futureExpiry);

    if (!needsRefresh) {
      console.log('✅ Test 4: Token with 1hr remaining does not need refresh');
      passed++;
    } else {
      console.log('❌ Test 4: Should not need refresh with 1hr remaining');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 4: Error:', error);
    failed++;
  }

  // Test 5: Token expiring soon - needs refresh
  try {
    const soonExpiry = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 minutes from now
    const needsRefresh = tokenNeedsRefresh(soonExpiry);

    if (needsRefresh) {
      console.log('✅ Test 5: Token expiring in 2min needs refresh');
      passed++;
    } else {
      console.log('❌ Test 5: Should need refresh within 5min window');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 5: Error:', error);
    failed++;
  }

  // Test 6: Token already expired - needs refresh
  try {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago
    const needsRefresh = tokenNeedsRefresh(pastExpiry);

    if (needsRefresh) {
      console.log('✅ Test 6: Expired token needs refresh');
      passed++;
    } else {
      console.log('❌ Test 6: Expired token should need refresh');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 6: Error:', error);
    failed++;
  }

  // Test 7: Refresh window constant
  try {
    const expectedWindow = 5 * 60 * 1000; // 5 minutes

    if (TOKEN_REFRESH_WINDOW_MS === expectedWindow) {
      console.log('✅ Test 7: Token refresh window is 5 minutes');
      passed++;
    } else {
      console.log(`❌ Test 7: Expected ${expectedWindow}ms, got ${TOKEN_REFRESH_WINDOW_MS}ms`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 7: Error:', error);
    failed++;
  }

  // ==========================================================================
  // ERROR HANDLING TESTS
  // ==========================================================================

  console.log('\n--- Error Handling Tests ---\n');

  // Test 8: All error codes have messages
  try {
    const codes = Object.values(EBAY_ERROR_CODES);
    const allHaveMessages = codes.every((code) => EBAY_ERROR_MESSAGES[code]);

    if (allHaveMessages) {
      console.log(`✅ Test 8: All ${codes.length} error codes have messages`);
      passed++;
    } else {
      const missing = codes.filter((code) => !EBAY_ERROR_MESSAGES[code]);
      console.log(`❌ Test 8: Missing messages for: ${missing.join(', ')}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 8: Error:', error);
    failed++;
  }

  // Test 9: Build error response structure
  try {
    const error = buildEbayError('AUTH_REQUIRED', 'Custom message');

    if (
      error.error.code === 'AUTH_REQUIRED' &&
      error.error.message === 'Custom message' &&
      error.request_id &&
      error.timestamp &&
      error.recovery?.action === 'reauth'
    ) {
      console.log('✅ Test 9: Error response structure is correct');
      passed++;
    } else {
      console.log('❌ Test 9: Error structure missing fields');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 9: Error:', error);
    failed++;
  }

  // Test 10: Retryable error classification
  try {
    const retryable = isRetryableError('RATE_LIMITED');
    const notRetryable = isRetryableError('AUTH_REQUIRED');

    if (retryable && !notRetryable) {
      console.log('✅ Test 10: Retryable error classification works');
      passed++;
    } else {
      console.log('❌ Test 10: Retryable classification incorrect');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 10: Error:', error);
    failed++;
  }

  // Test 11: Reauth requirement classification
  try {
    const needsReauth = requiresReauth('TOKEN_EXPIRED');
    const noReauth = requiresReauth('VALIDATION_ERROR');

    if (needsReauth && !noReauth) {
      console.log('✅ Test 11: Reauth requirement classification works');
      passed++;
    } else {
      console.log('❌ Test 11: Reauth classification incorrect');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 11: Error:', error);
    failed++;
  }

  // Test 12: HTTP status to error code mapping
  try {
    const auth401 = classifyEbayError('0', 401);
    const rateLimit429 = classifyEbayError('0', 429);
    const serverError500 = classifyEbayError('0', 500);

    if (
      auth401 === 'TOKEN_EXPIRED' &&
      rateLimit429 === 'RATE_LIMITED' &&
      serverError500 === 'EBAY_API_ERROR'
    ) {
      console.log('✅ Test 12: HTTP status to error code mapping');
      passed++;
    } else {
      console.log('❌ Test 12: Status mapping incorrect');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 12: Error:', error);
    failed++;
  }

  // ==========================================================================
  // COMPS QUERY VALIDATION TESTS
  // ==========================================================================

  console.log('\n--- Comps Query Validation Tests ---\n');

  // Test 13: Valid comps query
  try {
    const query = EbayCompsQuerySchema.parse({
      keywords: 'nike air max 90',
      category_id: '15709',
      condition: 'GOOD',
      limit: 25,
    });

    if (query.keywords && query.limit === 25) {
      console.log('✅ Test 13: Valid comps query parses correctly');
      passed++;
    } else {
      console.log('❌ Test 13: Query parsing failed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 13: Error:', error);
    failed++;
  }

  // Test 14: Keywords too long rejected
  try {
    EbayCompsQuerySchema.parse({
      keywords: 'a'.repeat(400), // Max is 350
    });

    console.log('❌ Test 14: Should reject keywords > 350 chars');
    failed++;
  } catch (error) {
    console.log('✅ Test 14: Keywords > 350 chars correctly rejected');
    passed++;
  }

  // Test 15: Invalid condition rejected
  try {
    EbayCompsQuerySchema.parse({
      keywords: 'test',
      condition: 'INVALID_CONDITION',
    });

    console.log('❌ Test 15: Should reject invalid condition');
    failed++;
  } catch (error) {
    console.log('✅ Test 15: Invalid condition correctly rejected');
    passed++;
  }

  // ==========================================================================
  // PUBLISH RESULT VALIDATION TESTS
  // ==========================================================================

  console.log('\n--- Publish Result Validation Tests ---\n');

  // Test 16: Success result validation
  try {
    const result = EbayPublishResultSchema.parse({
      success: true,
      listing_id: '123456789',
      offer_id: 'offer123',
      sku: 'RSAI-12345-ABC',
      listing_url: 'https://www.ebay.com/itm/123456789',
      published_at: new Date().toISOString(),
      attempted_at: new Date().toISOString(),
    });

    if (result.success && result.listing_url) {
      console.log('✅ Test 16: Success publish result validates');
      passed++;
    } else {
      console.log('❌ Test 16: Success result validation failed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 16: Error:', error);
    failed++;
  }

  // Test 17: Error result validation
  try {
    const result = EbayPublishResultSchema.parse({
      success: false,
      error: {
        code: 'OFFER_PUBLISH_FAILED',
        message: 'Failed to publish',
      },
      attempted_at: new Date().toISOString(),
    });

    if (!result.success && result.error) {
      console.log('✅ Test 17: Error publish result validates');
      passed++;
    } else {
      console.log('❌ Test 17: Error result validation failed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 17: Error:', error);
    failed++;
  }

  // Test 18: Invalid URL rejected
  try {
    EbayPublishResultSchema.parse({
      success: true,
      listing_id: '123',
      listing_url: 'not-a-valid-url',
      attempted_at: new Date().toISOString(),
    });

    console.log('❌ Test 18: Should reject invalid listing URL');
    failed++;
  } catch (error) {
    console.log('✅ Test 18: Invalid listing URL correctly rejected');
    passed++;
  }

  // ==========================================================================
  // RATE LIMIT HANDLING TESTS
  // ==========================================================================

  console.log('\n--- Rate Limit Handling Tests ---\n');

  // Test 19: Rate limit error has retry_after
  try {
    const error = buildEbayError('RATE_LIMITED');

    if (error.recovery?.retry_after && error.recovery.retry_after > 0) {
      console.log(`✅ Test 19: Rate limit error has retry_after: ${error.recovery.retry_after}s`);
      passed++;
    } else {
      console.log('❌ Test 19: Rate limit should have retry_after');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 19: Error:', error);
    failed++;
  }

  // Test 20: Network error is retryable
  try {
    const isRetryable = isRetryableError('NETWORK_ERROR');

    if (isRetryable) {
      console.log('✅ Test 20: Network error is retryable');
      passed++;
    } else {
      console.log('❌ Test 20: Network error should be retryable');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 20: Error:', error);
    failed++;
  }

  // ==========================================================================
  // EXPRESS ERROR RESPONSE TESTS
  // ==========================================================================

  console.log('\n--- Express Error Response Tests ---\n');

  // Test 21: Create error response for Express
  try {
    const response = createErrorResponse('VALIDATION_ERROR', 'Missing field: title', {
      field: 'title',
    });

    if (
      response.error.code === 'VALIDATION_ERROR' &&
      response.error.message === 'Missing field: title' &&
      response.details?.field === 'title'
    ) {
      console.log('✅ Test 21: Express error response format correct');
      passed++;
    } else {
      console.log('❌ Test 21: Express response format incorrect');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 21: Error:', error);
    failed++;
  }

  // Test 22: Error codes are consistent
  try {
    const allCodes = Object.keys(EBAY_ERROR_CODES);
    const allValues = Object.values(EBAY_ERROR_CODES);

    // Keys should equal values (e.g., AUTH_REQUIRED: 'AUTH_REQUIRED')
    const consistent = allCodes.every((key, i) => key === allValues[i]);

    if (consistent) {
      console.log('✅ Test 22: Error code keys match values');
      passed++;
    } else {
      console.log('❌ Test 22: Error code keys/values mismatch');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 22: Error:', error);
    failed++;
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  console.log('\n═══════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
