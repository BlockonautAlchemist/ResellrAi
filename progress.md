# ResellrAI Progress Log

**Project:** ResellrAI - AI-Powered Listing Generator  
**Started:** 2026-01-25  
**Current Phase:** Phase 3 Complete - Core Features Built

---

## 2026-01-25 - Project Initialization (Protocol 0)

### Completed
- [x] Protocol 0: Initialization complete
- [x] Product scope defined and locked
- [x] 7 canonical JSON schemas defined
- [x] 3-layer architecture documented
- [x] Product Constitution established
- [x] Project folder structure created

### Foundation Documents Created

| Document | Purpose | Status |
|----------|---------|--------|
| `product_scope.md` | Vision, persona, MVP features, non-goals | ✅ Complete |
| `data_schema.md` | 7 canonical JSON schemas | ✅ Complete |
| `architecture.md` | 3-layer system design | ✅ Complete |
| `constitution.md` | Product law and invariants | ✅ Complete |
| `progress.md` | This build log | ✅ Complete |

### Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| v1 Platforms | eBay + Poshmark | Focus over breadth; two platforms with different requirements to prove flexibility |
| Monetization | Freemium (5 free → Pro $9-15/mo) | Let users test before committing; scales with value |
| North Star | 60-second listing generation | Measurable, directly addresses core pain point |
| AI Constraints | Never fabricate authenticity/provenance | Legal protection, trust building |

### Schemas Defined

1. **ItemInput** - Raw photo input with optional user hints
2. **VisionOutput** - AI-detected attributes with confidence scores
3. **ListingDraft** - Generated listing ready for review
4. **PricingSuggestion** - Price range with explanation
5. **PlatformVariant** - Platform-specific formatted listing
6. **UserEdit** - Tracks user modifications
7. **FinalListingPayload** - Complete listing ready for export

### Architecture Established

```
Layer 1: Product (SOPs, Contracts, Edge Cases)
Layer 2: Orchestration (Backend API, Validation, Routing)
Layer 3: Engines (ImageService, VisionService, ListingService, PricingService, PlatformFormatter)
```

### Non-Goals Locked

Explicitly out of scope for v1:
- ❌ Auto-posting to marketplaces
- ❌ Inventory management
- ❌ Accounting/profit tracking
- ❌ Team accounts
- ❌ Shipping labels
- ❌ Cross-post automation

---

## 2026-01-25 - Phase 2: Environment Setup

### Completed
- [x] Node.js v22.20.0 verified
- [x] pnpm 10.28.1 installed
- [x] Backend initialized (Express + TypeScript)
- [x] Frontend initialized (Expo + React Native)
- [x] Supabase client configured
- [x] OpenRouter client configured
- [x] Handshake tests created
- [x] Supabase project created with credentials
- [x] OpenRouter API key obtained
- [x] Storage bucket `item-photos` created
- [x] All handshake tests passing

### Tech Stack Configured

| Component | Technology | Status |
|-----------|------------|--------|
| Backend | Express + TypeScript | ✅ Ready |
| Frontend | Expo + React Native | ✅ Ready |
| Database | Supabase PostgreSQL | ✅ Connected |
| Storage | Supabase Storage | ✅ Connected |
| AI - Vision | OpenRouter (Gemini 3 Pro) | ✅ Connected |
| AI - Text | OpenRouter (Gemini 3 Flash) | ✅ Connected |

### Project Structure

```
ResellrAi/
├── product_scope.md
├── data_schema.md
├── architecture.md
├── constitution.md
├── progress.md
├── backend/
│   ├── src/
│   │   ├── index.ts           # Express server
│   │   ├── config/env.ts      # Environment validation
│   │   ├── routes/health.ts   # Health check endpoints
│   │   ├── services/
│   │   │   ├── supabase.ts    # Supabase client
│   │   │   └── openrouter.ts  # OpenRouter client
│   │   └── tests/handshake/   # Connectivity tests
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── App.tsx                # Status check screen
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client
│   │   └── api.ts             # Backend API client
│   ├── .env.example
│   └── package.json
└── services/
    └── README.md              # Placeholder for Phase 3
```

