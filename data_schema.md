# ResellrAI Data Schema

**Version:** 1.0  
**Last Updated:** 2026-01-25  
**Status:** Canonical Source of Truth

---

## Overview

This document defines the canonical JSON schemas for all data flowing through ResellrAI. These schemas are the **source of truth** for:

- API request/response payloads
- AI service inputs/outputs
- Frontend state structures
- Database models

**Rule:** No feature ships without defined input/output schemas in this document.

---

## Schema 1: ItemInput

The raw input from the user when creating a new listing.

```json
{
  "$schema": "ItemInput",
  "description": "Raw photo input and optional user hints for listing generation",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique identifier for this item"
    },
    "photos": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "base64 | url"
      },
      "minItems": 1,
      "maxItems": 10,
      "description": "Array of photo data (base64 encoded or URLs)"
    },
    "userHints": {
      "type": "object",
      "properties": {
        "category": {
          "type": "string | null",
          "description": "Optional user-provided category hint"
        },
        "brand": {
          "type": "string | null",
          "description": "Optional user-provided brand hint"
        },
        "condition": {
          "type": "string | null",
          "enum": ["new", "like_new", "good", "fair", "poor", null],
          "description": "Optional user-provided condition hint"
        }
      },
      "description": "Optional hints from user to guide AI"
    },
    "createdAt": {
      "type": "string",
      "format": "ISO8601",
      "description": "Timestamp when item was created"
    }
  },
  "required": ["id", "photos", "createdAt"]
}
```

**Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "photos": ["data:image/jpeg;base64,/9j/4AAQ...", "data:image/jpeg;base64,/9j/4BBR..."],
  "userHints": {
    "category": null,
    "brand": "Nike",
    "condition": null
  },
  "createdAt": "2026-01-25T14:30:00Z"
}
```

---

## Schema 2: VisionOutput

Output from the Vision AI service after analyzing item photos.

```json
{
  "$schema": "VisionOutput",
  "description": "AI-detected attributes from photo analysis",
  "properties": {
    "itemId": {
      "type": "string",
      "format": "uuid",
      "description": "Reference to the ItemInput id"
    },
    "detectedCategory": {
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      },
      "description": "Primary category detection"
    },
    "detectedBrand": {
      "type": "object",
      "properties": {
        "value": { "type": "string | null" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      },
      "description": "Brand detection (null if unknown)"
    },
    "detectedColor": {
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      },
      "description": "Primary color detection"
    },
    "detectedCondition": {
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      },
      "description": "Estimated condition (requires user confirmation)"
    },
    "detectedAttributes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": { "type": "string" },
          "value": { "type": "string" },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      },
      "description": "Additional detected attributes (size, material, style, etc.)"
    },
    "rawLabels": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Raw labels from vision model for debugging"
    },
    "processingTimeMs": {
      "type": "number",
      "description": "Time taken for vision processing in milliseconds"
    }
  },
  "required": ["itemId", "detectedCategory", "detectedColor", "detectedAttributes", "processingTimeMs"]
}
```

**Example:**
```json
{
  "itemId": "550e8400-e29b-41d4-a716-446655440000",
  "detectedCategory": { "value": "Men's Athletic Shoes", "confidence": 0.92 },
  "detectedBrand": { "value": "Nike", "confidence": 0.88 },
  "detectedColor": { "value": "Black/White", "confidence": 0.95 },
  "detectedCondition": { "value": "good", "confidence": 0.72 },
  "detectedAttributes": [
    { "key": "size", "value": "10", "confidence": 0.65 },
    { "key": "style", "value": "Running", "confidence": 0.81 },
    { "key": "material", "value": "Mesh/Synthetic", "confidence": 0.77 }
  ],
  "rawLabels": ["shoe", "sneaker", "athletic", "nike", "running shoe"],
  "processingTimeMs": 1250
}
```

---

## Schema 3: ListingDraft

The generated listing draft combining vision output and LLM generation.

```json
{
  "$schema": "ListingDraft",
  "description": "AI-generated listing draft ready for user review",
  "properties": {
    "itemId": {
      "type": "string",
      "format": "uuid"
    },
    "title": {
      "type": "object",
      "properties": {
        "value": { "type": "string", "maxLength": 80 },
        "charCount": { "type": "number" }
      },
      "description": "Generated title optimized for search"
    },
    "description": {
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "charCount": { "type": "number" }
      },
      "description": "Generated description with key selling points"
    },
    "category": {
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "platformCategoryId": { "type": "string | null" }
      },
      "description": "Suggested category with platform-specific ID if available"
    },
    "attributes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": { "type": "string" },
          "value": { "type": "string" },
          "editable": { "type": "boolean", "default": true }
        }
      },
      "description": "Key-value attributes for the listing"
    },
    "condition": {
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "requiresConfirmation": { "type": "boolean", "default": true }
      },
      "description": "Suggested condition (always requires user confirmation)"
    },
    "brand": {
      "type": "object",
      "properties": {
        "value": { "type": "string | null" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
        "requiresConfirmation": { "type": "boolean" }
      },
      "description": "Detected brand (requires confirmation if confidence < 0.85)"
    },
    "generatedAt": {
      "type": "string",
      "format": "ISO8601"
    }
  },
  "required": ["itemId", "title", "description", "category", "attributes", "condition", "generatedAt"]
}
```

**Example:**
```json
{
  "itemId": "550e8400-e29b-41d4-a716-446655440000",
  "title": {
    "value": "Nike Men's Running Shoes Size 10 Black White Athletic Sneakers",
    "charCount": 62
  },
  "description": {
    "value": "Men's Nike running shoes in size 10. Black and white colorway with mesh upper for breathability. Good pre-owned condition with normal wear. Great for running or casual wear.",
    "charCount": 189
  },
  "category": {
    "value": "Men's Athletic Shoes",
    "platformCategoryId": null
  },
  "attributes": [
    { "key": "Brand", "value": "Nike", "editable": true },
    { "key": "Size", "value": "10", "editable": true },
    { "key": "Color", "value": "Black/White", "editable": true },
    { "key": "Style", "value": "Running", "editable": true }
  ],
  "condition": {
    "value": "Good",
    "requiresConfirmation": true
  },
  "brand": {
    "value": "Nike",
    "confidence": 0.88,
    "requiresConfirmation": false
  },
  "generatedAt": "2026-01-25T14:30:05Z"
}
```

---

## Schema 4: PricingSuggestion

Price range estimation for the item.

```json
{
  "$schema": "PricingSuggestion",
  "description": "AI-generated price range suggestion",
  "properties": {
    "itemId": {
      "type": "string",
      "format": "uuid"
    },
    "lowPrice": {
      "type": "number",
      "minimum": 0,
      "description": "Lower bound of suggested price range"
    },
    "midPrice": {
      "type": "number",
      "minimum": 0,
      "description": "Recommended listing price"
    },
    "highPrice": {
      "type": "number",
      "minimum": 0,
      "description": "Upper bound of suggested price range"
    },
    "currency": {
      "type": "string",
      "default": "USD",
      "description": "Currency code (USD only for v1)"
    },
    "basis": {
      "type": "string",
      "description": "Explanation of how price was determined"
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Confidence level in the price suggestion"
    },
    "disclaimer": {
      "type": "string",
      "default": "Price suggestions are estimates based on similar items. Actual selling price may vary.",
      "description": "Required disclaimer for pricing"
    }
  },
  "required": ["itemId", "lowPrice", "midPrice", "highPrice", "currency", "basis", "confidence", "disclaimer"]
}
```

**Example:**
```json
{
  "itemId": "550e8400-e29b-41d4-a716-446655440000",
  "lowPrice": 25,
  "midPrice": 35,
  "highPrice": 50,
  "currency": "USD",
  "basis": "Based on similar Nike running shoes in good condition on eBay",
  "confidence": 0.72,
  "disclaimer": "Price suggestions are estimates based on similar items. Actual selling price may vary."
}
```

---

## Schema 5: PlatformVariant

Platform-specific formatted listing (eBay, Poshmark).

```json
{
  "$schema": "PlatformVariant",
  "description": "Listing formatted for a specific marketplace",
  "properties": {
    "platform": {
      "type": "string",
      "enum": ["ebay", "poshmark"],
      "description": "Target marketplace"
    },
    "title": {
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "maxLength": { "type": "number" },
        "valid": { "type": "boolean" }
      },
      "description": "Platform-formatted title with validation"
    },
    "description": {
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "format": { "type": "string", "enum": ["plain", "html"] }
      },
      "description": "Platform-formatted description"
    },
    "categoryId": {
      "type": "string",
      "description": "Platform-specific category ID"
    },
    "requiredAttributes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": { "type": "string" },
          "value": { "type": "string" }
        }
      },
      "description": "Required attributes for this platform/category"
    },
    "optionalAttributes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": { "type": "string" },
          "value": { "type": "string" }
        }
      },
      "description": "Optional attributes for better listing quality"
    }
  },
  "required": ["platform", "title", "description", "categoryId", "requiredAttributes"]
}
```

**Example (eBay):**
```json
{
  "platform": "ebay",
  "title": {
    "value": "Nike Men's Running Shoes Size 10 Black White Athletic Sneakers",
    "maxLength": 80,
    "valid": true
  },
  "description": {
    "value": "<p>Men's Nike running shoes in size 10.</p><p>Black and white colorway with mesh upper for breathability.</p><p>Good pre-owned condition with normal wear.</p>",
    "format": "html"
  },
  "categoryId": "15709",
  "requiredAttributes": [
    { "key": "Brand", "value": "Nike" },
    { "key": "US Shoe Size (Men's)", "value": "10" },
    { "key": "Color", "value": "Black" }
  ],
  "optionalAttributes": [
    { "key": "Style", "value": "Running Shoes" },
    { "key": "Upper Material", "value": "Mesh" }
  ]
}
```

---

## Schema 6: UserEdit

Tracks user modifications to AI-generated content.

```json
{
  "$schema": "UserEdit",
  "description": "Record of user edits to AI-generated fields",
  "properties": {
    "itemId": {
      "type": "string",
      "format": "uuid"
    },
    "field": {
      "type": "string",
      "description": "The field that was edited (e.g., 'title', 'description', 'price')"
    },
    "previousValue": {
      "type": "any",
      "description": "Value before edit"
    },
    "newValue": {
      "type": "any",
      "description": "Value after edit"
    },
    "editedAt": {
      "type": "string",
      "format": "ISO8601"
    },
    "editType": {
      "type": "string",
      "enum": ["manual", "regenerate"],
      "description": "Whether user manually edited or requested regeneration"
    }
  },
  "required": ["itemId", "field", "previousValue", "newValue", "editedAt", "editType"]
}
```

**Example:**
```json
{
  "itemId": "550e8400-e29b-41d4-a716-446655440000",
  "field": "title",
  "previousValue": "Nike Men's Running Shoes Size 10 Black White Athletic Sneakers",
  "newValue": "Nike Air Max Men's Running Shoes Size 10 Black White",
  "editedAt": "2026-01-25T14:32:00Z",
  "editType": "manual"
}
```

---

## Schema 7: FinalListingPayload

The complete, finalized listing ready for export.

```json
{
  "$schema": "FinalListingPayload",
  "description": "Complete listing ready for export to marketplace",
  "properties": {
    "itemId": {
      "type": "string",
      "format": "uuid"
    },
    "platform": {
      "type": "string",
      "enum": ["ebay", "poshmark"]
    },
    "title": {
      "type": "string",
      "description": "Final title after all edits"
    },
    "description": {
      "type": "string",
      "description": "Final description after all edits"
    },
    "price": {
      "type": "number",
      "minimum": 0,
      "description": "User-confirmed listing price"
    },
    "category": {
      "type": "string",
      "description": "Final category"
    },
    "attributes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": { "type": "string" },
          "value": { "type": "string" }
        }
      },
      "description": "Final attributes after all edits"
    },
    "photos": {
      "type": "array",
      "items": { "type": "string", "format": "url" },
      "description": "URLs to uploaded photos"
    },
    "status": {
      "type": "string",
      "enum": ["draft", "ready", "exported"],
      "description": "Current status of the listing"
    },
    "exportedAt": {
      "type": "string | null",
      "format": "ISO8601",
      "description": "Timestamp when listing was exported (null if not yet exported)"
    }
  },
  "required": ["itemId", "platform", "title", "description", "price", "category", "attributes", "photos", "status"]
}
```

**Example:**
```json
{
  "itemId": "550e8400-e29b-41d4-a716-446655440000",
  "platform": "ebay",
  "title": "Nike Air Max Men's Running Shoes Size 10 Black White",
  "description": "Men's Nike Air Max running shoes in size 10. Black and white colorway with mesh upper for breathability. Good pre-owned condition with normal wear. Great for running or casual wear.",
  "price": 35,
  "category": "Men's Athletic Shoes",
  "attributes": [
    { "key": "Brand", "value": "Nike" },
    { "key": "Size", "value": "10" },
    { "key": "Color", "value": "Black/White" },
    { "key": "Style", "value": "Running" }
  ],
  "photos": [
    "https://storage.resellrai.com/items/550e8400/photo1.jpg",
    "https://storage.resellrai.com/items/550e8400/photo2.jpg"
  ],
  "status": "ready",
  "exportedAt": null
}
```

---

## Validation Rules

### Confidence Thresholds

| Threshold | Behavior |
|-----------|----------|
| `confidence >= 0.85` | Auto-accept, no confirmation needed |
| `0.60 <= confidence < 0.85` | Show value, flag for user review |
| `confidence < 0.60` | Show as "Unknown" or prompt user input |

### Required Confirmations

These fields **always** require user confirmation before export:
- `condition` - AI should never guarantee condition
- `brand` - If confidence < 0.85
- `price` - User must confirm final price

### Character Limits

| Platform | Title Max | Description Max |
|----------|-----------|-----------------|
| eBay | 80 chars | 4000 chars |
| Poshmark | 80 chars | 1500 chars |

---

## Schema Versioning

When schemas change:
1. Increment version number in this document
2. Document breaking changes
3. Update `progress.md` with migration notes
4. Update `constitution.md` if invariants change
