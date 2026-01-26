# eBay Integration Scope

**Document Version:** 1.2
**Created:** 2026-01-26
**Updated:** 2026-01-26
**Status:** IMPLEMENTED

---

## Phase 1 Discovery Answers

| # | Question | Answer | Status |
|---|----------|--------|--------|
| 1 | eBay environment: sandbox first or production first? | **Sandbox first** | Confirmed |
| 2 | Pricing truth: require sold prices, or accept active listings when sold data unavailable? | **Sold prices preferred, fallback to active listings with clear UI indication of pricing method** | Confirmed |
| 3 | Regions: which marketplaces (US only for v1)? | **US only (EBAY_US)** | Confirmed |
| 4 | Listing type: fixed price only for v1, or auctions too? | **Fixed price only** | Confirmed |
| 5 | Category scope: generic best-effort or strict category mapping? | **Generic category best-effort mapping** | Confirmed |
| 6 | Policies: users manage in eBay, or configure/select in-app? | **Users manage policies in eBay directly** | Confirmed |
| 7 | Security: allow anonymous app use but require login to connect eBay? | **Yes - anonymous for basic features, login required for eBay connection** | Confirmed |

---

## In-Scope Features (v1)

### Environment & Region
- **Environment:** Sandbox first (switch to production after testing)
- **Marketplace:** EBAY_US only
- **Listing Format:** Fixed price only (no auctions)

### Core Features
- [x] eBay OAuth account connection (Authorization Code flow)
- [x] Pricing comps retrieval with source labeling
- [x] Direct listing to eBay via Inventory API
- [x] Token management (server-side only, encrypted at rest)

### Pricing Comps Logic
- **Primary:** Sold prices from eBay Browse API (if available)
- **Fallback:** Active listing prices (clearly labeled)
- **UI Requirement:** Always display pricing method to user
  - "Based on X sold items" (preferred)
  - "Based on X active listings" (fallback)
  - "No comparable items found" (when empty)

### Category Mapping
- **Approach:** Best-effort generic mapping
- **Behavior:** Map to closest category, never fail on category mismatch
- **Transparency:** Log unmapped categories for future improvement

### Policy Management
- **Approach:** User manages policies in eBay Seller Hub directly
- **In-App:** Fetch and display user's existing policies for selection
- **No In-App:** Policy creation, editing, or management

### Authentication Model
- **Anonymous:** Basic app features (listing generation, copy to clipboard)
- **Logged In:** Required to connect eBay account
- **eBay Connected:** Required to publish listings to eBay

### UX Features
- [x] "Connect eBay" button in app
- [x] Connected account status indicator (username display)
- [x] Pricing comps display with source transparency
- [x] Policy selection from user's existing eBay policies
- [x] "Publish to eBay" flow with confirmation
- [x] Listing URL/ID return after successful publish

---

## Out-of-Scope (v1)

### Explicitly Excluded
- Order management / sales tracking
- Bulk listing operations
- Multi-marketplace (beyond eBay US)
- **Auction listings** (fixed price only for v1)
- Promoted listings / advertising
- Message handling / buyer communication
- Inventory sync / quantity management
- Cross-platform deduplication
- **Policy creation/editing in-app** (users manage in eBay directly)
- Scraping eBay pages (forbidden - use official APIs only)
- International marketplaces (US only for v1)

### Deferred to Future Phases
- Multiple eBay account support per user
- Category taxonomy caching and strict mapping
- Advanced pricing analytics
- Historical price trends
- Competitor analysis
- Auction listing support
- International marketplace support (UK, DE, AU, etc.)
- In-app policy management

---

## Security Boundaries

### Non-Negotiable
1. OAuth tokens stored server-side ONLY
2. Refresh tokens never sent to mobile app
3. Authorization Code flow exclusively
4. All eBay API calls from backend
5. User consent required for account connection
6. Rate limiting on all eBay-proxied endpoints

### Token Handling
- Access tokens: Backend memory/database only
- Refresh tokens: Encrypted at rest in database
- Mobile app: Receives only `{ connected: boolean }` status

---

## Compliance Requirements

### eBay Developer Program
- [ ] Comply with eBay API License Agreement
- [ ] Display required disclosures
- [ ] Handle errors per eBay guidelines
- [ ] Respect rate limits
- [ ] Use official APIs only (no scraping)

### Data Handling
- [ ] Clear pricing data source labeling
- [ ] Limitations disclosed when data incomplete
- [ ] No fabrication of sold price data

---

## Success Criteria

### Definition of Done
1. User can connect eBay account end-to-end
2. Pricing comps returned with clear source labeling ("sold" | "active" | "none")
3. User can publish listing and receives listing URL/ID
4. Tokens stored server-side, refresh works, no secrets in mobile
5. All schemas documented and validated
6. Tests cover OAuth, comps, and publish flows
7. progress.md updated with phase completion

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-01-26 | 1.0 | Initial document, awaiting discovery | Integration Architect |

---

*This document will be updated after Phase 1 discovery answers are received.*
