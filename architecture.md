# ResellrAI System Architecture

**Version:** 1.0  
**Last Updated:** 2026-01-25  
**Status:** Canonical Architecture Document

---

## Overview

ResellrAI uses a strict 3-layer architecture that separates product logic, orchestration, and deterministic engines. This design ensures that probabilistic AI outputs are validated and constrained by deterministic business logic.

**Core Principle:**
> LLMs are probabilistic. Business logic must be deterministic.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LAYER 1: PRODUCT                                │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   User      │  │   Screen    │  │    API      │  │   Edge      │    │
│  │   Flows     │  │   SOPs      │  │  Contracts  │  │   Cases     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                         │
│  Rule: If logic changes, update the SOP before updating the code.       │
├─────────────────────────────────────────────────────────────────────────┤
│                       LAYER 2: ORCHESTRATION                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Backend API                               │   │
│  │                                                                  │   │
│  │   Routes data: Vision → LLM → Pricing → Platform → UI           │   │
│  │   Enforces: Validation, Schema Conformity, Error Handling       │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Rule: No business rules live in the frontend.                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         LAYER 3: ENGINES                                │
│                                                                         │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ │
│  │  Image    │ │  Vision   │ │  Listing  │ │  Pricing  │ │ Platform  │ │
│  │  Service  │ │  Service  │ │  Service  │ │  Service  │ │ Formatter │ │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘ │
│                                                                         │
│  Rule: Each service must be Atomic, Testable, Versioned.                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Product (SOPs & Contracts)

This layer contains **documentation-as-code**: the human-readable specifications that define how the system should behave.

### Contents

| Document | Purpose |
|----------|---------|
| `product_scope.md` | Vision, persona, MVP features, non-goals |
| `data_schema.md` | Canonical JSON schemas for all payloads |
| `constitution.md` | Product law and invariants |
| `architecture.md` | This document - system design |
| `progress.md` | Build log and decisions |

### Golden Rule

> **If logic changes, update the SOP before updating the code.**

This ensures documentation stays synchronized with implementation.

---

## Layer 2: Orchestration (Backend API)

The orchestration layer routes data between services and enforces business rules. It acts as the "traffic controller" for the system.

### Responsibilities

1. **Route data** between services in the correct sequence
2. **Validate inputs** against schemas before processing
3. **Enforce schema conformity** on all outputs
4. **Handle errors** gracefully with meaningful responses
5. **Enforce rate limits** and usage quotas
6. **Authenticate** requests (after first-use flow)

### API Endpoints (v1)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/listings/generate` | POST | Generate listing from photos | No (first 5) |
| `/api/v1/listings/:id` | GET | Get listing draft | Yes |
| `/api/v1/listings/:id` | PATCH | Update listing fields | Yes |
| `/api/v1/listings/:id/regenerate` | POST | Regenerate specific field | Yes |
| `/api/v1/listings/:id/export` | POST | Export for platform | Yes |
| `/api/v1/platforms/:platform/format` | POST | Format listing for platform | Yes |
| `/api/v1/user/usage` | GET | Get usage stats | Yes |

### Request Flow

```
Client Request
     │
     ▼
┌─────────────────┐
│  Auth Middleware │ ──► Check token (skip for first 5 listings)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Schema Validator │ ──► Validate against data_schema.md
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Rate Limiter    │ ──► Enforce usage quotas
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Route Handler   │ ──► Call appropriate services
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Response Builder│ ──► Format response, add metadata
└────────┬────────┘
         │
         ▼
   Client Response
```

### Business Logic Rules

All business logic lives in this layer, NOT in the frontend:

- Usage quota enforcement (5 free listings/month)
- Confidence threshold logic (when to require confirmation)
- Price range validation
- Platform-specific character limits
- Export eligibility checks

---

## Layer 3: Engines (Services)

Deterministic, atomic services that perform specific tasks. Each service has a single responsibility and is independently testable.

### Service Definitions

#### 1. ImageService

**Purpose:** Handle photo upload, compression, and storage.

```
Input:  Raw photo data (base64 or multipart)
Output: Stored photo URLs

Responsibilities:
- Validate image format (JPEG, PNG, HEIC)
- Compress to target size (< 2MB)
- Generate thumbnails
- Upload to cloud storage
- Return accessible URLs
```

**Interface:**
```typescript
interface ImageService {
  upload(photos: Buffer[]): Promise<string[]>;    // Returns URLs
  compress(photo: Buffer): Promise<Buffer>;
  validate(photo: Buffer): ValidationResult;
  delete(urls: string[]): Promise<void>;
}
```

---

#### 2. VisionService

**Purpose:** AI image analysis and attribute detection.

```
Input:  ItemInput (photos + optional hints)
Output: VisionOutput (detected attributes with confidence)

Responsibilities:
- Send photos to vision AI (e.g., GPT-4V, Claude Vision)
- Parse raw labels into structured attributes
- Calculate confidence scores
- Apply user hints as context
- Never fabricate attributes (return null if unknown)
```

**Interface:**
```typescript
interface VisionService {
  analyze(input: ItemInput): Promise<VisionOutput>;
  parseLabels(rawLabels: string[]): Attribute[];
  calculateConfidence(detection: RawDetection): number;
}
```

**AI Constraints:**
- Must return `null` for brand if confidence < 0.60
- Must never claim authenticity
- Must expose confidence for all detections

---

#### 3. ListingGeneratorService

**Purpose:** Generate title and description via LLM.

```
Input:  VisionOutput + platform
Output: ListingDraft

Responsibilities:
- Generate SEO-optimized title
- Generate compelling description
- Format for target platform character limits
- Include all detected attributes
- Use neutral language for uncertain attributes
```

