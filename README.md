# ResellrAI

ResellrAI is a mobile-first listing assistant for side-hustle resellers. It turns item photos into draft listings with titles, descriptions, pricing guidance, and platform-ready formatting so users can move from item to post-ready draft faster.

## What It Does

- Captures item photos in the mobile app.
- Runs AI-assisted item analysis.
- Generates listing drafts (title + description).
- Suggests pricing ranges.
- Formats output for target platforms (currently focused on eBay).
- Supports export and publish flows through backend APIs.

## Current Status (In Progress)

ResellrAI is under active development. This repository contains working frontend/backend foundations and live integrations, while some roadmap capabilities are still planned.

### Implemented in Repo Now

- Expo React Native frontend in `frontend/`.
- TypeScript Express backend in `backend/`.
- Listing generation pipeline endpoints under `/api/v1/listings/*`.
- eBay integration endpoints under `/api/v1/ebay/*` (OAuth, account, comps, policies, publish/status).
- Billing endpoints under `/api/v1/billing/*`.
- Usage tracking/status endpoint at `/api/v1/usage/status`.
- Health endpoints at `/health` and `/health/services`.

### Planned / Roadmap Direction

- Expanded platform support beyond eBay (see product scope).
- Continued service-layer maturation and deterministic engine hardening.
- Ongoing UX and conversion improvements across onboarding and premium flows.

For product scope and roadmap boundaries, see `product_scope.md`.

## Architecture at a Glance

ResellrAI follows a 3-layer architecture:

1. Product layer: SOPs, scope, and system contracts in docs.
2. Orchestration layer: backend API flow, validation, and integrations.
3. Engine layer: deterministic service modules for domain logic.

Read the canonical architecture docs:

- `architecture.md`
- `data_schema.md`
- `architecture/api_contracts.md`
- `architecture/ebay_integration.md`

## Monorepo Layout

```text
.
├── frontend/         # Expo React Native app
├── backend/          # TypeScript Express API
├── architecture/     # API/integration architecture docs
├── services/         # Service-layer direction (currently planning-focused)
├── product_scope.md  # Product scope and boundaries
├── data_schema.md    # Canonical data schemas
└── progress.md       # Build log and decisions
```

## Quick Start (Light Setup)

### Prerequisites

- Node.js
- pnpm
- Expo tooling (for running the mobile app)

### 1) Install Dependencies

From repo root:

```bash
pnpm run fe:install
pnpm run be:install
```

### 2) Configure Environment

Copy env templates and set values:

- `frontend/.env.example` -> `frontend/.env`
- `backend/.env.example` -> `backend/.env`

At minimum, fill required variables for your local run target. Full provider onboarding details are intentionally not duplicated here; use the inline comments in each `.env.example`.

### 3) Run Backend

From repo root:

```bash
pnpm run be:dev
```

### 4) Run Frontend

From repo root:

```bash
pnpm run fe:start
```

Optional clean start:

```bash
pnpm run fe:start:clean
```

## API Snapshot

Primary route groups currently mounted by the backend:

| Route | Purpose |
|---|---|
| `GET /` | API metadata |
| `/health` | Health checks |
| `/api/v1/listings/*` | Listing generation, retrieval, updates, regeneration, export |
| `/api/v1/ebay/*` | eBay OAuth, account, comps, policies, publish/status |
| `/api/v1/billing/*` | Stripe billing and subscription flows |
| `GET /api/v1/usage/status` | Usage + trial status |

This is a snapshot for orientation. Source of truth is backend code in `backend/src`.

## Testing

Backend test scripts:

```bash
pnpm -C backend test
pnpm -C backend test:supabase
pnpm -C backend test:openrouter
pnpm -C backend test:pipeline
pnpm -C backend test:integration
```

## Key Documents

- `product_scope.md`
- `architecture.md`
- `data_schema.md`
- `architecture/api_contracts.md`
- `progress.md`
- `findings.md`

## Disclaimer

ResellrAI integrates with external providers (e.g., Supabase, OpenRouter, eBay, Stripe). Local and production behavior depends on valid credentials, provider configuration, and environment-specific URLs.
