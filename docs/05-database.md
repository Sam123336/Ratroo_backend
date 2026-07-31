# Database Plan

See also: [database.md](database.md).

## ORM Direction

The target API stack is NestJS with Sequelize. Sequelize models live inside feature infrastructure folders, not in one global model directory.

```text
modules/transit/infrastructure/sequelize/models/
modules/regions/infrastructure/sequelize/models/
modules/community/infrastructure/sequelize/models/
```

Repository interfaces stay in the domain/application boundary so the ORM can change without leaking into use cases.

## Schemas

| Schema | Purpose |
| --- | --- |
| `transit` | Stops, routes, trips, stop times, agencies |
| `provider` | Import runs, source records, raw payload references |
| `journey` | Transfer graph, cached journey plans, walking edges |
| `coverage` | State, district, city, provider readiness |
| `community` | Submissions, votes, moderation, reputation |
| `admin` | Internal audit and operator activity |

## Required Near-Term Tables

| Table | Purpose |
| --- | --- |
| `provider.import_runs` | Tracks each full or incremental import |
| `provider.source_records` | Stores source URL, checksum, provider key, and parse status |
| `coverage.states` | Normalized Indian state and UT records |
| `coverage.districts` | District hierarchy |
| `coverage.cities` | City/town coverage status |
| `journey.stop_transfers` | Precomputed walking transfers between stops |
| `community.corrections` | User-submitted stop/route/timing corrections |

## Geography Strategy

- Store coordinates as WGS84 latitude/longitude and PostGIS `geography(Point, 4326)`.
- Use GiST indexes for nearby stop queries.
- Use district/city/state columns for reporting, but geography remains the source of spatial truth.
- Add `confidence_score` to imported geospatial records when source precision varies.

## Source Traceability

Every imported entity should be traceable back to:

- Provider key
- External ID
- Source URL or feed ID
- Import run ID
- Raw payload checksum
- Parser version
- Timestamp imported
