# Provider Sync Cron

## Why There Is No Migration Yet

The current database tables were created by Sequelize auto-sync:

```env
DB_SYNCHRONIZE=true
```

That means Sequelize inspected the registered models and created/updated tables directly when the NestJS API started. DBeaver can see the tables, but there is no migration history because no migration files were executed.

For production, move away from auto-sync:

```env
DB_SYNCHRONIZE=false
```

Then create explicit Sequelize migrations for every table. Until that migration system exists, treat auto-sync as a development bootstrap tool only.

## Why Only Some Data Appeared

The WBBus import was intentionally run with a small limit:

```bash
POST /internal/providers/WBBUS/sync?maxItems=25&maxPages=5
```

So only a sample set was imported. For the full WBBus directory, use a higher cap:

```bash
POST /internal/providers/WBBUS/sync?maxItems=1280&maxPages=200
```

DBeaver row count estimates can also show `-1` until PostgreSQL statistics are refreshed. Use explicit counts when checking real data:

```sql
select count(*) from staged_nodes;
select count(*) from staged_routes;
select count(*) from staged_route_stops;
select count(*) from staged_stop_times;
select count(*) from stops;
select count(*) from routes;
select count(*) from trips;
```

## Scheduler

The API includes a controlled provider sync scheduler. It is disabled by default.

Enable it only when you want the API process to keep syncing providers:

```env
PROVIDER_SYNC_CRON_ENABLED=true
PROVIDER_SYNC_RUN_ON_START=true
PROVIDER_SYNC_INTERVAL_MINUTES=360
PROVIDER_SYNC_PROVIDERS=WBBUS
WBBUS_SYNC_MAX_ITEMS=1280
WBBUS_SYNC_MAX_PAGES=200
```

Then start the API:

```bash
cd /Users/sambit/Yatroo_backend/apps/api
npm run start:dev
```

The scheduler currently supports only real implemented importers:

```text
WBBUS
BMRCL
BMRCL_METRO
BMTC
BMTC_OFFICIAL
```

Do not add `WBTC`, `NBSTC`, `SBSTC`, or other provider codes here until their real provider adapters are implemented. The scheduler will skip unsupported provider codes.

## Recommended Local Full Sync

For one full WBBus run, prefer the internal endpoint first:

```bash
curl -X POST "http://localhost:3000/internal/providers/WBBUS/sync?maxItems=1280&maxPages=200" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"
```

After the first full run, enable the scheduler at a slower interval such as every 6 or 12 hours. WBBus is an external site, so avoid very aggressive polling.

## Bengaluru BMTC GTFS Sync

BMTC can be imported from a GTFS ZIP feed:

```env
BMTC_GTFS_URL=https://github.com/Vonter/bmtc-gtfs/raw/refs/heads/main/gtfs/bmtc.zip
BMTC_GTFS_INCLUDE_TRIPS=false
BMTC_GTFS_MAX_ROUTE_PATTERNS=500
```

Default mode imports UI-ready bus data:

```text
agencies
stops
routes
route stop order
coordinates
service classes
```

Set `BMTC_GTFS_INCLUDE_TRIPS=true` only when running a worker-sized import for trips and stop times. The full timetable is much heavier than the route/stop dataset.

Manual sync:

```bash
curl -X POST "http://localhost:3000/internal/providers/BMTC_OFFICIAL/sync?maxRoutePatterns=500" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"
```

For the full feed, prefer background mode so the HTTP client does not time out while the import keeps running:

```bash
curl -X POST "http://localhost:3000/internal/providers/BMTC_OFFICIAL/sync?async=true&maxRoutePatterns=500" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"
```

Scheduled Bengaluru sync:

```env
PROVIDER_SYNC_CRON_ENABLED=true
PROVIDER_SYNC_RUN_ON_START=true
PROVIDER_SYNC_INTERVAL_MINUTES=720
PROVIDER_SYNC_PROVIDERS=BMRCL_METRO,BMTC_OFFICIAL
BMTC_GTFS_URL=https://github.com/Vonter/bmtc-gtfs/raw/refs/heads/main/gtfs/bmtc.zip
```

After import, check:

```bash
curl "http://localhost:3000/v1/regions/bengaluru/network-summary"
curl "http://localhost:3000/v1/regions/bengaluru/bus/routes"
curl "http://localhost:3000/v1/regions/bengaluru/bus/stops"
curl "http://localhost:3000/v1/regions/bengaluru/search?q=majestic"
```

## Current Rule

Use this flow:

```text
Manual full sync
↓
Verify counts and API results
↓
Enable scheduled sync
↓
Keep adding real provider adapters one by one
```

Do not try to reach 100 percent coverage by scheduling providers that do not have complete importers yet.
