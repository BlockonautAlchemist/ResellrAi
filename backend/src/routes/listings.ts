/**
 * Listings API Routes
 * 
 * Endpoints for generating, retrieving, and managing listings.
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { uploadPhoto } from '../services/supabase.js';
import { analyzeItem } from '../services/vision.js';
import { generateListing, regenerateField } from '../services/listing-generator.js';
import { estimatePrice, regeneratePrice } from '../services/pricing.js';
import { formatForPlatform } from '../services/platform-formatter.js';
import * as listingsDb from '../services/listings-db.js';
import {
  GenerateListingRequestSchema,
  UpdateListingRequestSchema,
  RegenerateFieldRequestSchema,
  type ItemInput,
  type Platform,
  type UserEdit,
} from '../types/schemas.js';

const router: RouterType = Router();

/**
 * POST /api/v1/listings/generate
 * 
 * Generate a complete listing from photos.
 * This is the main endpoint that orchestrates the full pipeline.
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    // Validate request
    const parseResult = GenerateListingRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { photos, userHints, platform } = parseResult.data;
    const itemId = uuidv4();
    const startTime = Date.now();

    console.log(`[${itemId}] Starting listing generation for ${platform}`);

    // Step 1: Upload photos to Supabase Storage
    console.log(`[${itemId}] Uploading ${photos.length} photos...`);
    const photoUrls: string[] = [];
    
    for (let i = 0; i < photos.length; i++) {
      const photoData = photos[i];
      
      // Handle base64 data URLs
      let buffer: Buffer;
      let contentType = 'image/jpeg';
      
      if (photoData.startsWith('data:')) {
        const matches = photoData.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          contentType = matches[1];
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          throw new Error('Invalid base64 data URL');
        }
      } else if (photoData.startsWith('http')) {
        // Already a URL, use directly
        photoUrls.push(photoData);
        continue;
      } else {
        // Assume raw base64
        buffer = Buffer.from(photoData, 'base64');
      }

      const ext = contentType.split('/')[1] || 'jpg';
      const fileName = `${itemId}-${i + 1}.${ext}`;
      
      const { url } = await uploadPhoto(buffer, fileName, contentType);
      photoUrls.push(url);
    }

    console.log(`[${itemId}] Photos uploaded: ${photoUrls.length}`);

    // Step 2: Create item input
    const itemInput: ItemInput = {
      id: itemId,
      photos: photoUrls,
      userHints,
      createdAt: new Date().toISOString(),
    };

    // Step 3: Create initial database record
    await listingsDb.createListing({
      itemInput,
      platform,
      photoUrls,
    });

    // Step 4: Analyze with vision model
    console.log(`[${itemId}] Analyzing photos with vision model...`);
    const visionOutput = await analyzeItem(itemInput);
    await listingsDb.updateVisionOutput(itemId, visionOutput);
    console.log(`[${itemId}] Vision analysis complete in ${visionOutput.processingTimeMs}ms`);

    // Step 5: Generate listing content
    console.log(`[${itemId}] Generating listing content...`);
    const listingDraft = await generateListing(visionOutput);
    console.log(`[${itemId}] Listing draft generated`);

    // Step 6: Estimate pricing
    console.log(`[${itemId}] Estimating price...`);
    const pricingSuggestion = await estimatePrice(visionOutput, listingDraft);
    console.log(`[${itemId}] Price estimate: $${pricingSuggestion.lowPrice}-$${pricingSuggestion.highPrice}`);

    // Step 7: Format for platform
    console.log(`[${itemId}] Formatting for ${platform}...`);
    const platformVariant = formatForPlatform(listingDraft, platform);

    // Step 8: Update database with all generated data
    await listingsDb.updateListingGeneration(itemId, {
      listingDraft,
      pricingSuggestion,
      platformVariant,
    });

    const totalTime = Date.now() - startTime;
    console.log(`[${itemId}] Generation complete in ${totalTime}ms`);

    // Return complete result
    res.json({
      itemId,
      visionOutput,
      listingDraft,
      pricingSuggestion,
      platformVariant,
      photoUrls,
      processingTimeMs: totalTime,
    });
  } catch (error) {
    console.error('Listing generation failed:', error);
    res.status(500).json({
      error: 'Failed to generate listing',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/listings/:id
 * 
 * Get a listing by ID.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const listing = await listingsDb.getListing(id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    res.json(listing);
  } catch (error) {
    console.error('Failed to get listing:', error);
    res.status(500).json({
      error: 'Failed to get listing',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/v1/listings/:id
 * 
 * Update listing fields (user edits).
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request
    const parseResult = UpdateListingRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const updates = parseResult.data;
    const listing = await listingsDb.getListing(id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (!listing.listing_draft) {
      return res.status(400).json({ error: 'Listing not fully generated' });
    }

    // Build the updated draft
    const updatedDraft = { ...listing.listing_draft };
    const edits: UserEdit[] = [];

    if (updates.title) {
      edits.push({
        itemId: id,
        field: 'title',
        previousValue: updatedDraft.title.value,
        newValue: updates.title,
        editedAt: new Date().toISOString(),
        editType: 'manual',
      });
      updatedDraft.title = {
        value: updates.title,
        charCount: updates.title.length,
      };
    }

    if (updates.description) {
      edits.push({
        itemId: id,
        field: 'description',
        previousValue: updatedDraft.description.value,
        newValue: updates.description,
        editedAt: new Date().toISOString(),
        editType: 'manual',
      });
      updatedDraft.description = {
        value: updates.description,
        charCount: updates.description.length,
      };
    }

    if (updates.condition) {
      edits.push({
        itemId: id,
        field: 'condition',
        previousValue: updatedDraft.condition.value,
        newValue: updates.condition,
        editedAt: new Date().toISOString(),
        editType: 'manual',
      });
      updatedDraft.condition = {
        value: updates.condition,
        requiresConfirmation: false, // User confirmed by editing
      };
    }

    // Update in database
    let result = listing;
    for (const edit of edits) {
      result = await listingsDb.updateListingFields(
        id,
        { listing_draft: updatedDraft },
        edit
      );
    }

    // Reformat for platform if content changed
    if (edits.length > 0 && result.platform) {
      const newPlatformVariant = formatForPlatform(updatedDraft, result.platform);
      result = await listingsDb.updateListingFields(
        id,
        { platform_variant: newPlatformVariant },
        edits[0] // Just use the first edit for tracking
      );
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to update listing:', error);
    res.status(500).json({
      error: 'Failed to update listing',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/listings/:id/regenerate
 * 
 * Regenerate a specific field (title, description, or price).
 */
