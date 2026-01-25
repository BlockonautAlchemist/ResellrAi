# ResellrAI Constitution

**Version:** 1.0  
**Last Updated:** 2026-01-25  
**Status:** PRODUCT LAW - Changes require explicit approval

---

## Preamble

This Constitution defines the non-negotiable rules, constraints, and invariants that govern ResellrAI. These are not guidelines—they are **law**.

Every feature, every AI prompt, every UI decision, and every architectural choice must comply with this document.

**When in doubt, consult the Constitution.**

---

## Article I: Core Product Rules

### Rule 1.1: The 60-Second Promise
Listing generation must complete in under 60 seconds from photo capture to viewable draft. This is the North Star metric.

### Rule 1.2: Value Before Friction
Users must receive value (see a generated listing) before encountering any friction (login, payment, onboarding). The first listing preview requires no authentication.

### Rule 1.3: Schema-First Development
No feature ships without defined input and output schemas in `data_schema.md`. The schema is the contract; code implements the contract.

### Rule 1.4: Single Source of Truth
`data_schema.md` is the canonical source for all data structures. Duplicate schema definitions are forbidden. All services must reference the same schemas.

### Rule 1.5: Edit Everything
Every AI-generated field must be editable by the user. There are no locked fields.

---

## Article II: AI Behavior Constraints

These constraints are **HARD LAW**. The AI must never violate them under any circumstances.

### Section 2.1: Forbidden Claims

The AI must **NEVER**:

| Forbidden | Reason |
|-----------|--------|
| Claim authenticity | "Authentic Louis Vuitton" - Legal liability, buyer disputes |
| Claim genuineness | "Genuine leather" without confirmation - Material fraud |
| Invent model numbers | "Model #ABC123" - Buyer disputes, returns |
| Invent SKUs | "SKU: 12345" - Misleading information |
| Guarantee condition | "Perfect condition" - Subjective, disputeable |
| Claim rarity | "Rare find" - Unverifiable, misleading |
| Claim value | "Valuable collectible" - Investment advice |
| Claim investment potential | "Great investment" - Financial advice |
| Invent provenance | "From a smoke-free home" - Unverifiable |
| Invent backstory | "Worn once" - Unverifiable |

### Section 2.2: Uncertainty Protocol

When the AI is uncertain:

1. **Confidence < 0.60**: Output "Unknown" for the field
2. **Confidence 0.60-0.85**: Output value with `requiresConfirmation: true`
3. **Confidence ≥ 0.85**: Output value, no confirmation required

The AI must always expose confidence scores in `VisionOutput`.

### Section 2.3: Neutral Language Mandate

AI-generated descriptions must use neutral, factual language:

| Forbidden Phrasing | Required Alternative |
|--------------------|---------------------|
| "Beautiful vintage dress" | "Vintage-style dress" |
| "Excellent condition" | "Shows light wear" (if applicable) |
| "Like new" | "Pre-owned, [describe visible condition]" |
| "Perfect for collectors" | [Omit entirely] |
| "Must-have item" | [Omit entirely] |

### Section 2.4: Required Disclaimers

These disclaimers must appear in the system:

**Pricing Disclaimer:**
> "Price suggestions are estimates based on similar items. Actual selling price may vary."

**Condition Disclaimer:**
> "Condition is estimated from photos. Please verify and adjust before listing."

**Brand Disclaimer (when confidence < 0.85):**
> "Brand detected with limited confidence. Please verify."

---

## Article III: Data Ownership Rules

### Rule 3.1: User Data Sovereignty
Users own all listing data they create. ResellrAI is a processor, not an owner.

### Rule 3.2: Photo Consent
Photos are stored only with user consent. Users may delete their photos at any time.

### Rule 3.3: Offline Export
Export to clipboard/share must always work, even without internet connection (for cached listings).

### Rule 3.4: No Data Lock-in
Users can export all their data in standard formats (JSON, CSV) at any time.

### Rule 3.5: Deletion Rights
Users can delete their account and all associated data. Deletion must be complete within 30 days.

---

## Article IV: UX Invariants

These user experience rules are non-negotiable.

### Rule 4.1: First Value Before First Friction
- No login required to generate first listing preview
- No payment required for first 5 listings
- No mandatory onboarding before core flow

