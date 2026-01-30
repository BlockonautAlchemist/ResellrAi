# eBay Integration Architecture

## Overview

This document describes the eBay integration for ResellrAI, covering:
1. Comps (pricing comparables) algorithm
2. Publish workflow
3. Category suggestion system
4. Error mapping and recovery

---

## 1. Comps Algorithm

### Data Source

**Active Listings Only** - eBay's Marketplace Insights API (which provides sold data) is restricted to approved partners. ResellrAI uses the Browse API to fetch active listings as comparables.

### Query Strategy

```
Input: keywords, category?, condition?, brand?, marketplace (default: EBAY_US)
Output: Top 10 comparable items + statistics
```

### Filtering Logic

1. **Base Query**: Use item title/keywords from AI vision analysis
2. **Category Filter**: Apply eBay category ID if provided
3. **Condition Filter**: Map internal condition to eBay condition values
4. **Brand Filter**: Include brand in search query when available

### Statistics Calculation

```typescript
// From the returned items, calculate:
median: number    // Middle price point
average: number   // Mean price
min: number       // Lowest price
max: number       // Highest price
sampleSize: number // Number of items analyzed
```

### Confidence Levels

| Level | Sample Size | Meaning |
|-------|-------------|---------|
| HIGH | 10+ items | Reliable price guidance |
| MEDIUM | 5-9 items | Reasonable estimate |
| LOW | 1-4 items | Limited data, use caution |
| NONE | 0 items | No comparable items found |

### Caching Strategy

- **TTL**: 15 minutes for comps queries
- **Cache Key**: `comps:{keywords}:{categoryId}:{condition}:{brand}:{marketplace}`
- **Response Includes**: `cached: boolean`, `cacheAge?: number` (seconds)

### Limitations Disclosure

All comps responses include:
```json
{
  "source": "active",
  "limitations": "Prices based on active listings, not sold items. Actual sale prices may vary."
}
```

---

## 2. Publish Workflow

### Three-Step Process

```
[1. Create Inventory] → [2. Create Offer] → [3. Publish Offer]
```

#### Step 1: Create Inventory Item

**Endpoint**: `PUT /sell/inventory/v1/inventory_item/{SKU}`

Creates or replaces an inventory item with:
- SKU (generated as `RSAI-{shortId}-{timestamp}`)
- Product details (title, description, aspects)
- Condition and condition description
- Images (up to 12)

#### Step 2: Create Offer

**Endpoint**: `POST /sell/inventory/v1/offer`

Links inventory item to:
- Marketplace (EBAY_US)
- Category ID
- Listing policies (fulfillment, payment, return)
- Pricing (fixed price)
- Format (FIXED_PRICE)

#### Step 3: Publish Offer

**Endpoint**: `POST /sell/inventory/v1/offer/{offerId}/publish`

Makes the listing live on eBay. Returns `listingId`.

### Prerequisites

Before publishing, the system validates:
1. eBay account connected with valid tokens
2. Inventory location exists (created automatically if missing)
3. Business policies available (fulfillment, payment, return)
4. Category ID set
5. All required fields populated

### Response Format

```json
{
  "success": true,
  "steps": [
    { "step": 1, "name": "inventory", "status": "complete", "itemSku": "RSAI-abc123-1706644800" },
    { "step": 2, "name": "offer", "status": "complete", "offerId": "1234567890" },
    { "step": 3, "name": "publish", "status": "complete", "listingId": "123456789012" }
  ],
  "listingUrl": "https://www.ebay.com/itm/123456789012",
  "sku": "RSAI-abc123-1706644800",
  "offerId": "1234567890",
  "listingId": "123456789012"
}
```

---

## 3. Category Suggestion System

### Flow

```
AI Vision Output → Extract Keywords → Taxonomy API → Suggested Categories
```

### eBay Taxonomy API

**Endpoint**: `GET /commerce/taxonomy/v1/category_tree/{treeId}/get_category_suggestions`

**Input**:
- `category_tree_id`: 0 for EBAY_US
- `q`: Search query (from item title/brand/category)

**Output**:
```json
{
  "categorySuggestions": [
    {
      "category": {
        "categoryId": "11450",
        "categoryName": "Clothing, Shoes & Accessories"
      },
      "categoryTreeNodeAncestors": [...],
      "categoryTreeNodeLevel": 1,
      "relevancy": "HIGH"
    }
  ]
}
```

### Caching

- **TTL**: 24 hours
- **Cache Key**: `taxonomy:{query}:{treeId}`

### UI Integration

1. Auto-suggest category based on AI vision analysis
2. User can accept suggestion or browse/search categories
3. Category stored in listing draft

---

## 4. Error Mapping

### eBay Error to User Message

| eBay Error Code | User Message | Recovery Action |
|-----------------|--------------|-----------------|
| `INVALID_CATEGORY` | "Category not valid for this item" | Show category picker |
| `MISSING_FULFILLMENT_POLICY` | "No shipping policy selected" | Open policy selection |
| `MISSING_RETURN_POLICY` | "No return policy selected" | Open policy selection |
| `MISSING_PAYMENT_POLICY` | "No payment policy selected" | Open policy selection |
| `INVENTORY_ITEM_FAILED` | "Could not create inventory item" | Retry or check details |
| `OFFER_CREATION_FAILED` | "Could not create offer" | Check listing details |
| `PUBLISH_FAILED` | "Publishing failed" | Show specific eBay error |
| `INVALID_ACCESS_TOKEN` | "eBay connection expired" | Re-authenticate |
| `ITEM_LIMIT_REACHED` | "eBay listing limit reached" | Notify user |
| `DUPLICATE_LISTING` | "Similar listing already exists" | Show existing listing |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "MISSING_FULFILLMENT_POLICY",
    "message": "No shipping policy selected",
    "action": "select_policy",
    "details": "Configure shipping policies in eBay Seller Hub or select one below"
  },
  "steps": [
    { "step": 1, "name": "inventory", "status": "complete" },
    { "step": 2, "name": "offer", "status": "failed", "error": "..." }
  ]
}
```

---

## 5. API Rate Limits

### eBay API Limits

| API | Rate Limit | Notes |
|-----|------------|-------|
| Browse API | 5000/day | Used for comps |
| Taxonomy API | 5000/day | Category suggestions |
| Inventory API | 2000/day | Creating inventory items |
| Offer API | 2000/day | Creating and publishing offers |

### Mitigation Strategies

1. **Caching**: Reduce redundant API calls
2. **Batch Operations**: Group where possible
3. **Error Handling**: Graceful degradation on rate limit errors

---

## 6. Security Considerations

### Token Storage

- OAuth tokens encrypted at rest using AES-256-GCM
- Encryption key stored in environment variable
- Tokens refreshed automatically before expiry

### User Data

- Each user's eBay connection isolated by user ID
- No cross-user data access possible
- Tokens revoked on explicit disconnect
