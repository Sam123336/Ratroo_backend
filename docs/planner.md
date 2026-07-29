# Future Journey Planning Architecture

## Purpose

The journey planner is the system's principal consumer — given an origin, destination, and desired departure time, it finds the best sequence of transit legs to travel between them. This document outlines the planned architecture, algorithms, and data structures.

**Status:** Draft / Planned (not yet implemented)

## High-Level Architecture

```
User Request (origin, dest, time, preferences)
        │
        ▼
┌─────────────────────────────────────┐
│         Journey Planner Core        │
│  (Strategy pattern — algorithm-dn)  │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│        Street Network (OSRM)        │
│  Walking / biking / auto legs       │
│  Open Source Routing Machine        │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│        Transit Router (Raptor)      │
│  Range-based connection scan        │
│  Modified Raptor algorithm          │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│         Result Builder              │
│  Leg → Journey → Response          │
│  Multi-criteria ranking            │
└─────────────────────────────────────┘
```

## Domain Model (Future — Journey Bounded Context)

The journey planner operates in the **journey** bounded context, which will have its own entities and repositories:

```typescript
// apps/api/src/modules/journey/domain/entities/JourneyPlan.ts
export class JourneyPlan {
  constructor(
    public readonly id: string,
    public readonly legs: JourneyLeg[],
    public readonly totalDuration: number,      // minutes
    public readonly totalDistance: number,       // meters
    public readonly totalTransfers: number,
    public readonly departureTime: Date,
    public readonly arrivalTime: Date,
  ) {}
}

export class JourneyLeg {
  constructor(
    public readonly mode: 'walk' | 'transit' | 'auto' | 'bike' | 'wait',
    public readonly from: JourneyLocation,
    public readonly to: JourneyLocation,
    public readonly startTime: Date,
    public readonly endTime: Date,
    public readonly duration: number,             // minutes
    public readonly distance: number,             // meters
    public readonly routeId?: string,             // for transit legs
    public readonly tripId?: string,              // for transit legs
    public readonly routeName?: string,           // e.g., "S-14"
    public readonly provider?: string,            // e.g., "wbbus"
    public readonly geometry?: GeoJSON.LineString, // path geometry
  ) {}
}

export class JourneyLocation {
  constructor(
    public readonly lat: number,
    public readonly lng: number,
    public readonly stopId?: string,             // if at a known stop
    public readonly name?: string,               // placeholder for geocoded addresses
  ) {}
}
```

## Algorithm Selection

### Chosen Approach: Modified Raptor (Range-based Connection Scan)

The **Raptor** algorithm (Round-bAsed Public Transit Optimized Router) is the industry standard for multi-criteria transit planning. It handles:

- Multiple departure times
- Transfers
- Walking between stops
- Trip-specific variations (different schedules, routes)

### Why Not Alternatives

| Algorithm | Pros | Cons |
|-----------|------|------|
| Dijkstra/A* | Simple, exact | Transfers become path explosion; no timetable awareness |
| Connection Scan (CSA) | Fast, handles timetables | Single-criteria only (does not optimize both time and transfers) |
| Contraction Hierarchies | Precomputed, fast | Difficult to update with schedule changes |
| **Modified Raptor** | Multi-criteria, range-based, handles real-time updates | Memory intensive for huge networks |

### Algorithm Flow

```
1. Find stops within walking distance of origin (street network)
2. For each departure time in the time range (±30min):
   a. Initialize round 0 with all reachable stops by walking
   b. For each round r = 1..maxTransfers:
      - While there are unprocessed trips:
        - Board: earliest trip for each route serving the stop
        - Alight: update arrival times at downstream stops
        - Transfer: if walking to another stop is faster, update that stop
   c. Collect best arrival times at destination
3. Reconstruct optimal journeys from Pareto frontier
4. Rank results by:
   - Total travel time (primary)
   - Number of transfers (secondary)
   - Walking distance (tertiary)
```

## Data Requirements (From Transit Context)

The journey planner depends on the following data from the transit context:

| Data | Source | Latency Requirement |
|------|--------|---------------------|
| Stop locations (with geography) | Stops table | Near-real-time |
| Routes | Routes table | Near-real-time |
| Trip schedules | Trips + StopTimes tables | Near-real-time (hourly refresh OK) |
| Walking distances between stops | Precomputed via OSRM | Updated on stop changes |
| Transfer times | Precomputed or estimated | Updated on stop changes |

### Precomputed Transfers

Walking distances between stops within 800m of each other are precomputed using OSRM and stored in a `stop_transfers` table:

```typescript
// Future table: journey.stop_transfers
export interface StopTransfer {
  fromStopId: string;
  toStopId: string;
  walkingDistance: number;  // meters
  walkingDuration: number;  // seconds
  geometry: GeoJSON.LineString;  // walking path
}
```

