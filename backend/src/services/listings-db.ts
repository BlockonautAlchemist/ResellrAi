/**
 * ListingsDB Service
 * 
 * Database operations for the listings table.
 */

import { supabase } from './supabase.js';
import type {
  ItemInput,
  VisionOutput,
  ListingDraft,
  PricingSuggestion,
  PlatformVariant,
  UserEdit,
  FinalListingPayload,
  ListingStatus,
  Platform,
} from '../types/schemas.js';

/**
 * Listing record as stored in database
 */
export interface ListingRecord {
  id: string;
  item_input: ItemInput;
  vision_output: VisionOutput | null;
  listing_draft: ListingDraft | null;
  pricing_suggestion: PricingSuggestion | null;
  platform_variant: PlatformVariant | null;
  platform: Platform | null;
  status: ListingStatus;
  photo_urls: string[];
  edits: UserEdit[];
  final_payload: FinalListingPayload | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Create a new listing record
 */
export async function createListing(data: {
  itemInput: ItemInput;
  platform: Platform;
  photoUrls: string[];
}): Promise<ListingRecord> {
  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      id: data.itemInput.id,
      item_input: data.itemInput,
      platform: data.platform,
      photo_urls: data.photoUrls,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create listing: ${error.message}`);
  }

  return listing as ListingRecord;
}

/**
 * Get a listing by ID
 */
export async function getListing(id: string): Promise<ListingRecord | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to get listing: ${error.message}`);
  }

  return data as ListingRecord;
}

/**
 * Update listing with vision output
 */
export async function updateVisionOutput(
  id: string,
  visionOutput: VisionOutput
): Promise<ListingRecord> {
  const { data, error } = await supabase
    .from('listings')
    .update({ vision_output: visionOutput })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update vision output: ${error.message}`);
  }

  return data as ListingRecord;
}

/**
 * Update listing with draft, pricing, and platform variant
 */
export async function updateListingGeneration(
  id: string,
  data: {
    listingDraft: ListingDraft;
    pricingSuggestion: PricingSuggestion;
    platformVariant: PlatformVariant;
  }
): Promise<ListingRecord> {
  const { data: listing, error } = await supabase
    .from('listings')
    .update({
      listing_draft: data.listingDraft,
      pricing_suggestion: data.pricingSuggestion,
      platform_variant: data.platformVariant,
      status: 'ready',
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update listing generation: ${error.message}`);
  }

  return listing as ListingRecord;
}

/**
 * Update listing fields (user edits)
 */
export async function updateListingFields(
  id: string,
  updates: Partial<{
    listing_draft: ListingDraft;
    pricing_suggestion: PricingSuggestion;
    platform_variant: PlatformVariant;
  }>,
  edit: UserEdit
): Promise<ListingRecord> {
  // First get current edits
  const current = await getListing(id);
  if (!current) {
    throw new Error('Listing not found');
  }

  const edits = [...(current.edits || []), edit];

  const { data, error } = await supabase
    .from('listings')
    .update({
      ...updates,
      edits,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update listing: ${error.message}`);
  }

  return data as ListingRecord;
}

/**
 * Mark listing as exported
 */
export async function markExported(
  id: string,
  finalPayload: FinalListingPayload
): Promise<ListingRecord> {
  const { data, error } = await supabase
    .from('listings')
    .update({
      status: 'exported',
      final_payload: finalPayload,
      exported_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to mark as exported: ${error.message}`);
  }

  return data as ListingRecord;
}

/**
 * Get recent listings
 */
export async function getRecentListings(limit: number = 10): Promise<ListingRecord[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get recent listings: ${error.message}`);
  }

  return data as ListingRecord[];
}

/**
 * Delete a listing
 */
export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete listing: ${error.message}`);
  }
}
