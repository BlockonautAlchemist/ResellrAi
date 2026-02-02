-- =============================================================================
-- ResellrAI eBay Integration Database Migrations
-- =============================================================================
-- Run this in the Supabase SQL Editor to add eBay integration tables and columns
--
-- Prerequisites:
--   - schema.sql must be run first (listings table must exist)
--   - Supabase Auth must be enabled for user_id foreign keys
--
-- Scope Constraints (v1):
--   - Marketplace: EBAY_US only
--   - Format: Fixed price only
--   - Environment: Sandbox first
-- =============================================================================

-- =============================================================================
-- PART 1: EXTEND LISTINGS TABLE
-- =============================================================================

-- Add eBay pricing comps (cached result from Browse API)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS pricing_comps JSONB;

-- Add eBay publish state (result of publish attempt)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ebay_publish JSONB;

-- Add eBay identifiers
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ebay_offer_id TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ebay_sku TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ebay_listing_id TEXT;

-- Add eBay publish timestamp
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ebay_published_at TIMESTAMPTZ;

-- Indexes for eBay fields
CREATE INDEX IF NOT EXISTS idx_listings_ebay_listing_id ON listings(ebay_listing_id) WHERE ebay_listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_ebay_sku ON listings(ebay_sku) WHERE ebay_sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_ebay_offer_id ON listings(ebay_offer_id) WHERE ebay_offer_id IS NOT NULL;

-- Comments for eBay fields
COMMENT ON COLUMN listings.pricing_comps IS 'EbayCompsResult schema - cached pricing comparables from eBay';
COMMENT ON COLUMN listings.ebay_publish IS 'EbayPublishResult schema - result of publish attempt';
COMMENT ON COLUMN listings.ebay_offer_id IS 'eBay Inventory API offer ID';
COMMENT ON COLUMN listings.ebay_sku IS 'eBay Inventory API SKU (unique per listing)';
COMMENT ON COLUMN listings.ebay_listing_id IS 'eBay listing ID (viewable on eBay)';
COMMENT ON COLUMN listings.ebay_published_at IS 'Timestamp when listing was published to eBay';

-- =============================================================================
-- PART 2: EBAY ACCOUNTS TABLE
-- =============================================================================

-- Store connected eBay accounts
CREATE TABLE IF NOT EXISTS ebay_accounts (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference (requires Supabase Auth)
  -- For development without auth, you can remove the REFERENCES constraint
  user_id UUID NOT NULL,

  -- eBay identifiers
  ebay_user_id TEXT NOT NULL,
  ebay_username TEXT,

  -- Encrypted tokens (NEVER send to client)
  -- Tokens are encrypted with AES-256-GCM before storage
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,

  -- Token metadata
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',

  -- Marketplace (v1: EBAY_US only)
  marketplace_id TEXT NOT NULL DEFAULT 'EBAY_US' CHECK (marketplace_id = 'EBAY_US'),

  -- Account status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),

  -- Timestamps
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, ebay_user_id)
);

-- Indexes for ebay_accounts
CREATE INDEX IF NOT EXISTS idx_ebay_accounts_user_id ON ebay_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ebay_accounts_status ON ebay_accounts(status);
CREATE INDEX IF NOT EXISTS idx_ebay_accounts_refresh_expires ON ebay_accounts(refresh_token_expires_at);
CREATE INDEX IF NOT EXISTS idx_ebay_accounts_ebay_user_id ON ebay_accounts(ebay_user_id);

-- Updated_at trigger for ebay_accounts
DROP TRIGGER IF EXISTS update_ebay_accounts_updated_at ON ebay_accounts;
CREATE TRIGGER update_ebay_accounts_updated_at
  BEFORE UPDATE ON ebay_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for ebay_accounts
COMMENT ON TABLE ebay_accounts IS 'Stores connected eBay accounts with encrypted OAuth tokens';
COMMENT ON COLUMN ebay_accounts.access_token_encrypted IS 'AES-256-GCM encrypted access token - NEVER expose to client';
COMMENT ON COLUMN ebay_accounts.refresh_token_encrypted IS 'AES-256-GCM encrypted refresh token - NEVER expose to client';
COMMENT ON COLUMN ebay_accounts.status IS 'active = valid tokens, expired = needs refresh, revoked = user disconnected';

-- =============================================================================
-- PART 3: EBAY AUTH STATES TABLE (CSRF Protection)
-- =============================================================================