### Handshake Test Results

All connectivity tests passed:
- ✅ Supabase connection successful
- ✅ Storage bucket `item-photos` accessible
- ✅ Storage upload/download working
- ✅ OpenRouter text model responding
- ✅ OpenRouter vision model responding

---

## 2026-01-25 - Phase 3: Core Feature Build

### Completed
- [x] TypeScript types and Zod validators from data_schema.md
- [x] VisionService for AI image analysis
- [x] ListingGeneratorService for title/description generation
- [x] PricingService for price estimation
- [x] PlatformFormatterService for eBay/Poshmark formatting
- [x] Database schema for listings table
- [x] API endpoints: generate, get, update, regenerate, export
- [x] Mobile UI: Home, Camera, Generating, Preview, Export screens
- [x] Integration test for full listing flow

### Layer 3 Services Built

| Service | File | Purpose |
|---------|------|---------|
| VisionService | `backend/src/services/vision.ts` | AI image analysis with confidence scores |
| ListingGeneratorService | `backend/src/services/listing-generator.ts` | Title/description generation |
| PricingService | `backend/src/services/pricing.ts` | Price range estimation |
| PlatformFormatterService | `backend/src/services/platform-formatter.ts` | eBay/Poshmark formatting |
| ListingsDB | `backend/src/services/listings-db.ts` | Database operations |

### API Endpoints Built

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/listings/generate` | POST | Generate listing from photos |
| `/api/v1/listings/:id` | GET | Get listing by ID |
| `/api/v1/listings/:id` | PATCH | Update listing fields |
| `/api/v1/listings/:id/regenerate` | POST | Regenerate specific field |
| `/api/v1/listings/:id/export` | POST | Mark as exported |
| `/api/v1/listings` | GET | Get recent listings |

### Mobile Screens Built

| Screen | File | Purpose |
|--------|------|---------|
| HomeScreen | `frontend/screens/HomeScreen.tsx` | Landing page with API status |
| CameraScreen | `frontend/screens/CameraScreen.tsx` | Photo capture and hints |
| GeneratingScreen | `frontend/screens/GeneratingScreen.tsx` | Loading state with progress |
| ListingPreviewScreen | `frontend/screens/ListingPreviewScreen.tsx` | View/edit listing |
| ExportScreen | `frontend/screens/ExportScreen.tsx` | Copy to clipboard |

### Setup Required Before Testing

1. **Create Database Table**
   Run the SQL in `backend/src/db/schema.sql` in Supabase SQL Editor

2. **Start Backend**
   ```
   cd backend
   pnpm dev
   ```

3. **Run Integration Test**
   ```
   cd backend
   pnpm test:integration
   ```

4. **Start Frontend**
   ```
   cd frontend
   npm start
   ```

### Next Steps: Phase 4 - Polish & Deploy

1. **Testing & Bug Fixes**
   - End-to-end testing with real photos
   - Error handling improvements
   - Performance optimization

2. **UI Polish**
   - Loading states
   - Error messages
   - Animations

3. **Deployment Preparation**
   - Production environment setup
   - CI/CD pipeline
   - Monitoring

---

## Log Format

### Entry Template

```markdown
## YYYY-MM-DD - [Summary]

### Completed
- [x] Task completed

### In Progress
- [ ] Task in progress

### Decisions Made
| Decision | Choice | Rationale |

### Issues Encountered
| Issue | Resolution | Status |