**Interface:**
```typescript
interface ListingGeneratorService {
  generate(vision: VisionOutput, platform: Platform): Promise<ListingDraft>;
  regenerateField(draft: ListingDraft, field: string): Promise<string>;
}
```

**Prompt Constraints:**
- Never use words: "authentic", "genuine", "rare", "valuable", "investment"
- Always include disclaimer for condition
- Prefer factual descriptions over marketing hype

---

#### 4. PricingService

**Purpose:** Estimate price range based on item attributes.

```
Input:  VisionOutput + ListingDraft
Output: PricingSuggestion

Responsibilities:
- Query pricing data sources
- Calculate low/mid/high price range
- Generate explanation of pricing basis
- Include confidence score
- Always include disclaimer
```

**Interface:**
```typescript
interface PricingService {
  estimate(vision: VisionOutput, draft: ListingDraft): Promise<PricingSuggestion>;
  getPricingBasis(attributes: Attribute[]): string;
}
```

**Constraints:**
- Must always include disclaimer
- Confidence should reflect data quality
- Never claim guaranteed sale price

---

#### 5. PlatformFormatterService

**Purpose:** Format listings for specific marketplaces.

```
Input:  ListingDraft + target platform
Output: PlatformVariant

Responsibilities:
- Apply platform-specific title limits
- Format description (plain/HTML)
- Map category to platform category ID
- Separate required vs optional attributes
- Validate against platform rules
```

**Interface:**
```typescript
interface PlatformFormatterService {
  format(draft: ListingDraft, platform: Platform): Promise<PlatformVariant>;
  validateTitle(title: string, platform: Platform): ValidationResult;
  mapCategory(category: string, platform: Platform): string;
}
```

**Platform Specifications:**

| Platform | Title Limit | Description Format | Notes |
|----------|-------------|-------------------|-------|
| eBay | 80 chars | HTML | Specific category IDs required |
| Poshmark | 80 chars | Plain text | Brand validation required |

---

## Core Data Flow

The complete flow from photo to exportable listing:

```
┌─────────┐
│  User   │
│ Photos  │
└────┬────┘
     │
     ▼
┌─────────────┐     ┌─────────────┐
│ ImageService│────►│ Cloud       │
│ (compress,  │     │ Storage     │
│  upload)    │     └─────────────┘
└──────┬──────┘
       │ photo URLs
       ▼
┌─────────────┐
│VisionService│ ◄─── Vision AI API
│ (analyze)   │
└──────┬──────┘
       │ VisionOutput
       ▼
┌─────────────────┐
│ListingGenerator │ ◄─── LLM API
│   Service       │
└────────┬────────┘
         │ ListingDraft
         ▼
┌─────────────┐
│PricingService│ ◄─── Pricing Data
└──────┬──────┘
       │ PricingSuggestion
       ▼
┌───────────────────┐
│PlatformFormatter  │
│    Service        │
└────────┬──────────┘
         │ PlatformVariant
         ▼
┌─────────────┐
│   User UI   │ ──► Edit/Confirm
└──────┬──────┘
       │
       ▼
┌────────────────┐
│FinalListingPayload│ ──► Export/Copy
└────────────────┘
```

### Timing Budget (60-second target)

| Step | Target Time | Notes |
|------|-------------|-------|
| Image upload + compress | 5s | Parallel upload |
| Vision analysis | 15s | Primary bottleneck |
| Listing generation | 10s | LLM call |
| Pricing estimation | 5s | Can run parallel with generation |
| Platform formatting | 2s | Fast, deterministic |
| UI render | 3s | Initial render |
| **Total** | **40s** | 20s buffer for network variance |

---

## Error Handling

### Error Categories

| Category | HTTP Code | User Message | Action |
|----------|-----------|--------------|--------|
| Validation | 400 | "Please check your input" | Show field errors |
| Auth | 401 | "Please sign in" | Redirect to login |
| Quota | 429 | "Monthly limit reached" | Show upgrade CTA |
| AI Failure | 503 | "Generation temporarily unavailable" | Retry with backoff |
| Server | 500 | "Something went wrong" | Log, alert, retry |

### Retry Strategy

```
AI Service Calls:
- Max retries: 3
- Backoff: Exponential (1s, 2s, 4s)
- Timeout: 30s per call

If all retries fail:
- Return partial result if possible
- Mark fields as "Unable to generate"
- Allow manual input
```

---

## Technology Stack (Recommended)

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | Expo / React Native | Cross-platform, rapid iteration |
| Backend | Node.js + Express or Hono | Fast, TypeScript support |
| Database | PostgreSQL + Prisma | Relational data, type safety |
| Storage | Cloudflare R2 or AWS S3 | Cost-effective image storage |
| Auth | Clerk or Supabase Auth | Quick setup, mobile SDKs |
| Vision AI | OpenAI GPT-4V or Claude | Best-in-class vision |
| LLM | OpenAI GPT-4 or Claude | High-quality text generation |
| Hosting | Vercel or Railway | Easy deployment |

---

## Invariants

These architectural rules must never be violated:

1. **UI is projection of data, never source of truth**
   - All state comes from backend
   - Frontend never computes business logic

2. **All services must be atomic**
   - Each service does one thing
   - No service depends on another's internal state

3. **Schema conformity is mandatory**
   - All inputs validated against `data_schema.md`
   - All outputs conform to defined schemas

4. **AI output is never trusted directly**
   - All AI output goes through validation
   - Confidence scores are required
   - User confirmation for critical fields

5. **Errors must be recoverable**
   - Partial results are better than failures
   - Manual input fallback always available
