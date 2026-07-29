# ADR-0005: Bounded Contexts — Separation of Transit, Journey, Places, and Planner Domains

**Status:** Accepted  
**Date:** 2026-07-30

## Context

The transit platform serves multiple concerns: storing and querying static transit data (stops, routes, trips), planning journeys (multi-modal routes between addresses), searching points of interest, and managing real-time vehicle positions. Treating all of this as a single monolithic domain leads to bloated entities, unclear ownership, and tight coupling between features that evolve at different speeds.

Domain-Driven Design prescribes **bounded contexts** as a way to split a large domain into smaller, internally consistent sub-domains with explicit relationships between them.

## Decision

The system is split into four bounded contexts:

### 1. Transit Context (`/transit/`)

**Purpose:** Authoritative source of static transit data — stops, routes, trips, agencies, stop times.

**Entities:** `Stop`, `Route`, `Trip`, `Agency`, `StopTime`

**Owns:** Importing from providers, canonical model mapping, spatial indexing, stop search.

**Relations:** Provides stop/routes data to `Planner` context via a shared kernel (canonical model interfaces).

### 2. Journey Context (`/journey/`) — Future

**Purpose:** End-to-end journey planning across multiple modes and providers.

**Entities:** (Future) `JourneyPlan`, `JourneyLeg`, `JourneySegment`

**Owns:** Route finding algorithms, transfer optimization, multi-modal scheduling.

**Relations:** Depends on `Transit` context for stop/route data and `Places` for POI search. Does not depend on `Planner` context.

### 3. Places Context (`/places/`) — Future

**Purpose:** Points of interest, geocoding, reverse geocoding, landmarks.

**Entities:** (Future) `Place`, `Address`, `Landmark`

**Owns:** Place search, geocoding provider integrations, place categorization.

**Relations:** Provides location context to `Journey` for origin/destination resolution.

### 4. Planner Context (`/planner/`) — Future

**Purpose:** Personal trip planning, saved routes, notifications.

**Entities:** (Future) `SavedRoute`, `TripPlan`, `Alert`

**Owns:** User preferences, recurring trips, delay alerts, notification dispatch.

**Relations:** Consumes data from `Transit` and `Journey` contexts.

### Implementation Rules

1. **Separate directories** — Each context lives in its own directory under `modules/` with its own domain, application, infrastructure, and presentation layers.
2. **Explicit context maps** — Contexts communicate only through designated integration points (canonical model interfaces, domain events, or anti-corruption layers).
3. **No cross-context entity references** — One context never directly imports entities from another context. Data is shared via value objects or IDs.
4. **Independent schemas** — Each context can have its own database schema (PostgreSQL schemas: `transit`, `journey`, `places`, `planner`).
5. **Evolution independence** — A bounded context can be extracted into a separate microservice if needed without changing other contexts.

## Consequences

- **Positive:** Large codebase is navigable — each context is independently understandable and testable.
- **Positive:** Teams can work on different contexts without merge conflicts or needing deep understanding of other contexts.
- **Positive:** Future extraction to microservices is architecturally prepared — each context already has its own domain, repository interfaces, and schema.
- **Positive:** Context boundaries force explicit integration contracts, preventing accidental coupling.
- **Negative:** More initial directory structure and boilerplate compared to a single flat module.
- **Negative:** Cross-context queries (e.g., "stops near my saved place") require either a domain event or a shared query service, adding indirection.
- **Negative:** In the early stages, some contexts (Journey, Places, Planner) exist only as stubs, which may feel like premature abstraction.