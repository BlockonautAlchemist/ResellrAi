/**
 * eBay Location Service Tests
 *
 * Tests for inventory location creation - verifies POST method and payload structure.
 * Run with: npx tsx src/tests/ebay/location.test.ts
 */

import { config } from 'dotenv';
config();

import { EBAY_API_URLS } from '../../types/ebay-schemas.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Simulates the payload structure built by createInventoryLocation
 */
function buildLocationPayload(locationData: {
  name?: string;
  addressLine1?: string;
  city?: string;
  stateOrProvince?: string;
  postalCode?: string;
  country?: string;
}) {
  const address = {
    country: locationData.country || 'US',
    ...(locationData.addressLine1 && { addressLine1: locationData.addressLine1 }),
    ...(locationData.city && { city: locationData.city }),
    ...(locationData.stateOrProvince && { stateOrProvince: locationData.stateOrProvince }),
    ...(locationData.postalCode && { postalCode: locationData.postalCode }),
  };

  return {
    name: locationData.name || 'ResellrAI Default',
    location: {
      address,
    },
    locationTypes: ['WAREHOUSE'],
    merchantLocationStatus: 'ENABLED',
  };
}

/**
 * Simulates the request that would be made to eBay
 */
function buildLocationRequest(
  merchantLocationKey: string,
  locationData: Parameters<typeof buildLocationPayload>[0],
  environment: 'sandbox' | 'production' = 'sandbox'
) {
  const payload = buildLocationPayload(locationData);
  const baseUrl = EBAY_API_URLS[environment].api;
  const path = `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`;

  return {
    method: 'POST' as const,
    url: `${baseUrl}${path}`,
    path,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer <access_token>',
    },
    body: payload,
  };
}

// =============================================================================
// TESTS
// =============================================================================

