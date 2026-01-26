# eBay Integration Architecture

**Document Version:** 1.2
**Created:** 2026-01-26
**Updated:** 2026-01-26
**Status:** IMPLEMENTED

**Scope Constraints Applied:**
- Environment: Sandbox first
- Marketplace: EBAY_US only
- Format: Fixed price only (no auctions)
- Policies: User-managed in eBay (fetch only, no create/edit)

**Implementation Files:**
- Services: `backend/src/services/ebay/` (auth, comps, policy, listing, client, errors)
- Routes: `backend/src/routes/ebay.ts`
- Schemas: `backend/src/types/ebay-schemas.ts`
- Tests: `backend/src/tests/ebay/`

---

## Overview

This document defines the architecture for eBay integration in ResellrAI, covering OAuth authentication, pricing comparables, and direct listing to eBay.

---

## 1. Services and Responsibilities

### Service Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Mobile)                           │
│  - Connect eBay button                                              │
│  - Connected status display                                         │
│  - Pricing comps UI                                                 │
│  - Publish to eBay flow                                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS only
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Backend API (Express)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │  EbayAuthService │  │ EbayCompsService│  │EbayListingService│    │
│  │                 │  │                 │  │                 │     │
│  │ - OAuth start   │  │ - Query comps   │  │ - Create item   │     │
│  │ - Callback      │  │ - Parse results │  │ - Create offer  │     │
│  │ - Token refresh │  │ - Compute stats │  │ - Publish       │     │
│  │ - Disconnect    │  │ - Cache results │  │ - Status check  │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
│           │                    │                    │              │
│           └────────────────────┼────────────────────┘              │
│                                │                                   │
│                    ┌───────────▼───────────┐                       │
│                    │   EbayApiClient       │                       │
│                    │                       │                       │
│                    │ - HTTP client         │                       │
│                    │ - Auth headers        │                       │
│                    │ - Rate limiting       │                       │
│                    │ - Error handling      │                       │
│                    │ - Retry logic         │                       │
│                    └───────────┬───────────┘                       │
│                                │                                   │
└────────────────────────────────┼───────────────────────────────────┘
                                 │
                                 │ HTTPS
                                 ▼
                    ┌────────────────────────┐
                    │      eBay APIs         │
                    │                        │
                    │ - OAuth (identity)     │
                    │ - Browse API (comps)   │
                    │ - Inventory API (list) │
                    │ - Account API (policy) │
                    └────────────────────────┘
```

### Service Responsibilities

| Service | File | Responsibility |
|---------|------|----------------|
| **EbayAuthService** | `backend/src/services/ebay/auth.ts` | OAuth flow, token management, account connection |
| **EbayCompsService** | `backend/src/services/ebay/comps.ts` | Pricing comparables retrieval and statistics |
| **EbayListingService** | `backend/src/services/ebay/listing.ts` | Inventory item and offer management |
| **EbayApiClient** | `backend/src/services/ebay/client.ts` | Low-level HTTP client with auth and retry |
| **EbayPolicyService** | `backend/src/services/ebay/policy.ts` | Fulfillment, payment, return policy management |

---

## 2. Request/Response Flows

### 2.1 OAuth Flow (Connect eBay Account)

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Mobile  │     │ Backend  │     │  eBay    │     │ Database │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ GET /oauth/start               │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Generate state │                │
     │                │ Store state ──────────────────>│
     │                │                │                │
     │ { auth_url, state }            │                │
     │<───────────────│                │                │
     │                │                │                │
     │ Open browser to auth_url       │                │
     │─────────────────────────────────>                │
     │                │                │                │
     │                │   User grants permission       │
     │                │                │                │
     │ Redirect to callback           │                │
     │<─────────────────────────────────                │
     │                │                │                │
     │ GET /oauth/callback?code=X&state=Y              │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Validate state <───────────────│
     │                │                │                │
     │                │ POST /token (exchange code)    │
     │                │───────────────>│                │
     │                │                │                │
     │                │ { access_token, refresh_token }│
     │                │<───────────────│                │
     │                │                │                │
     │                │ Encrypt & store tokens ───────>│
     │                │                │                │
     │ Deep-link success page         │                │
     │<───────────────│                │                │
     │                │                │                │
```

### 2.2 Pricing Comps Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Mobile  │     │ Backend  │     │  eBay    │     │  Cache   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ GET /comps?keywords=X          │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Check cache ──────────────────>│
     │                │                │                │
     │                │ [Cache miss]   │                │
     │                │                │                │
     │                │ Browse API /search             │
     │                │───────────────>│                │
     │                │                │                │
     │                │ { items[] }    │                │
     │                │<───────────────│                │
     │                │                │                │
     │                │ Compute stats  │                │
     │                │ (median, avg, min, max)        │
     │                │                │                │
     │                │ Cache result ─────────────────>│
     │                │                │                │
     │ { source, data, stats, limitations }            │
     │<───────────────│                │                │
     │                │                │                │
