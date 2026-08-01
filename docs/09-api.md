# API Plan

See also: [api.md](api.md).

## Public APIs

| Endpoint | Purpose | Status |
| --- | --- | --- |
| `GET /v1/health` | Health check | Current |
| `GET /v1/stops/nearby` | Nearby stops | Current |
| `GET /v1/stops/:id` | Stop details | Current |
| `GET /v1/routes` | Route list | Current |
| `GET /v1/routes/:id` | Route details | Current |
| `GET /v1/stops/search` | Text stop search | Planned |
| `POST /v1/journey/plan` | Generic journey planning | Planned |
| `GET /v1/coverage` | Coverage map | Planned |
| `POST /v1/community/corrections` | Submit correction | Planned |
| `GET /v1/regions/karnataka` | Karnataka launch-region metadata for clients | Current |
| `GET /v1/regions/bengaluru/network-summary` | Bengaluru UI readiness, modes, counts, and active dataset IDs | Current |
| `GET /v1/regions/bengaluru/search?q=majestic` | Bengaluru multimodal search across imported metro and bus records | Current |
| `GET /v1/regions/bengaluru/nearby?lat=12.97&lng=77.59` | Bengaluru nearby nodes where coordinates exist | Current |
| `GET /v1/regions/bengaluru/journeys?from=Majestic&to=MG%20Road` | Bengaluru Journey Engine MVP across promoted bus and metro data | Current |
| `GET /v1/regions/bengaluru/coverage` | Bengaluru provider/data coverage status | Current |
| `GET /v1/regions/bengaluru/metro/lines` | Promoted Bengaluru metro lines | Current |
| `GET /v1/regions/bengaluru/metro/stations` | Promoted Bengaluru metro stations | Current |
| `GET /v1/regions/bengaluru/bus/routes` | Promoted Bengaluru BMTC routes; empty until BMTC dataset exists | Current |
| `GET /v1/regions/bengaluru/bus/stops` | Promoted Bengaluru BMTC stops; empty until BMTC dataset exists | Current |
| `GET /v1/regions/west-bengal/bus/routes` | Promoted West Bengal WBBus routes | Current |
| `GET /v1/regions/west-bengal/bus/stops` | Promoted West Bengal WBBus stops | Current |

## Internal APIs

| Endpoint | Purpose |
| --- | --- |
| `POST /internal/providers/:code/sync` | Trigger provider import |
| `POST /internal/providers/BMTC_OFFICIAL/sync` | Import Bengaluru BMTC GTFS feed into bus query tables; use `?async=true` for full feed |
| `POST /internal/dataset-versions/:id/promote` | Promote staged dataset version |
| `GET /internal/imports` | Import history |
| `GET /internal/providers` | Provider registry and health |
| `GET /internal/coverage/gaps` | Coverage backlog |
| `POST /internal/community/:id/moderate` | Moderate correction |

## Response Rules

- Include source confidence where journey data is inferred.
- Include provider attribution where required.
- Keep public IDs stable.
- Never expose raw scraped payloads through public APIs.
- Return partial results with warnings rather than empty success when coverage is incomplete.
- Internal mutation APIs require `x-internal-api-key`.

## Bengaluru Journey MVP

```http
GET /v1/regions/bengaluru/journeys?from=Majestic&to=MG%20Road
```

The first Journey Engine implementation reads only promoted query tables. It supports:

- Direct BMTC bus route matches by ordered route stops
- Direct BMRCL metro line matches by ordered line stations
- One-transfer BMTC ↔ BMRCL itineraries using name-based transfer matching
- Walking transfer placeholder legs

Limitations until the OSM walking graph is imported:

- Walking distance is estimated, not routed on roads/footpaths.
- Metro ↔ bus transfer matching uses station/stop names rather than verified pedestrian edges.
- BMTC timetable ranking requires a full trips/stop_times import.