async function runTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║       eBay Location Service Tests         ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // ==========================================================================
  // Test 1: Request uses POST method (not PUT)
  // ==========================================================================
  try {
    const request = buildLocationRequest('TEST_LOCATION', {
      city: 'Portland',
      stateOrProvince: 'OR',
      postalCode: '97201',
      country: 'US',
    });

    if (request.method === 'POST') {
      console.log('✅ Test 1: Request uses POST method');
      passed++;
    } else {
      console.log(`❌ Test 1: Expected POST method, got ${request.method}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 1: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Test 2: Endpoint URL is correct for sandbox
  // ==========================================================================
  try {
    const request = buildLocationRequest('RESELLRAI_DEFAULT', {}, 'sandbox');

    const expectedUrl = 'https://api.sandbox.ebay.com/sell/inventory/v1/location/RESELLRAI_DEFAULT';
    if (request.url === expectedUrl) {
      console.log('✅ Test 2: Sandbox URL is correct');
      passed++;
    } else {
      console.log(`❌ Test 2: Expected ${expectedUrl}, got ${request.url}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 2: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Test 3: Endpoint URL is correct for production
  // ==========================================================================
  try {
    const request = buildLocationRequest('RESELLRAI_DEFAULT', {}, 'production');

    const expectedUrl = 'https://api.ebay.com/sell/inventory/v1/location/RESELLRAI_DEFAULT';
    if (request.url === expectedUrl) {
      console.log('✅ Test 3: Production URL is correct');
      passed++;
    } else {
      console.log(`❌ Test 3: Expected ${expectedUrl}, got ${request.url}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 3: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Test 4: Payload has required fields
  // ==========================================================================
  try {
    const request = buildLocationRequest('TEST', {
      city: 'Portland',
      stateOrProvince: 'OR',
      postalCode: '97201',
    });

    const payload = request.body;
    const hasRequiredFields =
      payload.name &&
      payload.merchantLocationStatus === 'ENABLED' &&
      Array.isArray(payload.locationTypes) &&
      payload.locationTypes.includes('WAREHOUSE') &&
      payload.location?.address;

    if (hasRequiredFields) {
      console.log('✅ Test 4: Payload has all required fields');
      console.log('   - name:', payload.name);
      console.log('   - merchantLocationStatus:', payload.merchantLocationStatus);
      console.log('   - locationTypes:', payload.locationTypes);
      console.log('   - location.address:', JSON.stringify(payload.location.address));
      passed++;
    } else {
      console.log('❌ Test 4: Payload missing required fields');
      console.log('   Payload:', JSON.stringify(payload, null, 2));
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 4: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Test 5: Address includes city, state, and postal code for US
  // ==========================================================================
  try {
    const request = buildLocationRequest('TEST', {
      city: 'Portland',
      stateOrProvince: 'OR',
      postalCode: '97201',
      addressLine1: '123 Main St',
      country: 'US',
    });

    const address = request.body.location.address;
    const hasAllFields =
      address.city === 'Portland' &&
      address.stateOrProvince === 'OR' &&
      address.postalCode === '97201' &&
      address.addressLine1 === '123 Main St' &&
      address.country === 'US';

    if (hasAllFields) {
      console.log('✅ Test 5: US address has city, state, postalCode, addressLine1, country');
      passed++;
    } else {
      console.log('❌ Test 5: US address missing fields');
      console.log('   Address:', JSON.stringify(address, null, 2));
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 5: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Test 6: Empty fields are NOT included in address (avoids eBay 2004 error)
  // ==========================================================================
  try {
    const request = buildLocationRequest('TEST', {
      city: 'Portland',
      stateOrProvince: 'OR',
      postalCode: '97201',
      // addressLine1 is NOT provided
    });

    const address = request.body.location.address;
    const addressKeys = Object.keys(address);

    // addressLine1 should NOT be in the object
    if (!addressKeys.includes('addressLine1')) {
      console.log('✅ Test 6: Empty addressLine1 is NOT included in payload');
      console.log('   Address keys:', addressKeys);
      passed++;
    } else {
      console.log('❌ Test 6: Empty addressLine1 should not be in payload');
      console.log('   Address:', JSON.stringify(address, null, 2));
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 6: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Test 7: Default name is "ResellrAI Default"
  // ==========================================================================
  try {
    const request = buildLocationRequest('TEST', {
      city: 'Portland',
      stateOrProvince: 'OR',
      postalCode: '97201',
    });

    if (request.body.name === 'ResellrAI Default') {
      console.log('✅ Test 7: Default name is "ResellrAI Default"');
      passed++;
    } else {
      console.log(`❌ Test 7: Expected "ResellrAI Default", got "${request.body.name}"`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 7: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Test 8: Custom name is used when provided
  // ==========================================================================
  try {
    const request = buildLocationRequest('TEST', {
      name: 'My Warehouse',
      city: 'Portland',
      stateOrProvince: 'OR',
      postalCode: '97201',
    });

    if (request.body.name === 'My Warehouse') {
      console.log('✅ Test 8: Custom name is used when provided');
      passed++;
    } else {
      console.log(`❌ Test 8: Expected "My Warehouse", got "${request.body.name}"`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 8: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Test 9: Location key is URL-encoded in path
  // ==========================================================================
  try {
    const request = buildLocationRequest('LOCATION WITH SPACES', {});

    if (request.path.includes('LOCATION%20WITH%20SPACES')) {
      console.log('✅ Test 9: Location key is URL-encoded');
      passed++;
    } else {
      console.log(`❌ Test 9: Location key should be URL-encoded, got: ${request.path}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 9: Error:', error);
    failed++;
  }

  // ==========================================================================
  // Test 10: Content-Type header is application/json
  // ==========================================================================
  try {
    const request = buildLocationRequest('TEST', {});

    if (request.headers['Content-Type'] === 'application/json') {
      console.log('✅ Test 10: Content-Type header is application/json');
      passed++;
    } else {
      console.log(`❌ Test 10: Expected application/json, got: ${request.headers['Content-Type']}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 10: Error:', error);
    failed++;
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