### Next Steps
1. Immediate next task
```

### Status Icons

- ✅ Complete
- 🚧 In Progress
- ❌ Blocked
- ⏸️ Paused

---

## Version History

| Version | Date | Milestone |
|---------|------|-----------|
| 0.1 | 2026-01-25 | Protocol 0 Complete - Foundation documents established |
| 0.2 | 2026-01-25 | Phase 2 - Backend & Frontend initialized |
| 0.3 | 2026-01-25 | Phase 2 Complete - All services connected, handshake tests passing |
| 0.4 | 2026-01-25 | Phase 3 Complete - Core features built (services, API, mobile UI) |

---

## 2026-01-26 - eBay Integration Phase Start

### Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Protocol Initialization | ✅ Complete |
| Phase 1 | Discovery Questions | ✅ Complete |
| Phase 2 | Data-First Schemas | ✅ Complete |
| Phase 3 | OAuth Implementation | ✅ Complete |
| Phase 4 | Pricing Comps Engine | ✅ Complete |
| Phase 5 | List on eBay Flow | ✅ Complete |
| Phase 6 | Failure Handling + Compliance | ✅ Complete |

### eBay Integration: APPROVED ✅

### Documents Created

| Document | Purpose | Status |
|----------|---------|--------|
| `ebay_scope.md` | Features in/out of scope | Created, awaiting discovery answers |
| `ebay_schemas.md` | Canonical JSON schemas | Draft complete |
| `ebay_architecture.md` | Services, flows, invariants | Draft complete |
| `progress.md` | Updated with eBay phase | Updated |

### Checklist

- [x] Create ebay_scope.md
- [x] Create ebay_schemas.md
- [x] Create ebay_architecture.md
- [x] Update progress.md with eBay phase
- [x] Answer Phase 1 discovery questions
- [x] Create Zod schemas (`backend/src/types/ebay-schemas.ts`)
- [x] Create DB migrations (`backend/src/db/ebay-migrations.sql`)
- [x] Implement OAuth services (`backend/src/services/ebay/`)
- [x] Implement OAuth routes (`backend/src/routes/ebay.ts`)
- [x] Add environment config for eBay
- [x] Add OAuth tests
- [x] Implement Comps Service (`backend/src/services/ebay/comps.ts`)
- [x] Add comps route (`GET /api/v1/ebay/comps`)
- [x] Add comps tests
- [x] Implement Policy Service (`backend/src/services/ebay/policy.ts`)
- [x] Implement Listing Service (`backend/src/services/ebay/listing.ts`)
- [x] Add policy route (`GET /api/v1/ebay/policies`)
- [x] Add publish routes (`POST .../publish`, `GET .../status`)
- [x] Add listing tests
- [x] Implement Error Handling module (`backend/src/services/ebay/errors.ts`)
- [x] Add comprehensive integration tests
- [x] Add test runner (`backend/src/tests/ebay/run-all.ts`)
- [ ] **FINAL GATE: User approval of complete eBay integration**

### Phase 2 Implementation Details

**Zod Schemas Created** (`backend/src/types/ebay-schemas.ts`):
- OAuth: `EbayAuthStartRequest`, `EbayAuthStartResponse`, `EbayAuthCallbackPayload`, `EbayTokenSet`, `EbayConnectedAccount`
- Comps: `EbayCompsQuery`, `EbayCompItem`, `EbayCompsStats`, `EbayCompsResult`
- Listing: `EbayListingDraft`, `EbayInventoryItemPayload`, `EbayOfferPayload`, `EbayPublishResult`
- Policy: `EbayFulfillmentPolicy`, `EbayPaymentPolicy`, `EbayReturnPolicy`, `EbayUserPolicies`
- Error: `EbayApiError`
- DB Records: `EbayAccountRecord`, `EbayAuthStateRecord`, `ListingEbayFields`
- Constants: `EBAY_API_URLS`, `EBAY_REQUIRED_SCOPES`, `COMPS_CONFIDENCE_THRESHOLDS`
- Helpers: `getCompsConfidence()`, `calculateMedian()`, `calculateAverage()`, `generateEbaySku()`, `tokenNeedsRefresh()`, `getCompsSourceMessage()`

**Database Migrations** (`backend/src/db/ebay-migrations.sql`):
- Extended `listings` table: `pricing_comps`, `ebay_publish`, `ebay_offer_id`, `ebay_sku`, `ebay_listing_id`, `ebay_published_at`
- New `ebay_accounts` table: user OAuth tokens (encrypted), eBay user info, status tracking
- New `ebay_auth_states` table: CSRF protection for OAuth flow
- Cleanup functions: `cleanup_expired_ebay_auth_states()`, `mark_expired_ebay_accounts()`
- Indexes for performance
- RLS policies (commented, ready for auth integration)

### Phase 3 Implementation Details

**Services Created** (`backend/src/services/ebay/`):

| File | Purpose |
|------|---------|
| `token-crypto.ts` | AES-256-GCM encryption for OAuth tokens |
| `client.ts` | eBay API HTTP client with retry logic |
| `auth.ts` | OAuth service (start, callback, refresh, disconnect) |
| `index.ts` | Module exports |

**Routes Created** (`backend/src/routes/ebay.ts`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/ebay/status` | GET | Check eBay integration status |
| `/api/v1/ebay/oauth/start` | GET | Start OAuth flow, return auth URL |
| `/api/v1/ebay/oauth/callback` | GET | Handle eBay callback, exchange code for tokens |
| `/api/v1/ebay/account` | GET | Get connected account status (safe for client) |
| `/api/v1/ebay/account` | DELETE | Disconnect eBay account |

