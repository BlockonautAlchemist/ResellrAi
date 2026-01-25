# ResellrAI Product Scope

**Version:** 1.0  
**Last Updated:** 2026-01-25  
**Status:** Locked for v1

---

## North Star

> **A new user generates a high-quality, post-ready listing from photos in under 60 seconds.**

Success metrics:
- Time to first listing < 60 seconds
- % of listings accepted without heavy edits > 70%
- User says: "This is good enough to post"

---

## Primary User Persona

### "The Side-Hustle Reseller"

**Demographics:**
- Age: 22–55
- Works alone or with a partner
- Tech-comfortable, mobile-first

**Behavior:**
- Sells 20–100 items per month
- Primary platforms: eBay and Poshmark
- Lists in batches (5–20 items at a time)
- Time-constrained, values efficiency

**What They Sell:**
- Clothing
- Shoes
- Vintage items
- Thrift flips

**Pain Points:**
- Writing listings is tedious and time-consuming
- Researching pricing takes too long
- Formatting for different platforms is repetitive

### Explicitly NOT v1 Users
- Large enterprise teams
- Full-time high-volume sellers (500+ items/month)
- Absolute beginners with 1–2 items/month

---

## Platforms (v1 Scope)

| Platform | Status | Notes |
|----------|--------|-------|
| eBay | ✅ v1 | Primary focus |
| Poshmark | ✅ v1 | Secondary focus |
| Mercari | ❌ v1.5+ | Future consideration |
| Depop | ❌ v1.5+ | Future consideration |
| Facebook Marketplace | ❌ v1.5+ | Future consideration |

---

## Core Flow (First 60 Seconds)

```
1. Open app
2. Tap "New Listing"
3. Take 3–5 photos
4. Tap "Generate"
5. See complete draft:
   - Optimized title
   - Full description
   - Suggested category
   - Key attributes
   - Price range
6. User thinks: "Wow, this saved me real time."
```

**Critical Constraints:**
- No login wall before first listing preview
- No long onboarding or tutorials
- First value before first friction

---

## MVP Feature List

### Must Have (v1)
- [ ] Photo capture (3–5 images)
- [ ] AI-powered attribute detection
- [ ] Title generation (platform-optimized)
- [ ] Description generation
- [ ] Category suggestion
- [ ] Price range estimation
- [ ] eBay format export
- [ ] Poshmark format export
- [ ] Edit any AI-generated field
- [ ] Regenerate individual sections
- [ ] Copy listing to clipboard

### Nice to Have (v1 if time permits)
- [ ] Batch photo mode
- [ ] Listing history/drafts
- [ ] Basic analytics (listings created)

### Explicitly Deferred (v1.5+)
- Auto-posting to marketplaces
- Inventory management
- Accounting/profit tracking
- Team accounts
- Shipping label generation
- Cross-post automation
- Marketplace API integrations

---

## Monetization Model

### Freemium → Subscription

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 5 listings/month, single platform, no batch mode |
| **Pro** | $9–15/month | Unlimited listings, multi-platform, pricing suggestions, batch mode |

**Rationale:**
- Resellers want to test before committing
- Heavy users naturally convert
- Usage scales with value delivered
- Easy to explain and understand

### Explicitly Avoided
- One-time purchase model
- Pay-per-listing model
- High upfront pricing

---

## Non-Goals (v1)

These features are **explicitly out of scope** for v1:

| Feature | Reason |
|---------|--------|
| ❌ Auto-posting to marketplaces | Requires OAuth, API complexity |
| ❌ Inventory management | Scope creep, different product |
| ❌ Accounting/profit tracking | Scope creep, different product |
| ❌ Team accounts | Enterprise feature, not v1 persona |
| ❌ Shipping labels | Third-party integration complexity |
| ❌ Cross-post automation | Requires multiple platform APIs |
| ❌ Marketplace APIs | OAuth complexity, rate limits |

**v1 is a listing generation engine, not a reseller platform.**

---

## Success Criteria for v1 Launch

- [ ] User can generate listing in < 60 seconds
- [ ] AI output is editable and regeneratable
- [ ] eBay and Poshmark formats work correctly
- [ ] Free tier functional with 5 listing limit
- [ ] No critical AI hallucination issues
- [ ] Copy-to-clipboard works reliably