router.post('/:id/regenerate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request
    const parseResult = RegenerateFieldRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { field } = parseResult.data;
    const listing = await listingsDb.getListing(id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (!listing.vision_output || !listing.listing_draft) {
      return res.status(400).json({ error: 'Listing not fully generated' });
    }

    let newValue: string | object;
    const previousValue = field === 'price'
      ? listing.pricing_suggestion
      : listing.listing_draft[field].value;

    if (field === 'title' || field === 'description') {
      newValue = await regenerateField(listing.listing_draft, field, listing.vision_output);
      
      // Update draft
      const updatedDraft = { ...listing.listing_draft };
      updatedDraft[field] = {
        value: newValue,
        charCount: newValue.length,
      };

      const edit: UserEdit = {
        itemId: id,
        field,
        previousValue,
        newValue,
        editedAt: new Date().toISOString(),
        editType: 'regenerate',
      };

      await listingsDb.updateListingFields(id, { listing_draft: updatedDraft }, edit);

      // Reformat for platform
      if (listing.platform) {
        const newPlatformVariant = formatForPlatform(updatedDraft, listing.platform);
        await listingsDb.updateListingFields(id, { platform_variant: newPlatformVariant }, edit);
      }
    } else if (field === 'price') {
      const newPricing = await regeneratePrice(
        listing.vision_output,
        listing.listing_draft
      );
      newValue = newPricing;

      const edit: UserEdit = {
        itemId: id,
        field: 'price',
        previousValue,
        newValue,
        editedAt: new Date().toISOString(),
        editType: 'regenerate',
      };

      await listingsDb.updateListingFields(id, { pricing_suggestion: newPricing }, edit);
    }

    // Get updated listing
    const updatedListing = await listingsDb.getListing(id);
    res.json(updatedListing);
  } catch (error) {
    console.error('Failed to regenerate field:', error);
    res.status(500).json({
      error: 'Failed to regenerate field',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/listings/:id/export
 * 
 * Mark listing as exported and return final payload.
 */
router.post('/:id/export', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { price } = req.body;

    const listing = await listingsDb.getListing(id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (!listing.listing_draft || !listing.platform) {
      return res.status(400).json({ error: 'Listing not ready for export' });
    }

    // Build final payload
    const finalPayload = {
      itemId: id,
      platform: listing.platform,
      title: listing.listing_draft.title.value,
      description: listing.listing_draft.description.value,
      price: price || listing.pricing_suggestion?.midPrice || 0,
      category: listing.listing_draft.category.value,
      attributes: listing.listing_draft.attributes.map(a => ({
        key: a.key,
        value: a.value,
      })),
      photos: listing.photo_urls,
      status: 'exported' as const,
      exportedAt: new Date().toISOString(),
    };

    // Update database
    const exported = await listingsDb.markExported(id, finalPayload);

    res.json({
      success: true,
      listing: exported,
      finalPayload,
    });
  } catch (error) {
    console.error('Failed to export listing:', error);
    res.status(500).json({
      error: 'Failed to export listing',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/listings
 * 
 * Get recent listings.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const listings = await listingsDb.getRecentListings(limit);
    res.json(listings);
  } catch (error) {
    console.error('Failed to get listings:', error);
    res.status(500).json({
      error: 'Failed to get listings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/v1/listings/:id
 * 
 * Delete a listing.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await listingsDb.deleteListing(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete listing:', error);
    res.status(500).json({
      error: 'Failed to delete listing',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