**Environment Config Updated** (`backend/src/config/env.ts`):
- `EBAY_CLIENT_ID` - eBay app client ID
- `EBAY_CLIENT_SECRET` - eBay app client secret
- `EBAY_RUNAME` - eBay redirect URL name
- `EBAY_ENVIRONMENT` - 'sandbox' or 'production'
- `EBAY_TOKEN_ENCRYPTION_KEY` - 32-byte hex key for AES-256-GCM
- `APP_BASE_URL` - Server public URL for callbacks
- `MOBILE_DEEP_LINK_SCHEME` - Mobile app deep link scheme

**Tests Created** (`backend/src/tests/ebay/`):
- `token-crypto.test.ts` - Encryption/decryption tests
- `auth.test.ts` - OAuth URL and client tests

**Security Features:**
- Tokens encrypted with AES-256-GCM before storage
- State parameter for CSRF protection
- Tokens never sent to mobile client
- Automatic token refresh before expiry
- Replay attack prevention (states marked as used)

### Phase 4 Implementation Details

**Service Created** (`backend/src/services/ebay/comps.ts`):

| Component | Purpose |
|-----------|---------|
| `EbayCompsService` | Main service class |
| `getComps()` | Fetch comparables with caching |
| `fetchSoldComps()` | Attempt sold data (requires Marketplace Insights API) |
| `fetchActiveComps()` | Fetch active listings via Browse API |
| `calculateStats()` | Compute median, avg, min, max |
| In-memory cache | 15-minute TTL, auto-cleanup |

