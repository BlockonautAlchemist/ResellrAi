/**
 * eBay Auth Service Tests
 *
 * Tests for OAuth URL generation and client configuration.
 * Run with: npx tsx src/tests/ebay/auth.test.ts
 */

import { config } from 'dotenv';
config();

import { getEbayClient, isEbayAvailable } from '../../services/ebay/client.js';
import { EBAY_API_URLS, EBAY_REQUIRED_SCOPES } from '../../types/ebay-schemas.js';

async function runTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║        eBay Auth Service Tests            ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Check eBay availability status
  try {
    const available = isEbayAvailable();
    console.log(`ℹ️  Test 1: eBay integration available: ${available}`);
    console.log('   (This depends on EBAY_CLIENT_ID and EBAY_CLIENT_SECRET being set)');
    passed++;
  } catch (error) {
    console.log('❌ Test 1: Error checking availability:', error);
    failed++;
  }

  // Test 2: Client instantiation
  try {
    const client = getEbayClient();
    if (client) {
      console.log('✅ Test 2: eBay client instantiated');
      passed++;
    } else {
      console.log('❌ Test 2: Client is null');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 2: Error creating client:', error);
    failed++;
  }

  // Test 3: API URLs are correct for sandbox
  try {
    const sandboxUrls = EBAY_API_URLS.sandbox;
    const productionUrls = EBAY_API_URLS.production;

    const sandboxCorrect =
      sandboxUrls.auth.includes('sandbox') &&
      sandboxUrls.api.includes('sandbox');

    const productionCorrect =
      !productionUrls.auth.includes('sandbox') &&
      !productionUrls.api.includes('sandbox');

    if (sandboxCorrect && productionCorrect) {
      console.log('✅ Test 3: API URLs correctly differentiate sandbox/production');
      passed++;
    } else {
      console.log('❌ Test 3: API URLs not correctly configured');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 3: Error:', error);
    failed++;
  }

  // Test 4: Required scopes are defined
  try {
    if (
      EBAY_REQUIRED_SCOPES.length >= 4 &&
      EBAY_REQUIRED_SCOPES.some((s) => s.includes('sell.inventory')) &&
      EBAY_REQUIRED_SCOPES.some((s) => s.includes('sell.account'))
    ) {
      console.log('✅ Test 4: Required OAuth scopes defined');
      console.log(`   Scopes: ${EBAY_REQUIRED_SCOPES.length} scopes configured`);
      passed++;
    } else {
      console.log('❌ Test 4: Missing required OAuth scopes');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 4: Error:', error);
    failed++;
  }

  // Test 5: Client methods exist
  try {
    const client = getEbayClient();
    const methods = [
      'isConfigured',
      'getAuthUrl',
      'getTokenUrl',
      'getApiBaseUrl',
      'getBasicAuthHeader',
      'exchangeCodeForTokens',
      'refreshAccessToken',
      'authenticatedRequest',
      'request',
    ];

    const missing = methods.filter(
      (m) => typeof (client as unknown as Record<string, unknown>)[m] !== 'function'
    );

    if (missing.length === 0) {
      console.log('✅ Test 5: All required client methods exist');
      passed++;
    } else {
      console.log(`❌ Test 5: Missing methods: ${missing.join(', ')}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 5: Error:', error);
    failed++;
  }

  // Test 6: Auth URL format (if configured)
  try {
    const client = getEbayClient();
    const authUrl = client.getAuthUrl();

    if (authUrl.startsWith('https://') && authUrl.includes('ebay.com')) {
      console.log('✅ Test 6: Auth URL format is correct');
      console.log(`   URL: ${authUrl}`);
      passed++;
    } else {
      console.log('❌ Test 6: Auth URL format incorrect:', authUrl);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 6: Error:', error);
    failed++;
  }

  // Test 7: Basic auth header format (if configured)
  try {
    const client = getEbayClient();

    if (!client.isConfigured()) {
      console.log('⚠️  Test 7: Skipped - eBay credentials not configured');
      passed++; // Skip is OK
    } else {
      const basicAuth = client.getBasicAuthHeader();

      if (basicAuth.startsWith('Basic ')) {
        console.log('✅ Test 7: Basic auth header format correct');
        passed++;
      } else {
        console.log('❌ Test 7: Basic auth header format incorrect');
        failed++;
      }
    }
  } catch (error) {
    console.log('❌ Test 7: Error:', error);
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
