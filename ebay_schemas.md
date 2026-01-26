# eBay Integration Schemas

**Document Version:** 1.3
**Created:** 2026-01-26
**Updated:** 2026-01-26
**Status:** IMPLEMENTED

**Scope Constraints Applied:**
- Marketplace: EBAY_US only
- Format: Fixed price only (no auctions)
- Environment: Sandbox first

**Implementation Files:**
- Zod schemas: `backend/src/types/ebay-schemas.ts`
- DB migrations: `backend/src/db/ebay-migrations.sql`

---

## Overview

This document defines canonical JSON schemas for eBay integration. All implementations must conform to these schemas. Schemas are defined in TypeScript/Zod format for validation.

---

## 1. OAuth / Authentication Schemas

### EbayAuthStartRequest

Request to initiate OAuth flow.

```typescript
interface EbayAuthStartRequest {
  // User ID from authenticated session
  user_id: string;

  // Optional: specific scopes to request (defaults to standard listing scopes)
  scopes?: string[];

  // Return URL for mobile deep-link after OAuth
  redirect_context: 'mobile' | 'web';
}
```

### EbayAuthStartResponse

Response containing OAuth URL for user redirect.

```typescript
interface EbayAuthStartResponse {
  // Full eBay authorization URL to redirect user
  auth_url: string;

  // State parameter for CSRF protection (stored server-side)
  state: string;

  // Expiry time for this auth attempt
  expires_at: string; // ISO8601
}
```

### EbayAuthCallbackPayload

Payload received from eBay OAuth callback.

```typescript
interface EbayAuthCallbackPayload {
  // Authorization code from eBay
  code: string;

  // State parameter for validation
  state: string;

  // Optional: error if user denied access
  error?: string;
  error_description?: string;
}
```

### EbayTokenSet

Internal token storage (NEVER sent to client).

```typescript
interface EbayTokenSet {
  // Access token for API calls
  access_token: string;

  // Refresh token for renewal
  refresh_token: string;

  // Token type (typically "User Access Token")
  token_type: string;

  // Scopes granted
  scopes: string[];

  // Expiry timestamps
  access_token_expires_at: string;  // ISO8601
  refresh_token_expires_at: string; // ISO8601

  // eBay user identifier
  ebay_user_id: string;
}
```

### EbayConnectedAccount

User-facing account status (safe for client).

```typescript
interface EbayConnectedAccount {
  // Whether account is connected
  connected: boolean;

  // eBay username (display only)
  ebay_username?: string;

  // When connection was established
  connected_at?: string; // ISO8601

  // Whether token needs refresh (internal flag)
  needs_reauth?: boolean;

  // Marketplace region
  marketplace?: string;
}
```

---

## 2. Pricing Comps Schemas

### EbayCompsQuery

Input query for pricing comparables.

```typescript
interface EbayCompsQuery {
  // Search keywords (from listing title or user input)
  keywords: string;

  // Optional category constraint
  category_id?: string;

  // Optional condition filter
  condition?: 'NEW' | 'LIKE_NEW' | 'VERY_GOOD' | 'GOOD' | 'ACCEPTABLE';

  // Brand name if known
  brand?: string;

  // Maximum results to fetch (default: 20)
  limit?: number;

  // Marketplace ID (default: EBAY_US)
  marketplace_id?: string;
}
```

### EbayCompItem

Single comparable item.

```typescript
interface EbayCompItem {
  // eBay item ID
  item_id: string;

  // Item title
  title: string;

  // Price information
  price: {
    value: number;
    currency: string;
  };

  // Item condition
  condition: string;

  // Listing URL
  item_url: string;

  // Thumbnail image
  image_url?: string;

  // For sold items: sale date
  sold_date?: string; // ISO8601

  // Seller info (optional)
  seller?: {
    username: string;
    feedback_score?: number;
  };
}
```

### EbayCompsResult

Complete pricing comps response.

```typescript
interface EbayCompsResult {
  // Data source transparency
  source: 'sold' | 'active' | 'none';

  // Comparable items found
  data: EbayCompItem[];

  // Statistical summary
  stats: {
    median: number | null;
    average: number | null;
    min: number | null;
    max: number | null;
    sample_size: number;
    confidence: 'high' | 'medium' | 'low' | 'none';
  };

  // Limitations and caveats
  limitations: string[];

  // Query metadata
  query: {
    keywords: string;
    category_id?: string;
    marketplace_id: string;
    executed_at: string; // ISO8601
  };

  // Cache/freshness info
  cached: boolean;
  cache_expires_at?: string; // ISO8601
}
```

**Confidence Levels:**
- `high`: 10+ sold items in last 30 days
- `medium`: 5-9 items or active listings only
- `low`: 1-4 items
- `none`: No comparable items found

**UI Display Messages (required):**
- `source: "sold"` → "Based on X recently sold items"
- `source: "active"` → "Based on X active listings (no recent sales data)"
- `source: "none"` → "No comparable items found"

---

## 3. Listing / Publish Schemas

### EbayListingDraft

Pre-publish listing ready for review.

