/**
 * eBay Inventory Location Service
 *
 * Manages inventory locations required for publishing listings.
 * Per EBAY_SOURCE_OF_TRUTH.md Section 7:
 * "eBay requires that inventory items be assigned to an inventory location.
 *  You must create at least one Inventory Location record via the Inventory API."
 *
 * Without a merchantLocationKey in the offer, publishOffer will fail.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import { getEbayClient } from './client.js';
import { getEbayAuthService } from './auth.js';
import {
  type EbayInventoryLocationPayload,
  type EbayInventoryLocation,
  type CreateLocationRequest,
  type SaveSellerLocationRequest,
  type SellerLocationProfile,
} from '../../types/ebay-schemas.js';

// =============================================================================
// TYPES
// =============================================================================

interface LocationResult {
  success: boolean;
  location?: EbayInventoryLocation;
  error?: string;
}

interface LocationsListResult {
  success: boolean;
  locations: EbayInventoryLocation[];
  total: number;
  error?: string;
}

interface EbayLocationsApiResponse {
  locations?: Array<{
    merchantLocationKey: string;
    name?: string;
    location?: {
      address?: {
        addressLine1?: string;
        city?: string;
        stateOrProvince?: string;
        postalCode?: string;
        country?: string;
      };
    };
    locationTypes?: string[];
    merchantLocationStatus?: string;
  }>;
  total?: number;
}

interface EbaySingleLocationApiResponse {
  merchantLocationKey: string;
  name?: string;
  location?: {
    address?: {
      addressLine1?: string;
      city?: string;
      stateOrProvince?: string;
      postalCode?: string;
      country?: string;
    };
  };
  locationTypes?: string[];
  merchantLocationStatus?: string;
}

// =============================================================================
// LOCATION SERVICE
// =============================================================================

export class EbayLocationService {
  private ebayClient: ReturnType<typeof getEbayClient>;
  private authService: ReturnType<typeof getEbayAuthService>;
  private supabase: SupabaseClient;

  // Default location key format
  private readonly DEFAULT_LOCATION_KEY = 'RESELLRAI_DEFAULT';

  constructor() {
    this.ebayClient = getEbayClient();
    this.authService = getEbayAuthService();
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }

  /**
   * Get seller's saved location profile from Supabase
   */
  async getSellerProfile(userId: string): Promise<SellerLocationProfile | null> {
    try {
      const { data, error } = await this.supabase
        .from('ebay_seller_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data as SellerLocationProfile;
    } catch (error) {
      console.error('[eBay Location] Error fetching seller profile:', error);
      return null;
    }
  }

  /**
   * Save or update seller's location profile in Supabase
   */
  async saveSellerProfile(
    userId: string,
    location: SaveSellerLocationRequest
  ): Promise<{ success: boolean; profile?: SellerLocationProfile; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('ebay_seller_profiles')
        .upsert(
          {
            user_id: userId,
            country: location.country || 'US',
            postal_code: location.postal_code || null,
            city: location.city || null,
            state_or_province: location.state_or_province || null,
            address_line1: location.address_line1 || null,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        )
        .select()
        .single();

      if (error) {
        console.error('[eBay Location] Error saving seller profile:', error);
        return { success: false, error: error.message };
      }

      console.log(`[eBay Location] Saved seller profile for user ${userId}`);
      return { success: true, profile: data as SellerLocationProfile };
    } catch (error) {
      console.error('[eBay Location] Error saving seller profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get a single inventory location by key
   * Used to verify location exists and is ENABLED after creation
   */
  async getInventoryLocationByKey(
    userId: string,
    merchantLocationKey: string
  ): Promise<{ success: boolean; location?: EbayInventoryLocation; status?: number; body?: string; error?: string }> {
    try {
      const accessToken = await this.authService.getAccessToken(userId);

      const response = await this.ebayClient.authenticatedRequest<EbaySingleLocationApiResponse>(
        accessToken,
        {
          method: 'GET',
          path: `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
        }
      );

      // Log response for debugging (no tokens)
      const safeBody = response.data ? JSON.stringify(response.data) : (response.error ? JSON.stringify(response.error) : 'empty');
      console.log(`[eBay Location] GET location status=${response.statusCode} body=${safeBody}`);

      if (response.success && response.data) {
        return {
          success: true,
          status: response.statusCode,
          body: safeBody,
          location: {
            merchantLocationKey: response.data.merchantLocationKey,
            name: response.data.name,
            location: response.data.location?.address
              ? { address: { ...response.data.location.address, country: response.data.location.address.country || 'US' } }
              : undefined,
            locationTypes: response.data.locationTypes,
            merchantLocationStatus: response.data.merchantLocationStatus,
          },
        };
      }

      return {
        success: false,
        status: response.statusCode,
        body: safeBody,
        error: response.error?.error.message || `HTTP ${response.statusCode}`,
      };
    } catch (error) {
      console.error('[eBay Location] Error fetching location by key:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all inventory locations for a user
   */
  async getInventoryLocations(userId: string): Promise<LocationsListResult> {
    try {
      const accessToken = await this.authService.getAccessToken(userId);

      const response = await this.ebayClient.authenticatedRequest<EbayLocationsApiResponse>(
        accessToken,
        {
          method: 'GET',
          path: '/sell/inventory/v1/location?limit=100',
        }
      );

      if (response.success && response.data) {
        const locations: EbayInventoryLocation[] = (response.data.locations || []).map((loc) => ({
          merchantLocationKey: loc.merchantLocationKey,
          name: loc.name,
          location: loc.location?.address
            ? {
                address: {
                  ...loc.location.address,
                  country: loc.location.address.country || 'US',
                },
              }
            : undefined,
          locationTypes: loc.locationTypes,
          merchantLocationStatus: loc.merchantLocationStatus,
        }));

        return {
          success: true,
          locations,
          total: response.data.total || locations.length,
        };
      }

      return {
        success: false,
        locations: [],
        total: 0,
        error: response.error?.error.message || 'Failed to fetch locations',
      };
    } catch (error) {
      console.error('[eBay Location] Error fetching locations:', error);
      return {
        success: false,
        locations: [],
        total: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a new inventory location
   *
   * Per EBAY_SOURCE_OF_TRUTH.md Section 7:
   * "Each location has a merchantLocationKey (an ID you choose)...
   *  You need to supply an address (country, and either city+state or postal code)"
   */
  async createInventoryLocation(
    userId: string,
    locationData: CreateLocationRequest,
    merchantLocationKey?: string
  ): Promise<LocationResult> {
    try {
      const accessToken = await this.authService.getAccessToken(userId);

      // Generate location key if not provided
      const locationKey = merchantLocationKey || this.generateLocationKey();

      // Build address with only defined fields (undefined/null causes eBay error 2004)
      const address = {
        country: locationData.country || 'US',
        ...(locationData.addressLine1 && { addressLine1: locationData.addressLine1 }),
        ...(locationData.city && { city: locationData.city }),
        ...(locationData.stateOrProvince && { stateOrProvince: locationData.stateOrProvince }),
        ...(locationData.postalCode && { postalCode: locationData.postalCode }),
      };

      const payload: EbayInventoryLocationPayload = {
        name: locationData.name || 'ResellrAI Default',
        location: {
          address: address as EbayInventoryLocationPayload['location']['address'],
        },
        locationTypes: ['WAREHOUSE'],
        merchantLocationStatus: 'ENABLED',
      };

      // Build the endpoint path
      const endpointPath = `/sell/inventory/v1/location/${encodeURIComponent(locationKey)}`;
      const fullUrl = `${this.ebayClient.getApiBaseUrl()}${endpointPath}`;

      // Debug log: method, full URL, env, payload keys (no token)
      console.log(`[eBay Location] Creating location:`, {
        method: 'POST',
        url: fullUrl,
        env: process.env.EBAY_ENVIRONMENT || 'sandbox',
        merchantLocationKey: locationKey,
        payloadKeys: Object.keys(payload),
        addressKeys: Object.keys(address),
        address,
      });

      // POST request creates the location (eBay Inventory API requires POST, not PUT)
      const response = await this.ebayClient.authenticatedRequest<void>(
        accessToken,
        {
          method: 'POST',
          path: endpointPath,
          body: payload,
        }
      );

      // Log POST response
      const responseBody = response.error ? JSON.stringify(response.error) : 'empty';
      console.log(`[eBay Location] POST location status=${response.statusCode} body=${responseBody}`);

      // Better error handling for 2004 (Invalid request - usually incomplete address)
      if (!response.success) {
        const rawError = response.error ? JSON.stringify(response.error) : 'no error body';
        console.error('[eBay Location] POST location failed:', {
          method: 'POST',
          url: fullUrl,
          env: process.env.EBAY_ENVIRONMENT || 'sandbox',
          status: response.statusCode,
          rawError,
          addressKeys: Object.keys(address),
        });

        // Check for error 2004 (Invalid request - usually incomplete address)
        const errorId = response.error?.error?.ebay_error_id;
        const errorMessage = response.error?.error?.message || '';

        if (errorId === '2004' || errorMessage.includes('Invalid request')) {
          const missingFields = [
            !address.city && 'city',
            !address.stateOrProvince && 'stateOrProvince',
            !address.postalCode && 'postalCode',
          ].filter(Boolean);

          return {
            success: false,
            error: JSON.stringify({
              code: 'EBAY_ADDRESS_INCOMPLETE',
              message: 'Your shipping location is incomplete. eBay requires city, state, AND postal code for US locations.',
              missing_fields: missingFields,
              ebay_error_id: errorId,
            }),
          };
        }

        return {
          success: false,
          error: response.error?.error?.message || `HTTP ${response.statusCode}`,
        };
      }

      // 204 No Content = success (created/updated)
      // 200 = success with body
      if (response.statusCode === 204 || response.statusCode === 200) {
        console.log(`[eBay Location] Location created successfully: ${locationKey}`);

        // VERIFICATION: GET the location to confirm it exists and is ENABLED
        const verifyResult = await this.getInventoryLocationByKey(userId, locationKey);

        if (!verifyResult.success || !verifyResult.location) {
          console.error('[eBay Location] Location verification failed after PUT:', {
            merchantLocationKey: locationKey,
            getStatus: verifyResult.status,
            getBody: verifyResult.body,
          });
          return {
            success: false,
            error: JSON.stringify({
              code: 'EBAY_INVENTORY_LOCATION_INVALID',
              message: 'Inventory location could not be verified after creation',
              merchantLocationKey: locationKey,
              verifyStatus: verifyResult.status,
            }),
          };
        }

        if (verifyResult.location.merchantLocationStatus !== 'ENABLED') {
          console.error('[eBay Location] Location exists but is not ENABLED:', {
            merchantLocationKey: locationKey,
            status: verifyResult.location.merchantLocationStatus,
          });
          return {
            success: false,
            error: JSON.stringify({
              code: 'EBAY_INVENTORY_LOCATION_INVALID',
              message: `Inventory location is ${verifyResult.location.merchantLocationStatus}, not ENABLED. Cannot publish.`,
              merchantLocationKey: locationKey,
              locationStatus: verifyResult.location.merchantLocationStatus,
            }),
          };
        }

        console.log(`[eBay Location] Location verified ENABLED: ${locationKey}`);

        return {
          success: true,
          location: {
            merchantLocationKey: locationKey,
            name: payload.name,
            location: payload.location,
            locationTypes: payload.locationTypes,
            merchantLocationStatus: verifyResult.location.merchantLocationStatus,
          },
        };
      }

      // This shouldn't be reached due to earlier error handling, but kept as fallback
      return {
        success: false,
        error: 'Unexpected response from eBay API',
      };
    } catch (error) {
      console.error('[eBay Location] Error creating location:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get or create a default location for the user
   *
   * This is the primary method used by the listing service to ensure
   * a location exists before publishing.
   *
   * Priority order for location data:
   * 1. defaultLocationData parameter (if provided)
   * 2. eBay Identity API (seller's registration address)
   * 3. Supabase ebay_seller_profiles table
   * 4. If all fail: return structured error for frontend to handle
   */
  async ensureLocationExists(
    userId: string,
    defaultLocationData?: CreateLocationRequest
  ): Promise<{ success: boolean; locationKey?: string; error?: string }> {
    try {
      // First, check if user already has locations on eBay
      const existingLocations = await this.getInventoryLocations(userId);

      if (existingLocations.success && existingLocations.locations.length > 0) {
        // Return the first enabled location, or just the first one
        const enabledLocation = existingLocations.locations.find(
          (loc) => loc.merchantLocationStatus === 'ENABLED'
        );
        const locationToUse = enabledLocation || existingLocations.locations[0];

        console.log(`[eBay Location] Using existing location: ${locationToUse.merchantLocationKey}`);
        return {
          success: true,
          locationKey: locationToUse.merchantLocationKey,
        };
      }

      // No locations exist, try to create one using priority order
      let locationData: CreateLocationRequest | null = null;

      // Priority 1: defaultLocationData parameter
      if (defaultLocationData) {
        console.log('[eBay Location] Using provided location data');
        locationData = defaultLocationData;
      }

      // Priority 2: eBay Identity API (seller's registration address)
      if (!locationData) {
        const authService = getEbayAuthService();
        const sellerAddress = await authService.getSellerAddress(userId);

        if (sellerAddress && (sellerAddress.postalCode || (sellerAddress.city && sellerAddress.stateOrProvince))) {
          console.log('[eBay Location] Using seller address from eBay Identity API');
          locationData = sellerAddress;
        }
      }

      // Priority 3: Supabase ebay_seller_profiles table
      if (!locationData) {
        const sellerProfile = await this.getSellerProfile(userId);

        if (sellerProfile && (sellerProfile.postal_code || (sellerProfile.city && sellerProfile.state_or_province))) {
          console.log('[eBay Location] Using seller profile from database');
          locationData = {
            name: 'Default Shipping Location',
            addressLine1: sellerProfile.address_line1 || undefined,
            city: sellerProfile.city || undefined,
            stateOrProvince: sellerProfile.state_or_province || undefined,
            postalCode: sellerProfile.postal_code || undefined,
            country: sellerProfile.country || 'US',
          };
        }
      }

      // Priority 4: No location available - return structured error
      if (!locationData) {
        console.log('[eBay Location] No location data available, returning error for frontend');
        return {
          success: false,
          error: JSON.stringify({
            code: 'EBAY_LOCATION_REQUIRED',
            message: 'Shipping location required to publish listings',
            action: 'needs_location',
          }),
        };
      }

      // Create the location on eBay
      const createResult = await this.createInventoryLocation(
        userId,
        locationData,
        this.DEFAULT_LOCATION_KEY
      );

      if (createResult.success && createResult.location) {
        return {
          success: true,
          locationKey: createResult.location.merchantLocationKey,
        };
      }

      return {
        success: false,
        error: createResult.error || 'Failed to create default location',
      };
    } catch (error) {
      console.error('[eBay Location] Error ensuring location exists:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete an inventory location
   */
  async deleteInventoryLocation(
    userId: string,
    merchantLocationKey: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await this.authService.getAccessToken(userId);

      const response = await this.ebayClient.authenticatedRequest<void>(
        accessToken,
        {
          method: 'DELETE',
          path: `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
        }
      );

      // 204 No Content = success
      if (response.statusCode === 204 || response.statusCode === 200) {
        console.log(`[eBay Location] Location deleted: ${merchantLocationKey}`);
        return { success: true };
      }

      return {
        success: false,
        error: response.error?.error.message || `HTTP ${response.statusCode}`,
      };
    } catch (error) {
      console.error('[eBay Location] Error deleting location:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate a unique location key
   */
  private generateLocationKey(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    return `RSAI_LOC_${timestamp}`;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: EbayLocationService | null = null;

export function getEbayLocationService(): EbayLocationService {
  if (!serviceInstance) {
    serviceInstance = new EbayLocationService();
  }
  return serviceInstance;
}
