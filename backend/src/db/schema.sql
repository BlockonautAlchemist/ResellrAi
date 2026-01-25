-- ResellrAI Database Schema
-- Run this in the Supabase SQL Editor to create the listings table

-- =============================================================================
-- LISTINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS listings (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Input data
  item_input JSONB NOT NULL,
  
  -- AI-generated data
  vision_output JSONB,
  listing_draft JSONB,
  pricing_suggestion JSONB,
  platform_variant JSONB,
  
  -- Metadata
  platform VARCHAR(20),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'exported')),
  photo_urls TEXT[] DEFAULT '{}',
  
  -- User edits tracking
  edits JSONB DEFAULT '[]',
  
  -- Final export data
  final_payload JSONB,
  exported_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for querying by status
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);

-- Index for querying by platform
CREATE INDEX IF NOT EXISTS idx_listings_platform ON listings(platform);

-- Index for querying by creation date
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (Optional - for multi-user setup)
-- =============================================================================

-- Enable RLS (uncomment when adding auth)
-- ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users (uncomment when adding auth)
-- CREATE POLICY "Users can manage their own listings"
--   ON listings
--   FOR ALL
--   USING (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE listings IS 'Stores all listing data from generation to export';
COMMENT ON COLUMN listings.item_input IS 'Original ItemInput schema - photos and user hints';
COMMENT ON COLUMN listings.vision_output IS 'VisionOutput schema - AI detected attributes';
COMMENT ON COLUMN listings.listing_draft IS 'ListingDraft schema - generated title, description, attributes';
COMMENT ON COLUMN listings.pricing_suggestion IS 'PricingSuggestion schema - price range estimate';
COMMENT ON COLUMN listings.platform_variant IS 'PlatformVariant schema - platform-specific formatting';
COMMENT ON COLUMN listings.edits IS 'Array of UserEdit objects tracking changes';
COMMENT ON COLUMN listings.final_payload IS 'FinalListingPayload schema - ready for export';
