# Findings & Constraints

## eBay API Limitations

### Sold Data NOT Available

**Critical Constraint**: eBay's Marketplace Insights API, which provides sold listing data, is restricted to approved partners only. ResellrAI cannot access historical sold prices.

**Impact**: All pricing comparables are based on **active listings only**. Users must understand that:
- Active listing prices may not reflect actual sale prices
- Sellers often list above market value
- The displayed prices are asking prices, not completed transactions

**Mitigation**: Clear UI disclosure on all comps: "Active listings (not sold prices)"

---

## Browse API Limitations

### Item Details

The Browse API returns limited details per item:
- Title, price, shipping cost
- Condition (as enum, not description)
- Single image URL
- Item URL

**Not Available** from Browse API:
- Seller feedback percentage (only score)
- Item specifics/aspects
- Multiple images
- Detailed condition description

### Search Constraints

- Maximum 200 items per request
- Limited filter options compared to web interface
- Some categories return sparse results

---

## Inventory API Requirements

### Required Fields for Publish

1. **Inventory Item**:
   - SKU (unique per item)
   - Title (max 80 characters)
   - Description
   - Condition (must be valid eBay enum)
   - At least one image URL

2. **Offer**:
   - Category ID (must be leaf category)
   - Marketplace ID
   - Listing policies (fulfillment, payment, return)
   - Price
   - Currency

3. **Prerequisites**:
   - At least one inventory location
   - Business policies created in eBay Seller Hub

### Common Publish Failures

| Issue | Cause | Solution |
|-------|-------|----------|
| Missing location | No inventory location set up | Auto-create default location |
| Invalid category | Using parent instead of leaf category | Force leaf category selection |
| Policy not found | Policy ID mismatch or deleted | Re-fetch policies before publish |
| Title too long | Exceeds 80 characters | Truncate in backend |

---

## Taxonomy API Behavior

### Category Tree IDs

| Marketplace | Tree ID |
|-------------|---------|
| EBAY_US | 0 |
| EBAY_UK | 3 |
| EBAY_DE | 77 |
| EBAY_AU | 15 |

### Suggestion Quality

- Works best with specific product names
- Generic terms return broad categories
- Brand names significantly improve accuracy
- Returns multiple suggestions with relevancy scores

---

## OAuth Flow Edge Cases

### Token Refresh Timing

- Access tokens expire after 2 hours
- Refresh tokens expire after 18 months
- System refreshes 5 minutes before expiry

### Deep Link Challenges

- Expo Go requires special URL format
- Custom app builds use `resellrai://` scheme
- Some devices have deep link reliability issues

---

## Rate Limits

### Observed Limits (eBay Production)

| API | Daily Limit | Notes |
|-----|-------------|-------|
| Browse API | 5,000 calls | Per application |
| Taxonomy API | 5,000 calls | Per application |
| Inventory API | 2,000 calls | Per user |

### Caching Strategy

- Comps: 15-minute TTL (balance freshness vs. API usage)
- Categories: 24-hour TTL (rarely change)
- Policies: 1-hour TTL (user might update in Seller Hub)

---

## UI/UX Considerations

### Mobile Constraints

- Thumbnail images must load quickly (prefer smaller sizes)
- Long titles must truncate gracefully
- Price display must account for currency formatting
- Progress indicators must be visible without scrolling

### Error Recovery

Users need clear paths to resolve issues:
1. Missing policy → Link to Seller Hub
2. Invalid category → Show category picker
3. Token expired → One-tap re-auth
4. Network error → Retry button

---

## Data Validation Rules

### Listing Fields

| Field | Validation | Notes |
|-------|------------|-------|
| Title | Max 80 chars | Truncate if needed |
| Description | Max 500,000 chars | Support HTML |
| Price | > 0 | Currency must match marketplace |
| Quantity | >= 1 | Integer only |
| Images | 1-12 | Must be HTTPS URLs |

### Category Selection

- Must be leaf category (no children)
- Must be valid for selected condition
- Some categories have specific requirements

---

## Future Considerations

### Features Dependent on API Access

1. **Sold comps** - Requires Marketplace Insights approval
2. **Automatic repricing** - Would need Pricing API
3. **Order management** - Requires Trading API access
4. **Bulk operations** - Current APIs designed for single items

### Scaling Concerns

- In-memory cache won't scale to multiple instances
- Consider Redis for distributed caching
- User-level rate limiting may be needed
