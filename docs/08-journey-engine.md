# Journey Engine

See also: [planner.md](planner.md).

## MVP Routing Stages

| Stage | Capability |
| --- | --- |
| 1 | Nearby stops from origin and destination |
| 2 | Direct route between origin-side and destination-side stops |
| 3 | One-transfer route search |
| 4 | Multi-transfer graph search |
| 5 | Timetable-aware routing |
| 6 | Real-time routing |

## Walking Engine

MVP walking uses straight-line or PostGIS distance with conservative penalties. Later stages use OSRM or another routing engine for footpaths.

Walking legs are needed for:

- Origin to first stop
- Transfer stop to transfer stop
- Last stop to destination
- Nearby alternative stop discovery

## Transfer Algorithm

1. Build stop-to-route index.
2. Build route-to-stop sequence index.
3. For each candidate origin stop, find routes serving it.
4. For direct plans, find destination-side stops later in the same route pattern.
5. For one-transfer plans, intersect downstream route sets with destination route sets.
6. Rank by estimated duration, transfer count, walking distance, and confidence.

## Confidence Labels

| Label | Meaning |
| --- | --- |
| High | Official schedule or verified GTFS |
| Medium | Official route list with inferred timings |
| Low | Scraped or community data without recent verification |
| Experimental | Incomplete route geometry or uncertain stop order |

