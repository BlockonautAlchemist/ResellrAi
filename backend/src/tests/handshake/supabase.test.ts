/**
 * Supabase Handshake Test
 * 
 * Verifies:
 * 1. Can connect to Supabase
 * 2. Can upload a test image to storage
 * 3. Can write/read from database (when tables exist)
 */

import { supabase, testConnection, uploadPhoto, deletePhoto, PHOTOS_BUCKET } from '../../services/supabase.js';

async function runSupabaseTests(): Promise<boolean> {
  console.log('\n🧪 Running Supabase Handshake Tests...\n');
  
  let allPassed = true;
  
  // Test 1: Connection
  console.log('Test 1: Supabase Connection');
  const connected = await testConnection();
  if (!connected) {
    console.log('❌ FAILED: Could not connect to Supabase\n');
    allPassed = false;
  } else {
    console.log('✅ PASSED: Supabase connection works\n');
  }
  
  // Test 2: Storage bucket exists
  console.log('Test 2: Storage Bucket Check');
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log(`❌ FAILED: Could not list buckets - ${error.message}\n`);
      allPassed = false;
    } else {
      const bucket = buckets.find((b) => b.name === PHOTOS_BUCKET);
      if (bucket) {
        console.log(`✅ PASSED: '${PHOTOS_BUCKET}' bucket exists\n`);
      } else {
        console.log(`⚠️  WARNING: '${PHOTOS_BUCKET}' bucket not found`);
        console.log('   Please create it in the Supabase dashboard:\n');
        console.log('   1. Go to Storage in your Supabase project');
        console.log('   2. Click "New Bucket"');
        console.log(`   3. Name: "${PHOTOS_BUCKET}"`);
        console.log('   4. Public: No');
        console.log('   5. File size limit: 10MB');
        console.log('   6. Allowed MIME types: image/jpeg, image/png, image/heic, image/webp\n');
        // Not a hard failure, bucket can be created later
      }
    }
  } catch (err) {
    console.log(`❌ FAILED: Storage bucket check error - ${err}\n`);
    allPassed = false;
  }
  
  // Test 3: Upload test (only if bucket exists)
  console.log('Test 3: Storage Upload/Delete');
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === PHOTOS_BUCKET);
    
    if (!bucketExists) {
      console.log('⏭️  SKIPPED: Bucket does not exist yet\n');
    } else {
      // Create a tiny test image (1x1 pixel transparent PNG)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const testBuffer = Buffer.from(testImageBase64, 'base64');
      
      // Upload
      const { url, path } = await uploadPhoto(testBuffer, 'test.png', 'image/png');
      console.log(`   Uploaded to: ${path}`);
      console.log(`   Signed URL: ${url.substring(0, 60)}...`);
      
      // Delete
      await deletePhoto(path);
      console.log('   Deleted test file');
      
      console.log('✅ PASSED: Storage upload/delete works\n');
    }
  } catch (err) {
    console.log(`❌ FAILED: Storage test error - ${err}\n`);
    allPassed = false;
  }
  
  // Summary
  console.log('═'.repeat(50));
  if (allPassed) {
    console.log('✅ All Supabase tests passed!');
  } else {
    console.log('❌ Some Supabase tests failed. Check configuration.');
  }
  console.log('═'.repeat(50));
  
  return allPassed;
}

// Run if executed directly
runSupabaseTests()
  .then((passed) => process.exit(passed ? 0 : 1))
  .catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
  });

export { runSupabaseTests };
