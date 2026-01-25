/**
 * OpenRouter Handshake Test
 * 
 * Verifies:
 * 1. API key is valid
 * 2. Can call text model with test prompt
 * 3. Can call vision model with test image
 */

import { generateText, analyzeImage, testConnection, testVision } from '../../services/openrouter.js';
import { env } from '../../config/env.js';

// A small test image (public domain)
const TEST_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/300px-PNG_transparency_demonstration_1.png';

async function runOpenRouterTests(): Promise<boolean> {
  console.log('\n🧪 Running OpenRouter Handshake Tests...\n');
  
  let allPassed = true;
  
  // Test 1: API Key validation (simple text generation)
  console.log('Test 1: OpenRouter Connection & API Key');
  console.log(`   Using text model: ${env.OPENROUTER_TEXT_MODEL}`);
  const connected = await testConnection();
  if (!connected) {
    console.log('❌ FAILED: Could not connect to OpenRouter\n');
    console.log('   Check that your OPENROUTER_API_KEY is correct');
    console.log('   Get a key at: https://openrouter.ai/keys\n');
    allPassed = false;
  } else {
    console.log('✅ PASSED: OpenRouter text model works\n');
  }
  
  // Test 2: Text generation quality
  console.log('Test 2: Text Generation');
  try {
    const response = await generateText(
      'Generate a one-sentence product title for: "Blue Nike running shoes size 10"',
      'You are a product listing assistant. Generate concise, SEO-friendly titles.'
    );
    
    if (response && response.length > 10) {
      console.log(`   Generated: "${response}"`);
      console.log('✅ PASSED: Text generation works\n');
    } else {
      console.log(`   Response too short: "${response}"`);
      console.log('⚠️  WARNING: Text generation returned short response\n');
    }
  } catch (err) {
    console.log(`❌ FAILED: Text generation error - ${err}\n`);
    allPassed = false;
  }
  
  // Test 3: Vision model
  console.log('Test 3: Vision Model');
  console.log(`   Using vision model: ${env.OPENROUTER_VISION_MODEL}`);
  console.log(`   Test image: ${TEST_IMAGE_URL.substring(0, 50)}...`);
  try {
    const visionPassed = await testVision(TEST_IMAGE_URL);
    if (!visionPassed) {
      console.log('⚠️  WARNING: Vision model returned empty response\n');
    } else {
      console.log('✅ PASSED: Vision model works\n');
    }
  } catch (err) {
    console.log(`❌ FAILED: Vision test error - ${err}\n`);
    allPassed = false;
  }
  
  // Test 4: Vision with structured prompt (like we'll use for items)
  console.log('Test 4: Structured Vision Analysis');
  try {
    const structuredPrompt = `Analyze this image and respond with JSON:
{
  "detected_items": ["list of items you see"],
  "primary_colors": ["main colors"],
  "confidence": 0.0 to 1.0
}`;
    
    const response = await analyzeImage(
      TEST_IMAGE_URL,
      structuredPrompt,
      'You are an image analyzer. Always respond with valid JSON only, no markdown.'
    );
    
    console.log(`   Response: ${response.substring(0, 150)}...`);
    
    // Try to parse as JSON
    try {
      JSON.parse(response);
      console.log('✅ PASSED: Structured vision response is valid JSON\n');
    } catch {
      console.log('⚠️  WARNING: Response is not valid JSON (may need prompt tuning)\n');
    }
  } catch (err) {
    console.log(`❌ FAILED: Structured vision error - ${err}\n`);
    allPassed = false;
  }
  
  // Summary
  console.log('═'.repeat(50));
  if (allPassed) {
    console.log('✅ All OpenRouter tests passed!');
  } else {
    console.log('❌ Some OpenRouter tests failed. Check configuration.');
  }
  console.log('═'.repeat(50));
  
  return allPassed;
}

// Run if executed directly
runOpenRouterTests()
  .then((passed) => process.exit(passed ? 0 : 1))
  .catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
  });

export { runOpenRouterTests };
