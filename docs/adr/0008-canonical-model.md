# ADR-0008: Canonical Transit Model for Provider Normalization

**Status:** Accepted  
**Date:** 2026-07-30

## Context

The platform integrates transit data from multiple providers (WBBus, BMTC, WBTC, Delhi Metro, and future GTFS feeds). Each provider has its own data format — some expose JSON APIs, others scrape HTML, and GTFS uses CSV/fixed-column formats. Without a common model, every consumer (the API, journey planner, search) would need to understand every provider's format, and adding a new provider would require changes across the entire system.

## Decision

We create a **Canonical Transit Model** — a set of pure TypeScript interfaces in `apps/api/src/canonical-model/` that represent transit data in a provider-agnostic way.

### Canonical Interfaces

```typescript
// apps/api/src/canonical-model/CanonicalStop.ts
export interface CanonicalStop {
  id: string;              // Provider-specific ID prefixed by provider key (e.g., "wbbus:123")
  name: string;
  lat: number;
  lng: number;
  code?: string;           // Short stop code (e.g., "ST-02")
  platformCode?: string;   // Platform/bay identifier
  provider: string;        // Provider key (e.g., "wbbus", "bmto")
  stopType?: 'bus_stop' | 'metro_station' | 'train_station' | 'ferry_terminal';
  children?: CanonicalStop[]; // Sub-stops (e.g., platforms within a station)
  metadata?: Record<string, unknown>; // Provider-specific extras
}
```

```typescript
// apps/api/src/canonical-model/CanonicalRoute.ts
export interface CanonicalRoute {
  id: string;
  name: string;
  shortName: string;       // Route number (e.g., "S-14")
  description?: string;
  provider: string;
  routeType: 'bus' | 'metro' | 'train' | 'ferry';
  direction?: 'outbound' | 'inbound' | 'circular';
  stops: CanonicalRouteStop[];
}
```

```typescript
// apps/api/src/canonical-model/CanonicalTrip.ts
export interface CanonicalTrip {
  id: string;
  routeId: string;
  serviceId: string;
  direction?: 'outbound' | 'inbound';
  headSign?: string;
  stopTimes: CanonicalStopTime[];
}
```

```typescript
// apps/api/src/canonical-model/CanonicalStopTime.ts
export interface CanonicalStopTime {
  stopId: string;
  arrivalTime: string;     // "HH:MM:SS"
  departureTime: string;   // "HH:MM:SS"
  stopSequence: number;
  pickupType?: 'regular' | 'not_available' | 'phone_booking' | 'coordinated';
  dropOffType?: 'regular' | 'not_available' | 'phone_booking' | 'coordinated';
}
```

### Processing Pipeline

```
Provider Response (raw)
        │
        ▼
  Provider Parser ──→ Canonical Model ──→ Mapper ──→ Domain Entity ──→ DB
        │                                                        │
        └── Provider-specific fields in `metadata`               │
                                                                 ▼
                                                        Stored in transit schema
```

1. **Parser** — Each provider parser outputs `CanonicalStop[]`, `CanonicalRoute[]`, etc.
2. **Mapper** — Converts canonical model to domain entities (applying business rules, ID generation, validation).
3. **Repository** — Persists domain entities.

### Rules

1. **All providers output the same canonical interfaces** — The canonical model is the contract every provider fulfills.
2. **Provider-specific data goes in `metadata`** — If a provider has a unique field, it can be stored in the `metadata: Record<string, unknown>` field, but it is not part of the canonical interface.
3. **Canonical model is versioned** — Breaking changes to canonical interfaces trigger a major version bump and require updating all provider parsers.
4. **Canonical model is pure TypeScript** — No decorators, no dependencies, no NestJS imports. Just interfaces.

## Consequences

- **Positive:** Adding a new provider requires only writing a parser that outputs canonical model — no changes to domain entities, repositories, or API controllers.
- **Positive:** The API layer depends on the canonical model, not on any specific provider format — providers can change their internal format without affecting consumers.
- **Positive:** The canonical model serves as living documentation of "what a stop is" — it is the shared language across the entire system.
- **Positive:** GTFS import is straightforward — GTFS columns map cleanly to canonical model fields.
- **Negative:** Transformation overhead — every provider response is parsed, mapped to canonical model, then mapped to domain entities. For large imports (e.g., 50,000 stops), this means two passes.
- **Negative:** The canonical model adds abstraction — a field in the canonical model may not map perfectly to any single provider, requiring consensus on what that field means.
- **Negative:** Metadata fields can be abused — teams may be tempted to put too much in `metadata` rather than extending the canonical model, leading to type-unsafe code downstream.