```typescript
interface EbayListingDraft {
  // Reference to local listing
  listing_id: string;

  // Title (max 80 chars for eBay)
  title: string;

  // Description (HTML allowed)
  description: string;

  // Category
  category_id: string;
  category_name?: string;

  // Condition
  condition: {
    id: string;        // eBay condition ID
    description: string;
  };

  // Price
  price: {
    value: number;
    currency: string;  // USD
  };

  // Quantity
  quantity: number;

  // Images (URLs must be HTTPS, eBay-hosted or compliant external)
  image_urls: string[];

  // Item specifics (brand, color, size, etc.)
  item_specifics: Record<string, string>;

  // Listing format (v1: fixed price only)
  format: 'FIXED_PRICE';

  // Policies (user-selected or defaults)
  policies?: {
    fulfillment_policy_id?: string;
    payment_policy_id?: string;
    return_policy_id?: string;
  };
}
```

### EbayInventoryItemPayload

Payload for eBay Inventory API createOrReplaceInventoryItem.

```typescript
interface EbayInventoryItemPayload {
  // SKU (unique identifier)
  sku: string;

  // Locale
  locale: string; // en_US

  // Product details
  product: {
    title: string;
    description: string;
    imageUrls: string[];
    aspects: Record<string, string[]>;
  };

  // Condition
  condition: string; // NEW, LIKE_NEW, etc.
  conditionDescription?: string;

  // Availability
  availability: {
    shipToLocationAvailability: {
      quantity: number;
    };
  };
}
```

### EbayOfferPayload

Payload for eBay Inventory API createOffer.

```typescript
interface EbayOfferPayload {
  // SKU reference
  sku: string;

  // Marketplace
  marketplaceId: string; // EBAY_US

  // Format (v1: fixed price only)
  format: 'FIXED_PRICE';

  // Category
  categoryId: string;

  // Pricing (fixed price)
  pricingSummary: {
    price: {
      value: string; // String for precision
      currency: string; // USD
    };
  };

  // Quantity
  availableQuantity: number;

  // Policies
  listingPolicies: {
    fulfillmentPolicyId: string;
    paymentPolicyId: string;
    returnPolicyId: string;
  };

  // Merchant location key
  merchantLocationKey?: string;
}
```

### EbayPublishResult

Result of publishing a listing.

```typescript
interface EbayPublishResult {
  // Success indicator
  success: boolean;

  // eBay identifiers (on success)
  listing_id?: string;    // eBay listing ID
  offer_id?: string;      // eBay offer ID
  sku?: string;           // Inventory SKU

  // Listing URL (on success)
  listing_url?: string;

  // Error details (on failure)
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };

  // Warnings (even on success)
  warnings?: Array<{
    code: string;
    message: string;
  }>;

  // Timestamps
  published_at?: string;  // ISO8601
  attempted_at: string;   // ISO8601
}
```

---

## 4. Database Extensions

### Listings Table Extensions

Add these columns to existing `listings` table:

```sql
-- eBay pricing comps (cached)
ALTER TABLE listings ADD COLUMN pricing_comps JSONB;

-- eBay publish state
ALTER TABLE listings ADD COLUMN ebay_publish JSONB;

-- eBay identifiers
ALTER TABLE listings ADD COLUMN ebay_offer_id TEXT;
ALTER TABLE listings ADD COLUMN ebay_sku TEXT;
ALTER TABLE listings ADD COLUMN ebay_listing_id TEXT;

-- Timestamps
ALTER TABLE listings ADD COLUMN ebay_published_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX idx_listings_ebay_listing_id ON listings(ebay_listing_id);
CREATE INDEX idx_listings_ebay_sku ON listings(ebay_sku);
```

### EbayAccounts Table (New)

Store connected eBay accounts.

```sql
CREATE TABLE ebay_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- eBay identifiers
  ebay_user_id TEXT NOT NULL,
  ebay_username TEXT,

  -- Encrypted tokens
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,

  -- Token metadata
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL,

  -- Marketplace
  marketplace_id TEXT NOT NULL DEFAULT 'EBAY_US',

  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- active, expired, revoked

  -- Timestamps
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, ebay_user_id)
);

-- Indexes
CREATE INDEX idx_ebay_accounts_user_id ON ebay_accounts(user_id);
CREATE INDEX idx_ebay_accounts_status ON ebay_accounts(status);
CREATE INDEX idx_ebay_accounts_refresh_expires ON ebay_accounts(refresh_token_expires_at);
```

### EbayAuthStates Table (New)

CSRF protection for OAuth flow.

```sql
CREATE TABLE ebay_auth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  state TEXT NOT NULL UNIQUE,
  redirect_context TEXT NOT NULL, -- 'mobile' or 'web'
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup expired states
CREATE INDEX idx_ebay_auth_states_expires ON ebay_auth_states(expires_at);
```

---

## 5. Error Response Schema

### EbayApiError

Standardized error response.

```typescript
interface EbayApiError {
  // Error classification
  error: {
    code: string;          // e.g., 'EBAY_AUTH_FAILED', 'EBAY_RATE_LIMITED'
    message: string;       // Human-readable message
    ebay_error_id?: string; // Original eBay error ID if applicable
  };

  // Recovery guidance
  recovery?: {
    action: 'retry' | 'reauth' | 'contact_support' | 'none';
    retry_after?: number;  // Seconds until retry
    message?: string;      // Guidance for user
  };

  // Request context
  request_id: string;
  timestamp: string; // ISO8601
}
```

---

## Validation Notes

1. All schemas will be implemented as Zod validators in `backend/src/types/ebay-schemas.ts`
2. API endpoints must validate request/response against schemas
3. Database columns with JSONB must validate on write
4. Tokens must be encrypted before storage

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-01-26 | 1.0 | Initial schemas draft | Integration Architect |

---

*Schemas are subject to refinement based on eBay API documentation review and testing.*
