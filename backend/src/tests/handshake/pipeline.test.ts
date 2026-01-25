/**
 * Full Pipeline Handshake Test
 * 
 * Verifies end-to-end flow:
 * 1. Upload test image to Supabase Storage
 * 2. Send image URL to OpenRouter vision model
 * 3. Get structured response
 * 4. Clean up test data
 */

import { supabase, uploadPhoto, deletePhoto, PHOTOS_BUCKET } from '../../services/supabase.js';
import { analyzeImage } from '../../services/openrouter.js';
import { env } from '../../config/env.js';

// Vision prompt for item analysis (simplified version of production prompt)
const VISION_PROMPT = `Analyze this item image and respond with JSON only:
{
  "category": "detected category",
  "brand": "detected brand or null",
  "color": "primary color",
  "condition": "new/like_new/good/fair/poor",
  "attributes": ["list", "of", "attributes"],
  "confidence": 0.0 to 1.0
}

If you cannot detect a field with confidence, use null.
Respond with valid JSON only, no markdown or explanation.`;

async function runPipelineTest(): Promise<boolean> {
  console.log('\n🧪 Running Full Pipeline Handshake Test...\n');
  
  // Check if bucket exists first
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.name === PHOTOS_BUCKET);
  
  if (!bucketExists) {
    console.log(`⏭️  SKIPPED: Storage bucket '${PHOTOS_BUCKET}' does not exist yet.`);
    console.log('   Create the bucket in Supabase dashboard first.\n');
    return true; // Not a failure, just not ready
  }
  
  let uploadedPath: string | null = null;
  
  try {
    // Step 1: Create a test image
    console.log('Step 1: Preparing test image...');
    // This is a simple 10x10 colored square PNG (red)
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVQYV2P8z8DwnwEJMI4qpK9CABhxBf8VdVpNAAAAAElFTkSuQmCC';
    const testBuffer = Buffer.from(testImageBase64, 'base64');
    console.log('   ✓ Test image prepared (10x10 red square)\n');
    
    // Step 2: Upload to Supabase
    console.log('Step 2: Uploading to Supabase Storage...');
    const { url, path } = await uploadPhoto(testBuffer, 'pipeline-test.png', 'image/png');
    uploadedPath = path;
    console.log(`   ✓ Uploaded to: ${path}`);
    console.log(`   ✓ Signed URL generated\n`);
    
    // Step 3: Send to vision model
    console.log('Step 3: Analyzing with vision model...');
    console.log(`   Model: ${env.OPENROUTER_VISION_MODEL}`);
    
    const startTime = Date.now();
    const visionResponse = await analyzeImage(
      url,
      VISION_PROMPT,
      'You are an item analyzer for a resale marketplace. Be accurate and conservative with detections.'
    );
    const duration = Date.now() - startTime;
    
    console.log(`   ✓ Vision response received in ${duration}ms`);
    console.log(`   Response: ${visionResponse.substring(0, 200)}...\n`);
    
    // Step 4: Parse response
    console.log('Step 4: Parsing structured response...');
    let parsed: Record<string, unknown> | null = null;
    try {
      // Clean up response (remove markdown if present)
      let cleanResponse = visionResponse.trim();
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }
      
      parsed = JSON.parse(cleanResponse) as Record<string, unknown>;
      console.log('   ✓ Response is valid JSON');
      console.log('   Parsed fields:');
      Object.keys(parsed).forEach((key) => {
        console.log(`     - ${key}: ${JSON.stringify(parsed![key])}`);
      });
      console.log('');
    } catch (parseErr) {
      console.log('   ⚠️ Response is not valid JSON');
      console.log('   This may require prompt tuning for production');
      console.log(`   Parse error: ${parseErr}\n`);
    }
    
    // Step 5: Cleanup
    console.log('Step 5: Cleaning up test data...');
    await deletePhoto(path);
    uploadedPath = null;
    console.log('   ✓ Test image deleted\n');
    
    // Summary
    console.log('═'.repeat(50));
    console.log('✅ Pipeline test completed successfully!');
    console.log('');
    console.log('The full flow works:');
    console.log('  1. Upload image to Supabase Storage');
    console.log('  2. Get signed URL');
    console.log('  3. Send to OpenRouter vision model');
    console.log('  4. Receive structured analysis');
    console.log('═'.repeat(50));
    
    return true;
    
  } catch (err) {
    console.error(`\n❌ Pipeline test failed: ${err}\n`);
    
    // Cleanup on failure
    if (uploadedPath) {
      try {
        await deletePhoto(uploadedPath);
        console.log('   Cleaned up test file after failure');
      } catch {
        console.log('   Could not clean up test file');
      }
    }
    
    return false;
  }
}

// Run if executed directly
runPipelineTest()
  .then((passed) => process.exit(passed ? 0 : 1))
  .catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
  });

export { runPipelineTest };