-- Store OAuth state parameters for CSRF protection
CREATE TABLE IF NOT EXISTS ebay_auth_states (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL,

  -- State parameter (cryptographically random)
  state TEXT NOT NULL UNIQUE,

  -- Redirect context for after OAuth
  redirect_context TEXT NOT NULL CHECK (redirect_context IN ('mobile', 'web')),

  -- Expiry (states are short-lived, typically 10 minutes)
  expires_at TIMESTAMPTZ NOT NULL,

  -- Track if state was used (prevent replay attacks)
  used_at TIMESTAMPTZ,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for ebay_auth_states
CREATE INDEX IF NOT EXISTS idx_ebay_auth_states_state ON ebay_auth_states(state);
CREATE INDEX IF NOT EXISTS idx_ebay_auth_states_user_id ON ebay_auth_states(user_id);
CREATE INDEX IF NOT EXISTS idx_ebay_auth_states_expires ON ebay_auth_states(expires_at);

-- Comments for ebay_auth_states
COMMENT ON TABLE ebay_auth_states IS 'OAuth state parameters for CSRF protection during eBay auth flow';
COMMENT ON COLUMN ebay_auth_states.state IS 'Cryptographically random state parameter sent to eBay';
COMMENT ON COLUMN ebay_auth_states.used_at IS 'Set when state is consumed - prevents replay attacks';

-- =============================================================================
-- PART 4: CLEANUP FUNCTIONS
-- =============================================================================

-- Function to clean up expired auth states (run via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_ebay_auth_states()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ebay_auth_states
  WHERE expires_at < NOW() OR used_at IS NOT NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_ebay_auth_states IS 'Removes expired or used OAuth state records';

-- Function to mark expired eBay accounts (run via cron)
CREATE OR REPLACE FUNCTION mark_expired_ebay_accounts()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE ebay_accounts
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active'
    AND refresh_token_expires_at < NOW();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_expired_ebay_accounts IS 'Marks accounts with expired refresh tokens as expired';

-- =============================================================================
-- PART 5: EBAY SELLER PROFILES TABLE
-- =============================================================================

-- Store seller's shipping location profile for creating eBay inventory locations
-- NOTE: No foreign key on user_id for development flexibility (same pattern as ebay_accounts)
CREATE TABLE IF NOT EXISTS ebay_seller_profiles (
  -- Primary key is user_id (one profile per user)
  -- No FK constraint - allows dev/test user IDs without auth.users entry
  user_id UUID PRIMARY KEY,

  -- Location data (country required, then postal_code OR city+state)
  country VARCHAR(2) NOT NULL DEFAULT 'US',
  postal_code VARCHAR(64),
  city VARCHAR(128),
  state_or_province VARCHAR(128),
  address_line1 VARCHAR(128),

  -- Timestamp
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint: must have postal_code OR (city AND state_or_province)
  CONSTRAINT valid_location CHECK (
    postal_code IS NOT NULL OR (city IS NOT NULL AND state_or_province IS NOT NULL)
  )
);

-- Index for user lookup (already primary key, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_ebay_seller_profiles_user_id ON ebay_seller_profiles(user_id);

-- Updated_at trigger for ebay_seller_profiles
DROP TRIGGER IF EXISTS update_ebay_seller_profiles_updated_at ON ebay_seller_profiles;
CREATE TRIGGER update_ebay_seller_profiles_updated_at
  BEFORE UPDATE ON ebay_seller_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for ebay_seller_profiles
COMMENT ON TABLE ebay_seller_profiles IS 'User shipping location profiles for eBay inventory locations';
COMMENT ON COLUMN ebay_seller_profiles.country IS 'ISO 3166-1 alpha-2 country code (default US)';
COMMENT ON COLUMN ebay_seller_profiles.postal_code IS 'ZIP/postal code - satisfies location requirement alone';
COMMENT ON COLUMN ebay_seller_profiles.city IS 'City name - requires state_or_province to satisfy location';
COMMENT ON COLUMN ebay_seller_profiles.state_or_province IS 'State/province - requires city to satisfy location';
COMMENT ON COLUMN ebay_seller_profiles.address_line1 IS 'Optional street address for more precise location';

-- =============================================================================
-- PART 6: ROW LEVEL SECURITY (Enable when auth is implemented)
-- =============================================================================

-- Uncomment these when Supabase Auth is integrated:

-- ALTER TABLE ebay_accounts ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users can view their own eBay accounts"
--   ON ebay_accounts
--   FOR SELECT
--   USING (auth.uid() = user_id);

-- CREATE POLICY "Users can insert their own eBay accounts"
--   ON ebay_accounts
--   FOR INSERT
--   WITH CHECK (auth.uid() = user_id);

-- CREATE POLICY "Users can update their own eBay accounts"
--   ON ebay_accounts
--   FOR UPDATE
--   USING (auth.uid() = user_id);

-- CREATE POLICY "Users can delete their own eBay accounts"
--   ON ebay_accounts
--   FOR DELETE
--   USING (auth.uid() = user_id);

-- ALTER TABLE ebay_auth_states ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users can manage their own auth states"
--   ON ebay_auth_states
--   FOR ALL
--   USING (auth.uid() = user_id);

-- ALTER TABLE ebay_seller_profiles ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users can view their own seller profile"
--   ON ebay_seller_profiles
--   FOR SELECT
--   USING (auth.uid() = user_id);

-- CREATE POLICY "Users can insert their own seller profile"
--   ON ebay_seller_profiles
--   FOR INSERT
--   WITH CHECK (auth.uid() = user_id);

-- CREATE POLICY "Users can update their own seller profile"
--   ON ebay_seller_profiles
--   FOR UPDATE
--   USING (auth.uid() = user_id);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Run these to verify the migration:

-- Check listings table columns
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'listings' AND column_name LIKE 'ebay%';

-- Check ebay_accounts table
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'ebay_accounts'
-- ORDER BY ordinal_position;

-- Check ebay_auth_states table
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'ebay_auth_states'
-- ORDER BY ordinal_position;

-- Check ebay_seller_profiles table
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'ebay_seller_profiles'
-- ORDER BY ordinal_position;

-- Check indexes
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('listings', 'ebay_accounts', 'ebay_auth_states', 'ebay_seller_profiles')
-- AND indexname LIKE '%ebay%';
