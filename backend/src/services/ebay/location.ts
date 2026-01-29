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

import { getEbayClient } from './client.js';
import { getEbayAuthService } from './auth.js';
import {
  type EbayInventoryLocationPayload,
  type EbayInventoryLocation,
  type CreateLocationRequest,
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

// =============================================================================
// LOCATION SERVICE
// =============================================================================

export class EbayLocationService {
  private ebayClient: ReturnType<typeof getEbayClient>;
  private authService: ReturnType<typeof getEbayAuthService>;

  // Default location key format
  private readonly DEFAULT_LOCATION_KEY = 'RESELLRAI_DEFAULT';

  constructor() {
    this.ebayClient = getEbayClient();
    this.authService = getEbayAuthService();
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

      // Build the payload per eBay Inventory API spec
      const payload: EbayInventoryLocationPayload = {
        name: locationData.name || 'Default Shipping Location',
        location: {
          address: {
            addressLine1: locationData.addressLine1,
            city: locationData.city,
            stateOrProvince: locationData.stateOrProvince,
            postalCode: locationData.postalCode,
            country: locationData.country || 'US',
          },
        },
        locationTypes: ['WAREHOUSE'],
        merchantLocationStatus: 'ENABLED',
      };

      console.log(`[eBay Location] Creating location: ${locationKey}`);

      // PUT request creates or replaces the location
      const response = await this.ebayClient.authenticatedRequest<void>(
        accessToken,
        {
          method: 'PUT',
          path: `/sell/inventory/v1/location/${encodeURIComponent(locationKey)}`,
          body: payload,
        }
      );

      // 204 No Content = success (created/updated)
      // 200 = success with body
      if (response.statusCode === 204 || response.statusCode === 200) {
        console.log(`[eBay Location] Location created successfully: ${locationKey}`);
        return {
          success: true,
          location: {
            merchantLocationKey: locationKey,
            name: payload.name,
            location: payload.location,
            locationTypes: payload.locationTypes,
            merchantLocationStatus: payload.merchantLocationStatus,
          },
        };
      }

      return {
        success: false,
        error: response.error?.error.message || `HTTP ${response.statusCode}`,
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
   */
  async ensureLocationExists(
    userId: string,
    defaultLocationData?: CreateLocationRequest
  ): Promise<{ success: boolean; locationKey?: string; error?: string }> {
    try {
      // First, check if user already has locations
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

      // No locations exist, create a default one
      // Use provided data or fall back to a minimal US location
      const locationData: CreateLocationRequest = defaultLocationData || {
        name: 'Default Shipping Location',
        postalCode: '97201', // Portland, OR - neutral default
        country: 'US',
      };

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
