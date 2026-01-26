/**
 * Token Encryption Tests
 *
 * Tests for AES-256-GCM encryption of OAuth tokens.
 * Run with: npx tsx src/tests/ebay/token-crypto.test.ts
 */

import { config } from 'dotenv';
config();

// Set a test encryption key if not present
if (!process.env.EBAY_TOKEN_ENCRYPTION_KEY) {
  // 64 hex characters = 32 bytes for AES-256
  process.env.EBAY_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
}

import {
  encryptToken,
  decryptToken,
  generateOAuthState,
  isEncryptionConfigured,
} from '../../services/ebay/token-crypto.js';

async function runTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║     Token Encryption Tests                ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Encryption is configured
  try {
    const configured = isEncryptionConfigured();
    if (configured) {
      console.log('✅ Test 1: Encryption is configured');
      passed++;
    } else {
      console.log('❌ Test 1: Encryption not configured');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 1: Error checking configuration:', error);
    failed++;
  }

  // Test 2: Encrypt and decrypt round trip
  try {
    const originalToken = 'test_access_token_1234567890';
    const encrypted = encryptToken(originalToken);
    const decrypted = decryptToken(encrypted);

    if (decrypted === originalToken) {
      console.log('✅ Test 2: Encrypt/decrypt round trip');
      passed++;
    } else {
      console.log('❌ Test 2: Decrypted token does not match original');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 2: Round trip failed:', error);
    failed++;
  }

  // Test 3: Different encryptions produce different ciphertexts (IV randomness)
  try {
    const token = 'same_token_value';
    const encrypted1 = encryptToken(token);
    const encrypted2 = encryptToken(token);

    if (encrypted1 !== encrypted2) {
      console.log('✅ Test 3: Same plaintext produces different ciphertexts (random IV)');
      passed++;
    } else {
      console.log('❌ Test 3: Same plaintext produced same ciphertext (IV not random)');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 3: Error:', error);
    failed++;
  }

  // Test 4: Generate OAuth state
  try {
    const state1 = generateOAuthState();
    const state2 = generateOAuthState();

    if (
      state1.length === 64 && // 32 bytes = 64 hex chars
      state2.length === 64 &&
      state1 !== state2
    ) {
      console.log('✅ Test 4: OAuth state generation (64 hex chars, unique)');
      passed++;
    } else {
      console.log('❌ Test 4: OAuth state not properly generated');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 4: Error:', error);
    failed++;
  }

  // Test 5: Encrypt long token (refresh tokens can be long)
  try {
    const longToken = 'v^1.1#i^1#r^0#f^0#I^3#p^1#t^H4sIAAAAAAAAAP' + 'x'.repeat(500);
    const encrypted = encryptToken(longToken);
    const decrypted = decryptToken(encrypted);

    if (decrypted === longToken) {
      console.log('✅ Test 5: Long token encryption');
      passed++;
    } else {
      console.log('❌ Test 5: Long token decryption failed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 5: Error:', error);
    failed++;
  }

  // Test 6: Tampered ciphertext fails decryption
  try {
    const token = 'secret_token';
    const encrypted = encryptToken(token);

    // Tamper with the ciphertext
    const tamperedBuffer = Buffer.from(encrypted, 'base64');
    tamperedBuffer[tamperedBuffer.length - 1] ^= 0xff; // Flip bits
    const tampered = tamperedBuffer.toString('base64');

    try {
      decryptToken(tampered);
      console.log('❌ Test 6: Tampered ciphertext should have failed');
      failed++;
    } catch {
      console.log('✅ Test 6: Tampered ciphertext correctly rejected');
      passed++;
    }
  } catch (error) {
    console.log('❌ Test 6: Error:', error);
    failed++;
  }

  // Summary
  console.log('\n═══════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