**Route Added** (`backend/src/routes/ebay.ts`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/ebay/comps` | GET | Get pricing comparables |

**Query Parameters:**
- `keywords` (required): Search terms
- `category_id` (optional): eBay category filter
- `condition` (optional): NEW, LIKE_NEW, VERY_GOOD, GOOD, ACCEPTABLE
- `brand` (optional): Brand filter
- `limit` (optional): Max results (default: 20, max: 50)

**Response Structure:**
```json
{
  "source": "sold" | "active" | "none",
  "source_message": "Based on X recently sold items",
  "stats": {
    "median": 45.00,
    "average": 47.50,
    "min": 25.00,
    "max": 75.00,
    "sample_size": 15,
    "confidence": "high" | "medium" | "low" | "none"
  },
  "limitations": ["Prices based on active listings..."],
  "data": [{ item_id, title, price, condition, item_url }],
  "cached": false
}
```

**Key Design Decisions:**
1. Source transparency: Always labeled (sold/active/none)
2. Sold data not available via public Browse API - requires Marketplace Insights API
3. Falls back to active listings with clear UI messaging
4. Statistics always calculated deterministically
5. Caching prevents excessive API calls (15-min TTL)
6. Confidence levels based on sample size

**Tests Created:**
- `backend/src/tests/ebay/comps.test.ts` - Statistics and validation tests

### Phase 5 Implementation Details

**Services Created:**

| File | Purpose |
|------|---------|
| `backend/src/services/ebay/policy.ts` | Fetch user's fulfillment, payment, return policies |
| `backend/src/services/ebay/listing.ts` | Full eBay publish flow (inventory → offer → publish) |

**Routes Added:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/ebay/policies` | GET | Get user's eBay business policies |
| `/api/v1/ebay/listings/:id/publish` | POST | Publish listing to eBay |
| `/api/v1/ebay/listings/:id/status` | GET | Get eBay listing status |

**Publish Flow (3-step eBay Inventory API):**

```
1. PUT /sell/inventory/v1/inventory_item/{sku}
   → Creates/replaces inventory item with product details

2. POST /sell/inventory/v1/offer
   → Creates offer with pricing, policies, category
   → Returns offerId

3. POST /sell/inventory/v1/offer/{offerId}/publish
   → Makes listing live on eBay
   → Returns listingId
```

**EbayPolicyService Features:**
- Fetches fulfillment policies (shipping options)
- Fetches payment policies (payment methods)
- Fetches return policies (return terms)
- 1-hour cache to reduce API calls
- Validates user has all required policies

**EbayListingService Features:**
- Generates unique SKU per listing (RSAI-{id}-{timestamp})
- Converts internal listing format to eBay Inventory API format
- Maps conditions (new, like_new, good, fair, poor → eBay conditions)
- Converts item specifics to eBay aspects format
- Full error handling with detailed error codes
- Returns listing URL on success

**Publish Request Format:**
```json
{
  "policies": {
    "fulfillment_policy_id": "123",
    "payment_policy_id": "456",
    "return_policy_id": "789"
  },
  "price_override": 45.00,
  "listing_data": {
    "listing_draft": { ... },
    "photo_urls": [...],
    "pricing_suggestion": { ... }
  }
}
```

**Publish Response Format:**
```json
{
  "success": true,
  "listing_id": "123456789",
  "offer_id": "offer123",
  "sku": "RSAI-12345-ABC123",
  "listing_url": "https://www.ebay.com/itm/123456789",
  "published_at": "2026-01-26T...",
  "warnings": []
}
```

**Tests Created:**
- `backend/src/tests/ebay/listing.test.ts` - SKU generation, format tests

### Phase 6 Implementation Details

**Error Handling Utilities** (`backend/src/services/ebay/errors.ts`):

| Export | Purpose |
|--------|---------|
| `EBAY_ERROR_CODES` | All error code constants (22 codes) |
| `EBAY_ERROR_MESSAGES` | Human-readable messages for each code |
| `buildEbayError()` | Build structured EbayApiError response |
| `createErrorResponse()` | Build Express-compatible error response |
| `isRetryableError()` | Check if error can be retried |
| `requiresReauth()` | Check if error needs re-authentication |
| `classifyEbayError()` | Map eBay/HTTP errors to internal codes |
| `logEbayError()` | Structured error logging |

**Error Categories:**

| Category | Codes | Recovery Action |
|----------|-------|-----------------|
| Authentication | AUTH_REQUIRED, TOKEN_EXPIRED, OAUTH_* | `reauth` |
| Rate Limiting | RATE_LIMITED | `retry` (with delay) |
| Network | NETWORK_ERROR, TIMEOUT_ERROR | `retry` |
| Validation | VALIDATION_ERROR, LISTING_INVALID | `none` (fix input) |
| Configuration | EBAY_NOT_CONFIGURED | `contact_support` |
| eBay API | EBAY_API_ERROR, *_FAILED | `retry` |

**Structured Error Response Format:**
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please wait and try again.",
    "ebay_error_id": "15007"
  },
  "recovery": {
    "action": "retry",
    "retry_after": 60,
    "message": "Please try again in a few moments"
  },
  "request_id": "req_abc123",
  "timestamp": "2026-01-26T..."
}
```

**Comprehensive Tests** (`backend/src/tests/ebay/`):

| File | Tests |
|------|-------|
| `token-crypto.test.ts` | Encryption/decryption, IV randomness, tampering detection |
| `auth.test.ts` | OAuth URLs, scopes, client methods |
| `comps.test.ts` | Statistics calculation, confidence levels, query validation |
| `listing.test.ts` | SKU generation, condition mapping, draft building |
| `integration.test.ts` | OAuth flows, token refresh, error handling, rate limits |
| `run-all.ts` | Test runner for all eBay tests |

**Test Coverage:**
- 22 integration tests covering all critical paths
- OAuth start URL format validation
- Token refresh timing logic
- All error codes have messages
- Retryable vs non-retryable classification
- HTTP status to error code mapping
- Comps query validation (keywords, conditions, limits)
- Publish result validation (success and error cases)
- Rate limit retry_after presence

**Run All Tests:**
```bash
cd backend
npx tsx src/tests/ebay/run-all.ts
```

### Discovery Answers (Phase 1)

| Question | Decision |
|----------|----------|
| Environment | Sandbox first |
| Pricing Truth | Sold prices preferred, fallback to active with clear UI indication |
| Regions | US only (EBAY_US) |
| Listing Type | Fixed price only |
| Category Scope | Generic best-effort mapping |
| Policies | Users manage in eBay directly |
| Security | Anonymous for basic features, login required for eBay connection |

### Key Constraints Established

1. OAuth tokens server-side only
2. Authorization Code flow exclusively
3. No scraping eBay pages
4. Pricing source always labeled (sold/active/none)
5. Never fabricate sold prices
6. All errors return structured JSON
7. Sandbox environment for initial development
8. Fixed price listings only (no auctions v1)
9. US marketplace only (EBAY_US)

---

*Update this log after every meaningful task. Include what changed, what broke, and what was fixed.*

---

## 2026-01-30 - eBay Integration: Comps UI + Enhanced Publish - COMPLETE

### Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Documentation | ✅ Complete |
| Phase 1 | Backend Enhancements | ✅ Complete |
| Phase 2 | Frontend - Comps UI | ✅ Complete |
| Phase 3 | Frontend - Enhanced Publish UX | ✅ Complete |
| Phase 4 | Category Selection | ✅ Complete |

### Phase 0: Documentation - COMPLETE

**Created Files:**
- `architecture/ebay_integration.md` - Comps algorithm, publish workflow, error mapping
- `architecture/api_contracts.md` - JSON request/response shapes for all endpoints
- `task_plan.md` - Implementation checklist with acceptance criteria
- `findings.md` - Constraints, edge cases, eBay API limitations

**Key Decisions:**
- All comps will display "Active listings (not sold prices)" disclaimer
- 15-minute cache TTL for comps, 24-hour for categories
- Step-by-step publish progress with error recovery actions

### Phase 1: Backend Enhancements - COMPLETE

#### 1.1 Taxonomy API
- [x] Created `backend/src/services/ebay/taxonomy.ts` service
- [x] Added `GET /api/v1/ebay/categories/suggest` endpoint
- [x] 24-hour caching for category suggestions
- [x] Exported from `backend/src/services/ebay/index.ts`

#### 1.2 Comps Enhancement
- [x] Added `shipping_cost` and `total_cost` to `EbayCompItem` schema
- [x] Added `cache_age` to `EbayCompsResult` schema
- [x] Updated comps service to parse shipping costs from eBay response

#### 1.3 Publish Enhancement
- [x] Added `EbayPublishStep` schema with step/name/status tracking
- [x] Modified `publishListing()` to track progress through steps
- [x] Added `steps` array to `EbayPublishResult` response
- [x] Added `action` field to error responses for recovery guidance

### Phase 2: Frontend - Comps UI - COMPLETE

**Created:**
- `frontend/screens/CompsScreen.tsx` - New screen with:
  - "Active listings (not sold prices)" disclaimer banner
  - Stats card: median (prominent), average, min, max
  - Sample size and confidence indicator
  - FlatList of top 10 comps with thumbnails
  - "Use this price" button per item
  - "Use Median Price" button
  - Condition filter chips
  - Refine search input

- `frontend/lib/api.ts` updates:
  - Added `EbayCompItem`, `CompsFilters`, `CategorySuggestion` types
  - Enhanced `getEbayComps()` with filter support
  - Added `suggestCategory()` function

### Phase 3: Frontend - Enhanced Publish UX - COMPLETE

**Created:**
- `frontend/components/PublishProgress.tsx` - 3-step progress indicator:
  - Visual indicators for pending/in_progress/complete/failed
  - Shows SKU, Offer ID, Listing ID as steps complete
  - Error display for failed steps

**Modified:**
- `frontend/screens/ExportScreen.tsx`:
  - Integrated PublishProgress during publish
  - Added pre-publish validation (category required)
  - Enhanced success state with SKU and Listing ID display
  - Error mapping with actionable guidance messages
  - Warning display when category not selected

### Phase 4: Category Selection - COMPLETE

**Created:**
- `frontend/components/CategoryPicker.tsx`:
  - Shows current category with "Change" button
  - Modal with search/browse for eBay categories
  - Displays category path and relevance scores
  - Auto-loads suggestions from item title/brand

**Modified:**
- `frontend/screens/ListingPreviewScreen.tsx`:
  - Added CategoryPicker component
  - Added "View Price Comparables" button
  - Passes selected category to Export screen
  - Navigation to CompsScreen with price callback

- `frontend/App.tsx`:
  - Added CompsScreen to navigation stack

### Acceptance Criteria - ALL MET

- [x] Comps UI shows "Active listings (not sold prices)" disclaimer
- [x] Stats display: median, average, min, max, sample size, confidence
- [x] Top 10 comps with thumbnail, title, price, condition
- [x] Category auto-suggested from AI, user can override
- [x] Publish shows step-by-step progress (1/3, 2/3, 3/3)
- [x] Errors mapped to actionable user messages
- [x] Success shows listing URL

### Files Modified/Created

**Backend:**
| File | Change |
|------|--------|
| `backend/src/services/ebay/taxonomy.ts` | NEW - Category suggestion service |
| `backend/src/services/ebay/index.ts` | Export taxonomy service |
| `backend/src/services/ebay/comps.ts` | Add shipping_cost, total_cost, cache_age |
| `backend/src/services/ebay/listing.ts` | Add step progress tracking |
| `backend/src/routes/ebay.ts` | Add /categories/suggest endpoint |
| `backend/src/types/ebay-schemas.ts` | Add EbayPublishStep, update EbayCompItem |

**Frontend:**
| File | Change |
|------|--------|
| `frontend/screens/CompsScreen.tsx` | NEW - Comps display screen |
| `frontend/components/PublishProgress.tsx` | NEW - 3-step progress indicator |
| `frontend/components/CategoryPicker.tsx` | NEW - Category selection |
| `frontend/screens/ListingPreviewScreen.tsx` | Add comps button, category picker |
| `frontend/screens/ExportScreen.tsx` | Enhanced publish UX with progress |
| `frontend/lib/api.ts` | Add types and functions |
| `frontend/App.tsx` | Add CompsScreen to navigation |

**Documentation:**
| File | Change |
|------|--------|
| `architecture/ebay_integration.md` | NEW - Workflow SOPs |
| `architecture/api_contracts.md` | NEW - API contracts |
| `task_plan.md` | NEW - Implementation checklist |
| `findings.md` | NEW - Constraints & discoveries |
