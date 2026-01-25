# Services Directory

This directory will contain the deterministic engine services (Layer 3).

## Planned Structure (Phase 3+)

```
services/
├── image/
│   ├── ImageService.ts      # Photo upload, compression, storage
│   └── ImageService.test.ts
├── vision/
│   ├── VisionService.ts     # AI image analysis
│   └── VisionService.test.ts
├── listing/
│   ├── ListingGeneratorService.ts  # Title/description generation
│   └── ListingGeneratorService.test.ts
├── pricing/
│   ├── PricingService.ts    # Price range estimation
│   └── PricingService.test.ts
├── platform/
│   ├── PlatformFormatterService.ts  # eBay/Poshmark formatting
│   └── PlatformFormatterService.test.ts
└── shared/
    ├── types.ts             # Shared TypeScript types from data_schema.md
    └── validation.ts        # Schema validation utilities
```

## Service Requirements

Each service must be:
- **Atomic**: Does one thing well
- **Testable**: Can be tested in isolation
- **Versioned**: Changes are tracked
- **Stateless**: No internal state between calls

## Current Status

Services will be implemented in Phase 3 after environment verification is complete.
