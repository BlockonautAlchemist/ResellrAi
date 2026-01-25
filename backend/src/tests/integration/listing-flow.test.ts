/**
 * Integration Test: Full Listing Generation Flow
 * 
 * Tests the complete flow from photo to listing:
 * 1. Upload photos
 * 2. Analyze with vision
 * 3. Generate listing content
 * 4. Get pricing estimate
 * 5. Format for platform
 * 
 * Prerequisites:
 * - Database table created (run db/schema.sql in Supabase)
 * - Backend server NOT running (test runs services directly)
 */

import { v4 as uuidv4 } from 'uuid';
import { uploadPhoto, deletePhoto } from '../../services/supabase.js';
import { analyzeItem } from '../../services/vision.js';
import { generateListing } from '../../services/listing-generator.js';
import { estimatePrice } from '../../services/pricing.js';
import { formatForPlatform } from '../../services/platform-formatter.js';
import type { ItemInput, Platform } from '../../types/schemas.js';

// A simple test image (1x1 red pixel PNG)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

async function runIntegrationTest(): Promise<void> {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║     ResellrAI Integration Test: Full Listing Flow     ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  const itemId = uuidv4();
  const platform: Platform = 'ebay';
  const startTime = Date.now();
  let uploadedPath: string | null = null;

  try {
    // Step 1: Upload test photo
    console.log('Step 1: Uploading test photo...');
    const buffer = Buffer.from(TEST_IMAGE_BASE64, 'base64');
    const { url, path } = await uploadPhoto(buffer, `test-${itemId}.png`, 'image/png');
    uploadedPath = path;
    console.log(`   ✓ Photo uploaded: ${path}`);
    console.log(`   ✓ Signed URL obtained\n`);

    // Step 2: Create ItemInput
    console.log('Step 2: Creating ItemInput...');
    const itemInput: ItemInput = {
      id: itemId,
      photos: [url],
      userHints: {
        brand: 'Test Brand',
        category: 'Test Category',
      },
      createdAt: new Date().toISOString(),
    };
    console.log(`   ✓ ItemInput created with ID: ${itemId}\n`);

    // Step 3: Analyze with vision
    console.log('Step 3: Analyzing with VisionService...');
    const visionStart = Date.now();
    const visionOutput = await analyzeItem(itemInput);
    const visionTime = Date.now() - visionStart;
    console.log(`   ✓ Vision analysis complete in ${visionTime}ms`);
    console.log(`   Category: ${visionOutput.detectedCategory.value} (${Math.round(visionOutput.detectedCategory.confidence * 100)}%)`);
    console.log(`   Color: ${visionOutput.detectedColor.value}`);
    console.log(`   Attributes: ${visionOutput.detectedAttributes.length} detected\n`);

    // Step 4: Generate listing
    console.log('Step 4: Generating listing with ListingGeneratorService...');
    const listingStart = Date.now();
    const listingDraft = await generateListing(visionOutput);
    const listingTime = Date.now() - listingStart;
    console.log(`   ✓ Listing generated in ${listingTime}ms`);
    console.log(`   Title: ${listingDraft.title.value.substring(0, 50)}...`);
    console.log(`   Description: ${listingDraft.description.value.substring(0, 50)}...\n`);

    // Step 5: Estimate price
    console.log('Step 5: Estimating price with PricingService...');
    const pricingStart = Date.now();
    const pricing = await estimatePrice(visionOutput, listingDraft);
    const pricingTime = Date.now() - pricingStart;
    console.log(`   ✓ Price estimated in ${pricingTime}ms`);
    console.log(`   Range: $${pricing.lowPrice} - $${pricing.midPrice} - $${pricing.highPrice}`);
    console.log(`   Confidence: ${Math.round(pricing.confidence * 100)}%\n`);

    // Step 6: Format for platform
    console.log(`Step 6: Formatting for ${platform} with PlatformFormatterService...`);
    const formatStart = Date.now();
    const platformVariant = formatForPlatform(listingDraft, platform);
    const formatTime = Date.now() - formatStart;
    console.log(`   ✓ Formatted in ${formatTime}ms`);
    console.log(`   Title valid: ${platformVariant.title.valid}`);
    console.log(`   Format: ${platformVariant.description.format}`);
    console.log(`   Category ID: ${platformVariant.categoryId}\n`);

    // Cleanup
    console.log('Step 7: Cleaning up...');
    await deletePhoto(uploadedPath);
    uploadedPath = null;
    console.log('   ✓ Test photo deleted\n');

    // Summary
    const totalTime = Date.now() - startTime;
    console.log('═'.repeat(55));
    console.log('✅ INTEGRATION TEST PASSED');
    console.log('');
    console.log('Timing Summary:');
    console.log(`   Vision Analysis:    ${visionTime}ms`);
    console.log(`   Listing Generation: ${listingTime}ms`);
    console.log(`   Price Estimation:   ${pricingTime}ms`);
    console.log(`   Platform Formatting: ${formatTime}ms`);
    console.log(`   ────────────────────────────`);
    console.log(`   Total Time:         ${totalTime}ms`);
    console.log('');
    
    if (totalTime < 60000) {
      console.log(`✅ Under 60-second target (${Math.round(totalTime / 1000)}s)`);
    } else {
      console.log(`⚠️  Exceeded 60-second target (${Math.round(totalTime / 1000)}s)`);
    }
    console.log('═'.repeat(55));

  } catch (error) {
    console.error('\n❌ INTEGRATION TEST FAILED');
    console.error('Error:', error);

    // Cleanup on failure
    if (uploadedPath) {
      try {
        await deletePhoto(uploadedPath);
        console.log('   Cleaned up test photo after failure');
      } catch {
        console.log('   Could not clean up test photo');
      }
    }

    process.exit(1);
  }
}

// Run if executed directly
runIntegrationTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
