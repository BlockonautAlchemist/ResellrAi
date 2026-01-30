# API Contracts

## Overview

This document defines the JSON request/response shapes for all eBay integration endpoints.

---

## 1. Comps Endpoints

### GET /api/v1/ebay/comps

Fetch pricing comparables from eBay active listings.

**Query Parameters**:
```typescript
{
  keywords: string;          // Required - Search terms
  categoryId?: string;       // eBay category ID
  condition?: string;        // NEW | LIKE_NEW | VERY_GOOD | GOOD | ACCEPTABLE
  brand?: string;            // Brand filter
  minPrice?: number;         // Minimum price filter
  maxPrice?: number;         // Maximum price filter
  marketplace?: string;      // Default: EBAY_US
}
```

**Response (200 OK)**:
```typescript
{
  success: true;
  data: {
    items: Array<{
      itemId: string;
      title: string;
      price: number;
      shippingCost: number;
      totalCost: number;          // price + shippingCost
      imageUrl: string;
      condition: string;
      itemUrl: string;            // eBay listing URL
      seller?: {
        username: string;
        feedbackScore: number;
      };
    }>;
    stats: {
      median: number;
      average: number;
      min: number;
      max: number;
      sampleSize: number;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    };
    source: 'active';
    limitations: string;         // Disclosure about data source
    cached: boolean;
    cacheAge?: number;           // Seconds since cached (if cached)
  };
}
```

**Error Response (4xx/5xx)**:
```typescript
{
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

---

## 2. Category Endpoints

### GET /api/v1/ebay/categories/suggest

Get AI-powered category suggestions based on item attributes.

**Query Parameters**:
```typescript
{
  query: string;             // Required - Item title/keywords
  marketplace?: string;      // Default: EBAY_US (tree ID: 0)
}
```

**Response (200 OK)**:
```typescript
{
  success: true;
  data: {
    suggestions: Array<{
      categoryId: string;
      categoryName: string;
      categoryPath: string[];    // Full path from root
      relevance: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    cached: boolean;
    cacheAge?: number;
  };
}
```

---

## 3. Publish Endpoints

### POST /api/v1/ebay/listings/:id/publish

Publish a listing to eBay.

**URL Parameters**:
- `id`: Listing ID from ResellrAI database

**Request Body**:
```typescript
{
  categoryId: string;              // Required - eBay category ID
  fulfillmentPolicyId: string;     // Required - Shipping policy
  paymentPolicyId: string;         // Required - Payment policy
  returnPolicyId: string;          // Required - Return policy
  price?: number;                  // Override price (optional)
  quantity?: number;               // Default: 1
}
```

**Response (200 OK)**:
```typescript
{
  success: true;
  steps: Array<{
    step: 1 | 2 | 3;
    name: 'inventory' | 'offer' | 'publish';
    status: 'complete' | 'failed' | 'pending';
    itemSku?: string;              // Step 1 result
    offerId?: string;              // Step 2 result
    listingId?: string;            // Step 3 result
    error?: string;                // If status is 'failed'
  }>;
  listingUrl: string;              // Full eBay URL
  sku: string;
  offerId: string;
  listingId: string;
}
```

**Error Response**:
```typescript
{
  success: false;
  error: {
    code: string;                  // Error code (see error mapping)
    message: string;               // User-friendly message
    action: string;                // Suggested recovery action
    details?: string;              // Additional context
  };
  steps: Array<{
    step: 1 | 2 | 3;
    name: 'inventory' | 'offer' | 'publish';
    status: 'complete' | 'failed' | 'pending';
    error?: string;
  }>;
}
```

### GET /api/v1/ebay/listings/:id/status

Get the eBay publish status of a listing.

**Response (200 OK)**:
```typescript
{
  success: true;
  data: {
    published: boolean;
    listingId?: string;
    listingUrl?: string;
    sku?: string;
    offerId?: string;
    status?: 'ACTIVE' | 'ENDED' | 'OUT_OF_STOCK';
  };
}
```

---

## 4. Policy Endpoints

### GET /api/v1/ebay/policies

Get user's eBay business policies.

**Response (200 OK)**:
```typescript
{
  success: true;
  data: {
    fulfillmentPolicies: Array<{
      policyId: string;
      name: string;
      description?: string;
      marketplaceId: string;
      shippingOptions: Array<{
        optionType: string;
        costType: string;
        shippingServices: Array<{
          shippingServiceCode: string;
          shippingCost: number;
        }>;
      }>;
    }>;
    paymentPolicies: Array<{
      policyId: string;
      name: string;
      description?: string;
      marketplaceId: string;
      paymentMethods: string[];
    }>;
    returnPolicies: Array<{
      policyId: string;
      name: string;
      description?: string;
      marketplaceId: string;
      returnsAccepted: boolean;
      returnPeriod?: {
        value: number;
        unit: string;
      };
    }>;
  };
}
```

---

## 5. Location Endpoints

### GET /api/v1/ebay/locations

Get user's inventory locations.

**Response (200 OK)**:
```typescript
{
  success: true;
  data: {
    locations: Array<{
      merchantLocationKey: string;
      name: string;
      address: {
        city: string;
        stateOrProvince: string;
        postalCode: string;
        country: string;
      };
      locationTypes: string[];
    }>;
  };
}
```

### POST /api/v1/ebay/locations

Create a new inventory location.

**Request Body**:
```typescript
{
  name: string;
  address: {
    city: string;
    stateOrProvince: string;
    postalCode: string;
    country: string;               // ISO 3166-1 alpha-2
  };
}
```

**Response (201 Created)**:
```typescript
{
  success: true;
  data: {
    merchantLocationKey: string;
    name: string;
    address: {...};
  };
}
```

---

## 6. Connection/Auth Endpoints

### GET /api/v1/ebay/connection

Check if current user has eBay connected.

**Response (200 OK)**:
```typescript
{
  success: true;
  data: {
    connected: boolean;
    account?: {
      userId: string;
      username: string;
      email?: string;
      sellerLevel?: string;
    };
    expiresAt?: string;            // ISO timestamp
  };
}
```

### GET /api/v1/ebay/oauth/start

Start OAuth flow.

**Response (200 OK)**:
```typescript
{
  success: true;
  data: {
    authUrl: string;               // Redirect user here
    state: string;                 // CSRF token
  };
}
```

### DELETE /api/v1/ebay/account

Disconnect eBay account.

**Response (200 OK)**:
```typescript
{
  success: true;
  message: "eBay account disconnected";
}
```

---

## 7. Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_CATEGORY` | 400 | Category ID not valid for eBay |
| `MISSING_FULFILLMENT_POLICY` | 400 | No shipping policy provided |
| `MISSING_RETURN_POLICY` | 400 | No return policy provided |
| `MISSING_PAYMENT_POLICY` | 400 | No payment policy provided |
| `INVENTORY_ITEM_FAILED` | 500 | Failed to create inventory item |
| `OFFER_CREATION_FAILED` | 500 | Failed to create offer |
| `PUBLISH_FAILED` | 500 | Failed to publish listing |
| `INVALID_ACCESS_TOKEN` | 401 | Token expired or invalid |
| `NOT_CONNECTED` | 401 | No eBay account connected |
| `RATE_LIMITED` | 429 | API rate limit exceeded |
| `EBAY_API_ERROR` | 502 | Generic eBay API error |