```

### 2.3 Publish to eBay Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Mobile  │     │ Backend  │     │  eBay    │     │ Database │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ POST /listings/:id/publish     │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Load listing <────────────────│
     │                │                │                │
     │                │ Get user tokens <─────────────│
     │                │                │                │
     │                │ Refresh if expired            │
     │                │───────────────>│                │
     │                │<───────────────│                │
     │                │                │                │
     │                │ PUT /inventory_item/{sku}     │
     │                │───────────────>│                │
     │                │ 204 Created    │                │
     │                │<───────────────│                │
     │                │                │                │
     │                │ POST /offer    │                │
     │                │───────────────>│                │
     │                │ { offerId }    │                │
     │                │<───────────────│                │
     │                │                │                │
     │                │ POST /offer/{id}/publish      │
     │                │───────────────>│                │
     │                │ { listingId }  │                │
     │                │<───────────────│                │
     │                │                │                │
     │                │ Update listing ───────────────>│
     │                │                │                │
     │ { success, listing_url, listing_id }           │
     │<───────────────│                │                │
     │                │                │                │
```

---

## 3. API Endpoints

### OAuth Endpoints

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/v1/ebay/oauth/start` | - | `EbayAuthStartResponse` | User session |
| GET | `/api/v1/ebay/oauth/callback` | `code`, `state` | HTML redirect | None |
| GET | `/api/v1/ebay/account` | - | `EbayConnectedAccount` | User session |
| DELETE | `/api/v1/ebay/account` | - | `{ success: true }` | User session |

### Comps Endpoints

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/v1/ebay/comps` | `EbayCompsQuery` (query params) | `EbayCompsResult` | Optional |

### Listing Endpoints

| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| GET | `/api/v1/ebay/policies` | - | `{ fulfillment, payment, return }` | User session + eBay connected |
| POST | `/api/v1/listings/:id/ebay/publish` | `{ policies? }` | `EbayPublishResult` | User session + eBay connected |
| GET | `/api/v1/listings/:id/ebay/status` | - | `{ status, listing_url? }` | User session |

---

## 4. Invariants

### Security Invariants

1. **S1**: OAuth tokens MUST be stored server-side only
2. **S2**: Refresh tokens MUST be encrypted at rest
3. **S3**: Mobile app MUST NOT receive any token data
4. **S4**: All eBay API calls MUST originate from backend
5. **S5**: State parameter MUST be validated on OAuth callback
6. **S6**: Token refresh MUST happen automatically before expiry

### Data Invariants

1. **D1**: Pricing comps MUST indicate source ("sold" | "active" | "none")
2. **D2**: Stats MUST only be computed from actual returned data
3. **D3**: Limitations MUST be disclosed when data is incomplete
4. **D4**: Sold prices MUST NOT be fabricated if not available from API
5. **D5**: Category mapping MUST fail explicitly rather than guess

### Operational Invariants

1. **O1**: Rate limits MUST be respected with exponential backoff
2. **O2**: Failed token refresh MUST prompt user re-authentication
3. **O3**: Publish operations MUST be idempotent (using SKU as key)
4. **O4**: All eBay API errors MUST be logged with request context
5. **O5**: Timeouts MUST be configured (30s for sync, 120s for publish)

---

## 5. Error Handling Rules

### Error Categories

| Category | HTTP Status | Recovery Action | Example |
|----------|-------------|-----------------|---------|
| `AUTH_REQUIRED` | 401 | Prompt re-auth | Token expired, refresh failed |
| `AUTH_DENIED` | 403 | Prompt re-auth | User revoked access |
| `NOT_FOUND` | 404 | None | Listing not found |
| `VALIDATION` | 400 | Show field errors | Missing required field |
| `RATE_LIMITED` | 429 | Retry after delay | eBay rate limit hit |
| `EBAY_ERROR` | 502 | Retry or escalate | eBay API error |
| `SERVER_ERROR` | 500 | Retry once | Internal error |

### Retry Strategy

```typescript
const retryConfig = {
  maxRetries: 3,
  baseDelay: 1000,      // 1 second
  maxDelay: 30000,      // 30 seconds
  backoffFactor: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
};
```

### Error Response Format

All errors return standardized `EbayApiError`:

```json
{
  "error": {
    "code": "EBAY_RATE_LIMITED",
    "message": "eBay API rate limit exceeded. Please try again later.",
    "ebay_error_id": "15007"
  },
  "recovery": {
    "action": "retry",
    "retry_after": 60,
    "message": "Automatic retry in 60 seconds"
  },
  "request_id": "req_abc123",
  "timestamp": "2026-01-26T10:30:00Z"
}
```

---

## 6. Security Boundaries

### Token Encryption