### Rule 4.2: Regenerate Everything
Every AI-generated field must have a visible "Regenerate" option. Users can regenerate:
- Title
- Description
- Individual attributes
- Pricing suggestion
- Entire listing

### Rule 4.3: Transparent AI
Users must know when content is AI-generated. AI-generated content should be:
- Clearly labeled as generated
- Accompanied by confidence indicators where applicable
- Never presented as user-written

### Rule 4.4: Error Recovery
Every error state must have a clear recovery path:
- Retry option for transient failures
- Manual input fallback for AI failures
- Clear error messages (not technical jargon)

### Rule 4.5: Progress Feedback
Any operation taking > 2 seconds must show progress feedback:
- Loading indicators for all async operations
- Step-by-step progress for listing generation
- Estimated time remaining when possible

### Rule 4.6: Mobile-First
All UI decisions optimize for mobile:
- Touch-friendly tap targets (minimum 44x44pt)
- Thumb-reachable primary actions
- Minimal typing required
- Photo-centric interface

---

## Article V: Architectural Invariants

### Rule 5.1: UI is Projection
The UI is a projection of data, never the source of truth. All authoritative state lives in the backend.

### Rule 5.2: Backend Business Logic
All business logic lives in the backend. The frontend:
- Renders data
- Captures user input
- Sends requests
- Displays responses

The frontend does NOT:
- Calculate pricing
- Validate business rules
- Make authorization decisions
- Store authoritative state

### Rule 5.3: Atomic Services
Every service in Layer 3 must be:
- **Atomic**: Does one thing well
- **Testable**: Can be tested in isolation
- **Versioned**: Changes are tracked
- **Stateless**: No internal state between calls

### Rule 5.4: Schema Validation
All inputs must be validated against `data_schema.md` before processing. Invalid inputs are rejected with clear error messages.

### Rule 5.5: AI Output Validation
All AI outputs must pass through validation before being returned to users:
- Schema conformity check
- Forbidden word filter (Article II violations)
- Confidence score verification
- Character limit enforcement

### Rule 5.6: Graceful Degradation
When AI services fail:
1. Return partial results if possible
2. Mark failed fields as "Unable to generate"
3. Allow manual input for all fields
4. Never block the user entirely

---

## Article VI: Security & Privacy

### Rule 6.1: Secure by Default
- All API calls over HTTPS
- Tokens stored securely (not in localStorage)
- Photos transmitted encrypted

### Rule 6.2: Minimal Data Collection
Collect only data necessary for the service:
- Photos (with consent)
- Listing data
- Usage metrics (anonymized)
- Account information (if registered)

### Rule 6.3: No Third-Party Data Sales
User data is never sold to third parties. Period.

### Rule 6.4: Transparent Logging
Users can request logs of:
- What data was collected
- How AI processed their photos
- What third-party services received their data

---

## Article VII: Monetization Constraints

### Rule 7.1: Free Tier Always Exists
There must always be a functional free tier. Users can always:
- Generate at least 5 listings per month
- Access core functionality
- Export listings

### Rule 7.2: No Dark Patterns
Forbidden monetization practices:
- Hidden fees
- Confusing subscription terms
- Difficult cancellation
- Bait-and-switch pricing

### Rule 7.3: Clear Value Proposition
Paid features must provide clear, demonstrable value over free tier:
- Unlimited listings
- Multi-platform support
- Batch processing
- Priority generation

---

## Article VIII: Amendment Process

### Section 8.1: When to Amend
Amend this Constitution when:
- Product rules fundamentally change
- New invariants are discovered
- Existing rules prove unworkable
- Legal requirements change

### Section 8.2: Amendment Procedure
1. Document proposed change in `progress.md`
2. Justify why the change is necessary
3. Assess impact on existing code/features
4. Get explicit approval from product owner
5. Update Constitution with version increment
6. Update affected code to comply

### Section 8.3: Version History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-01-25 | Initial Constitution |

---

## Quick Reference Card

### AI Must Never:
- Claim authenticity
- Invent model numbers
- Guarantee condition
- Claim rarity or value
- Invent provenance

### Always Required:
- Editable fields
- Regenerate options
- Confidence scores
- User confirmation for critical fields
- Progress feedback

### Architectural Laws:
- Schema first, code second
- UI projects data, doesn't create it
- Business logic in backend only
- Validate all AI output
- Degrade gracefully

---

*This Constitution is law. The other files are memory.*
