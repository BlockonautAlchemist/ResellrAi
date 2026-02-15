/**
 * Vision merge tests
 *
 * Run with: npx tsx src/tests/vision/merge.test.ts
 */

import assert from 'node:assert/strict';
import { mergeVisionOutputs, runWithConcurrencyLimit } from '../../services/vision.js';
import type { VisionOutput } from '../../types/schemas.js';

function makeVisionOutput(
  itemId: string,
  overrides: Partial<VisionOutput> = {}
): VisionOutput {
  return {
    itemId,
    detectedCategory: { value: 'Shirt', confidence: 0.8 },
    detectedColor: { value: 'Blue', confidence: 0.8 },
    detectedAttributes: [],
    processingTimeMs: 100,
    ...overrides,
  };
}

async function runTests(): Promise<boolean> {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║         Vision Merge Tests                ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  const itemId = '00000000-0000-4000-8000-000000000001';

  // Test 1: consensus category beats high-confidence outlier
  try {
    const merged = mergeVisionOutputs(
      [
        makeVisionOutput(itemId, { detectedCategory: { value: 'Sneakers', confidence: 0.71 } }),
        makeVisionOutput(itemId, { detectedCategory: { value: 'Sneakers', confidence: 0.7 } }),
        makeVisionOutput(itemId, { detectedCategory: { value: 'Boots', confidence: 0.95 } }),
      ],
      itemId,
      300
    );
    assert.equal(merged.detectedCategory.value, 'Sneakers');
    console.log('✅ Test 1: Consensus category selected');
    passed++;
  } catch (error) {
    console.log('❌ Test 1:', error);
    failed++;
  }

  // Test 2: no consensus uses highest confidence
  try {
    const merged = mergeVisionOutputs(
      [
        makeVisionOutput(itemId, { detectedColor: { value: 'Green', confidence: 0.6 } }),
        makeVisionOutput(itemId, { detectedColor: { value: 'Teal', confidence: 0.65 } }),
        makeVisionOutput(itemId, { detectedColor: { value: 'Navy', confidence: 0.91 } }),
      ],
      itemId,
      300
    );
    assert.equal(merged.detectedColor.value, 'Navy');
    console.log('✅ Test 2: Highest-confidence fallback used');
    passed++;
  } catch (error) {
    console.log('❌ Test 2:', error);
    failed++;
  }

  // Test 3: brand null conflict prefers non-null consensus
  try {
    const merged = mergeVisionOutputs(
      [
        makeVisionOutput(itemId, { detectedBrand: { value: 'Nike', confidence: 0.8 } }),
        makeVisionOutput(itemId, { detectedBrand: { value: 'Nike', confidence: 0.75 } }),
        makeVisionOutput(itemId, { detectedBrand: { value: null, confidence: 0.9 } }),
      ],
      itemId,
      300
    );
    assert.equal(merged.detectedBrand?.value, 'Nike');
    console.log('✅ Test 3: Non-null brand consensus selected');
    passed++;
  } catch (error) {
    console.log('❌ Test 3:', error);
    failed++;
  }

  // Test 4: attribute conflict resolution by support
  try {
    const merged = mergeVisionOutputs(
      [
        makeVisionOutput(itemId, {
          detectedAttributes: [
            { key: 'Size', value: 'M', confidence: 0.7 },
            { key: 'Material', value: 'Cotton', confidence: 0.8 },
          ],
        }),
        makeVisionOutput(itemId, {
          detectedAttributes: [
            { key: 'Size', value: 'M', confidence: 0.9 },
            { key: 'Material', value: 'Cotton', confidence: 0.7 },
          ],
        }),
        makeVisionOutput(itemId, {
          detectedAttributes: [{ key: 'Size', value: 'L', confidence: 0.95 }],
        }),
      ],
      itemId,
      300
    );

    const size = merged.detectedAttributes.find((attr) => attr.key === 'Size');
    const material = merged.detectedAttributes.find((attr) => attr.key === 'Material');
    assert.equal(size?.value, 'M');
    assert.equal(material?.value, 'Cotton');
    console.log('✅ Test 4: Attributes merged and conflicts resolved');
    passed++;
  } catch (error) {
    console.log('❌ Test 4:', error);
    failed++;
  }

  // Test 5: raw labels deduped
  try {
    const merged = mergeVisionOutputs(
      [
        makeVisionOutput(itemId, { rawLabels: ['Sneaker', 'Shoe', 'athletic'] }),
        makeVisionOutput(itemId, { rawLabels: ['shoe', 'Running', 'Athletic'] }),
      ],
      itemId,
      200
    );
    assert.deepEqual(merged.rawLabels, ['athletic', 'Running', 'Shoe', 'Sneaker']);
    console.log('✅ Test 5: Raw labels deduped case-insensitively');
    passed++;
  } catch (error) {
    console.log('❌ Test 5:', error);
    failed++;
  }

  // Test 6: shipping estimate merged by packaging vote + medians
  try {
    const merged = mergeVisionOutputs(
      [
        makeVisionOutput(itemId, {
          shippingEstimate: {
            packagingType: 'small_box',
            itemDimensionsIn: { l: 12, w: 9, h: 4 },
            itemWeightOz: 24,
            packageDimensionsIn: { l: 13, w: 10, h: 5 },
            packageWeightOz: 28,
            confidence: 0.8,
            assumptions: ['Estimated from side angle'],
          },
        }),
        makeVisionOutput(itemId, {
          shippingEstimate: {
            packagingType: 'small_box',
            itemDimensionsIn: { l: 11.5, w: 9, h: 4.5 },
            itemWeightOz: 22,
            packageDimensionsIn: { l: 13, w: 10, h: 5 },
            packageWeightOz: 27,
            confidence: 0.75,
            assumptions: ['Assumed folded item'],
          },
        }),
        makeVisionOutput(itemId, {
          shippingEstimate: {
            packagingType: 'poly_mailer',
            itemDimensionsIn: { l: 10, w: 8, h: 2 },
            itemWeightOz: 16,
            packageDimensionsIn: { l: 11, w: 9, h: 3 },
            packageWeightOz: 20,
            confidence: 0.92,
            assumptions: ['Looks like a soft good'],
          },
        }),
      ],
      itemId,
      300
    );

    assert.equal(merged.shippingEstimate?.packagingType, 'small_box');
    assert.equal(merged.shippingEstimate?.itemWeightOz, 23);
    assert.equal(merged.shippingEstimate?.packageWeightOz, 28);
    assert.ok((merged.shippingEstimate?.assumptions.length || 0) >= 2);
    console.log('✅ Test 6: Shipping estimate merged correctly');
    passed++;
  } catch (error) {
    console.log('❌ Test 6:', error);
    failed++;
  }

  // Test 7: zero outputs returns fallback
  try {
    const merged = mergeVisionOutputs([], itemId, 150);
    assert.equal(merged.detectedCategory.value, 'Unknown');
    assert.equal(merged.detectedColor.value, 'Unknown');
    assert.equal(merged.detectedAttributes.length, 0);
    console.log('✅ Test 7: Empty merge returns fallback output');
    passed++;
  } catch (error) {
    console.log('❌ Test 7:', error);
    failed++;
  }

  // Test 8: concurrency limiter enforces cap
  try {
    let inFlight = 0;
    let maxInFlight = 0;
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return i;
    });

    const result = await runWithConcurrencyLimit(tasks, 3);
    assert.equal(result.length, 10);
    assert.ok(maxInFlight <= 3);
    console.log('✅ Test 8: Concurrency cap enforced');
    passed++;
  } catch (error) {
    console.log('❌ Test 8:', error);
    failed++;
  }

  console.log('\n' + '═'.repeat(50));
  console.log('SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('═'.repeat(50));

  return failed === 0;
}

runTests()
  .then((allPassed) => process.exit(allPassed ? 0 : 1))
  .catch((error) => {
    console.error('Vision merge test runner error:', error);
    process.exit(1);
  });