```
┌─────────────────────────────────────────────────────┐
│                   Token Flow                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  eBay OAuth Response                                │
│       │                                             │
│       ▼                                             │
│  ┌─────────────────┐                                │
│  │ Encrypt with    │                                │
│  │ AES-256-GCM     │                                │
│  │ (env: TOKEN_KEY)│                                │
│  └────────┬────────┘                                │
│           │                                         │
│           ▼                                         │
│  ┌─────────────────┐     ┌─────────────────┐       │
│  │ Store encrypted │────>│ PostgreSQL      │       │
│  │ in database     │     │ ebay_accounts   │       │
│  └─────────────────┘     └─────────────────┘       │
│                                                     │
│  API Call Needed                                    │
│       │                                             │
│       ▼                                             │
│  ┌─────────────────┐                                │
│  │ Decrypt token   │                                │
│  │ in memory only  │                                │
│  └────────┬────────┘                                │
│           │                                         │
│           ▼                                         │
│  ┌─────────────────┐                                │
│  │ Use for API call│                                │
│  │ then discard    │                                │
│  └─────────────────┘                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Scope Boundaries

| Scope | Backend | Mobile |
|-------|---------|--------|
| Access Token | Read/Write | Never |
| Refresh Token | Read/Write | Never |
| User Connected Status | Read/Write | Read Only |
| eBay Username | Read/Write | Read Only |
| Listing Data | Read/Write | Read/Write |
| Comps Data | Read/Write | Read Only |

---

## 7. Caching Strategy

### Comps Cache

| Key Pattern | TTL | Storage |
|-------------|-----|---------|
| `comps:{keywords_hash}:{category}` | 15 min | In-memory + optional Redis |

### Policy Cache

| Key Pattern | TTL | Storage |
|-------------|-----|---------|
| `policies:{user_id}` | 1 hour | In-memory |

### Token Refresh Window

- Access token refresh: 5 minutes before expiry
- Proactive refresh on API call if within window

---

## 8. Logging Requirements

### Required Log Events

| Event | Level | Data |
|-------|-------|------|
| OAuth flow started | INFO | user_id, state |
| OAuth callback received | INFO | state, success |
| Token refreshed | INFO | user_id, new_expiry |
| Comps query executed | INFO | keywords, result_count, source, latency_ms |
| Listing published | INFO | listing_id, ebay_listing_id |
| eBay API error | ERROR | endpoint, status, error_code, request_id |
| Rate limit hit | WARN | endpoint, retry_after |

### Log Format

```json
{
  "timestamp": "2026-01-26T10:30:00Z",
  "level": "INFO",
  "event": "ebay.comps.query",
  "data": {
    "keywords": "nike air max",
    "category_id": "15709",
    "result_count": 15,
    "source": "active",
    "latency_ms": 342
  },
  "request_id": "req_abc123",
  "user_id": "user_xyz"
}
```

---

## 9. Environment Configuration

### Required Environment Variables

```bash
# eBay API Credentials
EBAY_CLIENT_ID=           # eBay app client ID
EBAY_CLIENT_SECRET=       # eBay app client secret
EBAY_RUNAME=              # eBay redirect URL name
EBAY_ENVIRONMENT=         # 'sandbox' or 'production'

# Token Encryption
EBAY_TOKEN_ENCRYPTION_KEY= # 32-byte hex key for AES-256-GCM

# eBay API URLs (derived from EBAY_ENVIRONMENT)
# Sandbox: api.sandbox.ebay.com
# Production: api.ebay.com
```

### URL Configuration

| Environment | Auth URL | API URL |
|-------------|----------|---------|
| **Sandbox (v1 default)** | `signin.sandbox.ebay.com` | `api.sandbox.ebay.com` |
| Production (future) | `signin.ebay.com` | `api.ebay.com` |

**Note:** v1 development uses Sandbox environment. Production switch requires:
1. eBay app review/approval
2. Environment variable change
3. New OAuth credentials

---

## 10. File Structure

```
backend/src/
├── routes/
│   └── ebay.ts                    # eBay route definitions
├── services/
│   └── ebay/
│       ├── index.ts               # Service exports
│       ├── auth.ts                # EbayAuthService
│       ├── comps.ts               # EbayCompsService
│       ├── listing.ts             # EbayListingService
│       ├── policy.ts              # EbayPolicyService
│       ├── client.ts              # EbayApiClient (HTTP layer)
│       └── token-crypto.ts        # Token encryption utilities
├── types/
│   └── ebay-schemas.ts            # Zod schemas for eBay types
├── db/
│   └── ebay-migrations.sql        # Database migrations
└── tests/
    └── ebay/
        ├── auth.test.ts           # OAuth flow tests
        ├── comps.test.ts          # Comps service tests
        ├── listing.test.ts        # Listing service tests
        └── client.test.ts         # API client tests
```

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-01-26 | 1.0 | Initial architecture draft | Integration Architect |

---

*Architecture is subject to refinement based on eBay API documentation review and implementation learnings.*
