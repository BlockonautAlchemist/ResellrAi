/**
 * eBay Comps Service Tests
 *
 * Tests for pricing comparables calculation and statistics.
 * Run with: npx tsx src/tests/ebay/comps.test.ts
 */

import { config } from 'dotenv';
config();

import {
  calculateMedian,
  calculateAverage,
  getCompsConfidence,
  getCompsSourceMessage,
  EbayCompsQuerySchema,
} from '../../types/ebay-schemas.js';

async function runTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║        eBay Comps Service Tests           ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // ==========================================================================
  // Statistics Calculation Tests
  // ==========================================================================

  // Test 1: Calculate median - odd number of items
  try {
    const values = [10, 20, 30, 40, 50];
    const median = calculateMedian(values);

    if (median === 30) {
      console.log('✅ Test 1: Median calculation (odd count)');
      passed++;
    } else {
      console.log(`❌ Test 1: Expected median 30, got ${median}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 1: Error:', error);
    failed++;
  }

  // Test 2: Calculate median - even number of items
  try {
    const values = [10, 20, 30, 40];
    const median = calculateMedian(values);

    if (median === 25) {
      console.log('✅ Test 2: Median calculation (even count)');
      passed++;
    } else {
      console.log(`❌ Test 2: Expected median 25, got ${median}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 2: Error:', error);
    failed++;
  }

  // Test 3: Calculate median - empty array
  try {
    const values: number[] = [];
    const median = calculateMedian(values);

    if (median === null) {
      console.log('✅ Test 3: Median of empty array returns null');
      passed++;
    } else {
      console.log(`❌ Test 3: Expected null, got ${median}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 3: Error:', error);
    failed++;
  }

  // Test 4: Calculate average
  try {
    const values = [10, 20, 30, 40, 50];
    const avg = calculateAverage(values);

    if (avg === 30) {
      console.log('✅ Test 4: Average calculation');
      passed++;
    } else {
      console.log(`❌ Test 4: Expected average 30, got ${avg}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 4: Error:', error);
    failed++;
  }

  // Test 5: Calculate average - empty array
  try {
    const values: number[] = [];
    const avg = calculateAverage(values);

    if (avg === null) {
      console.log('✅ Test 5: Average of empty array returns null');
      passed++;
    } else {
      console.log(`❌ Test 5: Expected null, got ${avg}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 5: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Confidence Level Tests
  // ==========================================================================

  // Test 6: High confidence (10+ sold items)
  try {
    const confidence = getCompsConfidence(15, 'sold');

    if (confidence === 'high') {
      console.log('✅ Test 6: High confidence for 15 sold items');
      passed++;
    } else {
      console.log(`❌ Test 6: Expected 'high', got '${confidence}'`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 6: Error:', error);
    failed++;
  }

  // Test 7: Medium confidence (5-9 items)
  try {
    const confidence = getCompsConfidence(7, 'sold');

    if (confidence === 'medium') {
      console.log('✅ Test 7: Medium confidence for 7 sold items');
      passed++;
    } else {
      console.log(`❌ Test 7: Expected 'medium', got '${confidence}'`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 7: Error:', error);
    failed++;
  }

  // Test 8: Low confidence (1-4 items)
  try {
    const confidence = getCompsConfidence(3, 'sold');

    if (confidence === 'low') {
      console.log('✅ Test 8: Low confidence for 3 sold items');
      passed++;
    } else {
      console.log(`❌ Test 8: Expected 'low', got '${confidence}'`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 8: Error:', error);
    failed++;
  }

  // Test 9: Active listings always medium confidence
  try {
    const confidence = getCompsConfidence(20, 'active');

    if (confidence === 'medium') {
      console.log('✅ Test 9: Active listings always medium confidence');
      passed++;
    } else {
      console.log(`❌ Test 9: Expected 'medium', got '${confidence}'`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 9: Error:', error);
    failed++;
  }

  // Test 10: No data means no confidence
  try {
    const confidence = getCompsConfidence(0, 'none');

    if (confidence === 'none') {
      console.log('✅ Test 10: No confidence for empty results');
      passed++;
    } else {
      console.log(`❌ Test 10: Expected 'none', got '${confidence}'`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 10: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Source Message Tests
  // ==========================================================================

  // Test 11: Sold source message
  try {
    const message = getCompsSourceMessage('sold', 15);

    if (message.includes('15') && message.includes('sold')) {
      console.log('✅ Test 11: Sold source message format');
      passed++;
    } else {
      console.log(`❌ Test 11: Unexpected message: ${message}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 11: Error:', error);
    failed++;
  }

  // Test 12: Active source message
  try {
    const message = getCompsSourceMessage('active', 10);

    if (message.includes('10') && message.includes('active')) {
      console.log('✅ Test 12: Active source message format');
      passed++;
    } else {
      console.log(`❌ Test 12: Unexpected message: ${message}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 12: Error:', error);
    failed++;
  }

  // Test 13: None source message
  try {
    const message = getCompsSourceMessage('none', 0);

    if (message.includes('No comparable')) {
      console.log('✅ Test 13: None source message format');
      passed++;
    } else {
      console.log(`❌ Test 13: Unexpected message: ${message}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 13: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Query Validation Tests
  // ==========================================================================

  // Test 14: Valid query passes validation
  try {
    const query = EbayCompsQuerySchema.parse({
      keywords: 'nike air max',
      limit: 20,
      marketplace_id: 'EBAY_US',
    });

    if (query.keywords === 'nike air max') {
      console.log('✅ Test 14: Valid query passes validation');
      passed++;
    } else {
      console.log('❌ Test 14: Query parsing failed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 14: Error:', error);
    failed++;
  }

  // Test 15: Empty keywords fails validation
  try {
    EbayCompsQuerySchema.parse({
      keywords: '',
      marketplace_id: 'EBAY_US',
    });

    console.log('❌ Test 15: Empty keywords should have failed');
    failed++;
  } catch (error) {
    console.log('✅ Test 15: Empty keywords correctly rejected');
    passed++;
  }

  // Test 16: Limit is constrained
  try {
    const query = EbayCompsQuerySchema.parse({
      keywords: 'test',
      limit: 100, // Over max of 50
    });

    // Should fail because limit > 50
    console.log('❌ Test 16: Limit over 50 should have failed');
    failed++;
  } catch (error) {
    console.log('✅ Test 16: Limit over 50 correctly rejected');
    passed++;
  }

  // ==========================================================================
  // Summary
  // ==========================================================================

  console.log('\n═══════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