This table is rebuilt whenever stop locations change significantly.

## Street Network Integration

Walking legs use **OSRM** (Open Source Routing Machine) running locally or as a managed service:

- **Origin → First Stop:** Walk from user's location to the nearest transit stop (or stops within 800m)
- **Transfer Between Stops:** Walk from alighting stop to boarding stop
- **Last Stop → Destination:** Walk from final stop to destination

OSRM is queried via HTTP (HTTP API at `http://localhost:5000/route/v1/walking/...`) with the `foot` profile.

## Real-Time Updates (Future)

Planned support for real-time updates:

1. **GTFS-RT feeds** — When providers offer real-time trip updates, they are stored in a `journey.realtime_updates` table
2. **Raptor modification** — Before each round, check for trip cancellations, delays, and added trips
3. **Cache invalidation** — Journey results can be cached but must be invalidated when real-time updates are received

## Journey Response API (Planned — Not Yet Implemented)

```
POST /api/journey/plan
{
  "origin": { "lat": 22.567, "lng": 88.367 },
  "destination": { "lat": 22.580, "lng": 88.430 },
  "departureTime": "2026-08-01T08:00:00+05:30",
  "arrivalWindow": 30,           // minutes — search departures ±30min
  "maxTransfers": 3,
  "walkingSpeed": 1.4,           // meters/second (default)
  "wheelchair": false,
  "preferences": {
    "fewerTransfers": false,
    "lessWalking": false
  }
}

Response:
{
  "journeys": [
    {
      "totalDuration": 45,
      "totalTransfers": 1,
      "totalWalkingDistance": 850,
      "departureTime": "2026-08-01T08:15:00+05:30",
      "arrivalTime": "2026-08-01T09:00:00+05:30",
      "legs": [
        {
          "mode": "walk",
          "from": { "lat": 22.567, "lng": 88.367, "name": "Howrah Station" },
          "to": { "lat": 22.569, "lng": 88.365, "stopId": "wbbus:1234", "name": "Howrah Station Bus Stop" },
          "duration": 5,
          "distance": 400,
          "geometry": { "type": "LineString", "coordinates": [[88.367,22.567],[88.365,22.569]] }
        },
        {
          "mode": "transit",
          "from": { "stopId": "wbbus:1234", "name": "Howrah Station Bus Stop" },
          "to": { "stopId": "wbbus:5678", "name": "Salt Lake Sector V" },
          "duration": 35,
          "distance": 12000,
          "routeId": "wbbus:S-14",
          "tripId": "wbbus:trip_20260801_0815",
          "routeName": "S-14",
          "provider": "wbbus",
          "geometry": { "type": "LineString", "coordinates": [...] }
        },
        {
          "mode": "walk",
          "from": { "stopId": "wbbus:5678", "name": "Salt Lake Sector V" },
          "to": { "lat": 22.580, "lng": 88.430, "name": "Tech Park" },
          "duration": 5,
          "distance": 450,
          "geometry": { "type": "LineString", "coordinates": [[88.425,22.578],[88.430,22.580]] }
        }
      ]
    }
  ]
}
```

## Implementation Plan

### Phase 1 — Foundation
- [ ] Precompute walking transfers between nearby stops
- [ ] Implement OSRM client for walking routes
- [ ] Build the journey planner core module structure (interfaces, no algorithm yet)
- [ ] Create journey domain entities (JourneyPlan, JourneyLeg, JourneyLocation)

### Phase 2 — Core Algorithm
- [ ] Implement Modified Raptor algorithm
- [ ] Implement result reconstruction (walking→transit→walking patterns)
- [ ] Integrate with OSRM for walking legs
- [ ] Multi-criteria ranking

### Phase 3 — Performance
- [ ] Implement journey plan caching (in-memory with TTL)
- [ ] Profile and optimize Raptor (query plan, index usage)
- [ ] Add cancellation support (AbortController for long queries)

### Phase 4 — Real-Time
- [ ] GTFS-RT feed ingestion
- [ ] Real-time aware Raptor (delay, cancellation, added trips)
- [ ] Cache invalidation on real-time updates

### Phase 5 — Advanced Features
- [ ] Wheelchair-accessible routing
- [ ] Multi-modal: bus + metro + train + ferry in one journey
- [ ] Route learning (track popular journeys)
- [ ] Alternative route suggestions

## Related ADRs

- ADR-0005: Bounded Contexts — Journey context exists separately from Transit
- ADR-0003: Hexagonal Architecture — Journey planner core is domain, with ports for OSRM and transit repositories
- ADR-0001: Use PostGIS — Walking distances computed using spatial queries between stop geographies