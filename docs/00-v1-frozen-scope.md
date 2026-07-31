# Yatroo Mobility Platform V1

This document freezes V1 scope. BMRCL Metro and WBBus prove the ingestion pipeline, but they are not the full launch scope. Do not add Kerala, Odisha, MP, Delhi, events, or AI planning until the V1 journeys below work end to end.

## Launch Regions

Only these regions are active:

```text
India
├── West Bengal
│   ├── Kolkata
│   ├── Hooghly
│   ├── Howrah
│   ├── Bankura
│   ├── Purulia
│   └── other West Bengal districts as coverage improves
└── Karnataka
    └── Bengaluru
```

Karnataka statewide services remain in backlog after Bengaluru is stable.

## Transport Modes

West Bengal:

```text
BUS
PRIVATE BUS
METRO
SUBURBAN RAIL
FERRY
TRAM
AUTO
WALK
```

Bengaluru:

```text
BMTC
METRO
AIRPORT BUS
METRO FEEDER
SHUTTLE (future)
AUTO (future)
WALK
```

Airport, metro feeder, night, express, Vajra, and premium BMTC services are not providers. They are `serviceClass` values under `BMTC_OFFICIAL`.

## Provider Registry

West Bengal:

```text
WBBUS
WBTC
SBSTC
NBSTC
KOLKATA_METRO
EASTERN_RAILWAY_SUBURBAN
WB_FERRY
KOLKATA_AUTO
KOLKATA_TRAM
```

Bengaluru:

```text
BMTC_OFFICIAL
BMRCL_METRO
OSM_ROAD_NETWORK_BENGALURU
BENGALURU_AUTO (future)
BENGALURU_SHUTTLE (future)
```

## Geography

```text
Country
↓
State
↓
Coverage Area
↓
District
↓
City
↓
Locality
↓
Mobility Node
```

Coverage areas are more flexible than districts. Examples:

```text
West Bengal
├── North Bengal
├── South Bengal
└── Kolkata Metropolitan Area

Bengaluru
├── East
├── West
├── Central
├── North
└── South
```

Routes can cross coverage areas, districts, and states. Use mapping tables instead of storing one district on a route:

```text
coverage_areas
provider_coverage_areas
route_coverage_areas
dataset_coverage_areas
```

## Dataset Lifecycle

Freeze the provider dataset lifecycle:

```text
DISCOVERING
↓
FETCHING
↓
RAW
↓
PARSING
↓
VALIDATING
↓
MAPPING
↓
STAGED
↓
PROMOTING
↓
ACTIVE
```

Never allow parser output to write directly into canonical query tables. The direction is:

```text
External Source
↓
Raw Source Record
↓
Provider Parser
↓
Validation
↓
Canonical Observation
↓
Conflict Resolution
↓
Canonical Entity
↓
Journey Graph
```

## Worker Structure

Provider ingestion should move to asynchronous workers:

```text
Discovery Worker
↓
Fetch Worker
↓
Parse Worker
↓
Validation Worker
↓
Mapping Worker
↓
Promotion Worker
↓
Coverage Worker
↓
Journey Graph Worker
```

## API Scope

Mobile API:

```text
Journey
Stops
Search
Coverage
Nearby
Planner
```

Internal API:

```text
Provider Sync
Dataset Promotion
Provider Runs
Coverage Refresh
Conflict Review
```

Internal APIs must require an internal API key, admin role, private-network access, or worker-only invocation.

## Flutter Modules

```text
Authentication
Home
Journey
Map
Nearby
Saved
Coverage
Profile
```

Admin is a separate future app.

## Launch Order

1. West Bengal: WBBus, journey engine, Flutter launch path.
2. Add WBTC, SBSTC, and NBSTC for broader West Bengal bus coverage.
3. Add Kolkata Metro, then bus + metro journeys.
4. Bengaluru: BMTC, BMRCL Metro, walking.
5. Community: add route, confirm route, update fare, bus missing, delay.
6. Future states only after V1 stability.

## V1 Success Criteria

West Bengal:

- Arambagh to Kharagpur by private bus.
- Howrah to Salt Lake by bus and metro.
- Bandel to Sealdah by suburban rail.
- Dakshineswar to Belur by ferry and walk.

Bengaluru:

- Whitefield to MG Road by BMTC and metro.
- Airport to Electronic City by Vayu Vajra, metro, and walk.
- Majestic to Koramangala by BMTC.

V1 is complete when these journeys are planned correctly with transfers, walking legs, and estimated travel times.

## Mobility Naming

Core packages and domain language should use mobility, not bus-only or transit-only names:

```text
packages/
├── mobility-core/
├── journey-engine/
├── canonical-model/
├── provider-sdk/
├── geo-engine/
└── routing-engine/
```

The platform must remain ready for metro, rail, auto, ferry, cycling, and walking without renaming the core architecture.
