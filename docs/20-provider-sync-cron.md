# Provider Sync Cron

## Migrations

The *existing* tables were created by Sequelize auto-sync (`DB_SYNCHRONIZE=true`),
so they have no migration history. Every table from here on goes through a
migration instead:

```bash
cd apps/api
npm run migrate:create -- add-ferry-terminals
npm run migrate
```

`DB_SYNCHRONIZE` already defaults to `false` when `DATABASE_URL` is set. See
[deployment.md](./deployment.md) for the full migration workflow, and note the
outstanding task to backfill an initial schema migration for the auto-synced
tables.

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

It runs **nightly at 02:00 IST** (`@Cron` in `ProviderSyncSchedulerService`) and
covers every syncable provider unless you narrow the list.

```env
PROVIDER_SYNC_CRON_ENABLED=true
# Optional overrides:
PROVIDER_SYNC_CRON=0 2 * * *          # standard 5-field cron
PROVIDER_SYNC_TIMEZONE=Asia/Kolkata
PROVIDER_SYNC_PROVIDERS=WBBUS,WBTC    # defaults to every provider below
WBBUS_SYNC_MAX_ITEMS=1280
WBBUS_SYNC_MAX_PAGES=200
```

One failing provider is logged and skipped; the rest of the night's run
continues. A run that is still going when the next one fires is dropped, not
queued.

> The in-process `@Cron` only fires on a host that stays resident (docker,
> Railway, Fly). **On Vercel there is no resident process** — use the Vercel Cron
> entry in `apps/api/vercel.json`, which hits `/internal/cron/provider-sync`.
> See [deployment.md](./deployment.md).

Then start the API:

```bash
cd /Users/sambit/Yatroo_backend/apps/api
npm run start:dev
```

The scheduler currently supports only real implemented importers:

```text
WBBUS
WBTC
WTBC
BMRCL
BMRCL_METRO
BMTC
BMTC_OFFICIAL
NBSTC
SBSTC
KOLKATA_METRO
WB_FERRY
KOLKATA_TRAM
EASTERN_RAILWAY_SUBURBAN
```

Do not add other provider codes here until their real provider adapters are implemented. The scheduler will skip unsupported provider codes.

## Recommended Local Full Sync

For one full WBBus run, prefer the internal endpoint first:

```bash
curl -X POST "http://localhost:3000/internal/providers/WBBUS/sync?maxItems=1280&maxPages=200" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"
```

After the first full run, enable the scheduler at a slower interval such as every 6 or 12 hours. WBBus is an external site, so avoid very aggressive polling.

## West Bengal Government Bus, Metro, Ferry, Tram, And Rail Sync

WBTC, NBSTC, SBSTC, Kolkata Metro, West Bengal Ferry, Kolkata Tram, and Eastern Railway suburban now use the same ingestion lifecycle as WBBUS:

```text
discover
fetch
save raw source record
parse
validate
map canonical records
stage
promote
serve through public API
```

Manual sync:

```bash
curl -X POST "http://localhost:3000/internal/providers/NBSTC/sync" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"

curl -X POST "http://localhost:3000/internal/providers/WBTC/sync" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"

curl -X POST "http://localhost:3000/internal/providers/SBSTC/sync" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"

curl -X POST "http://localhost:3000/internal/providers/KOLKATA_METRO/sync" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"

curl -X POST "http://localhost:3000/internal/providers/WB_FERRY/sync" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"

curl -X POST "http://localhost:3000/internal/providers/KOLKATA_TRAM/sync" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"

curl -X POST "http://localhost:3000/internal/providers/EASTERN_RAILWAY_SUBURBAN/sync" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"
```

Recommended West Bengal cron:

```env
PROVIDER_SYNC_CRON_ENABLED=true
PROVIDER_SYNC_RUN_ON_START=true
PROVIDER_SYNC_INTERVAL_MINUTES=720
PROVIDER_SYNC_PROVIDERS=WBBUS,WBTC,NBSTC,SBSTC,KOLKATA_METRO,WB_FERRY,KOLKATA_TRAM,EASTERN_RAILWAY_SUBURBAN
WBBUS_SYNC_MAX_ITEMS=1280
WBBUS_SYNC_MAX_PAGES=200
```

After import, check:

```bash
curl "http://localhost:3000/v1/regions/west-bengal/bus/routes?search=Kolkata"
curl "http://localhost:3000/v1/regions/west-bengal/bus/stops?search=Siliguri"
curl "http://localhost:3000/v1/regions/west-bengal/bus/routes?search=Dakshineswar"
curl "http://localhost:3000/v1/regions/west-bengal/bus/routes?search=Sealdah"
curl "http://localhost:3000/v1/regions/west-bengal/metro/lines"
curl "http://localhost:3000/v1/regions/west-bengal/metro/stations?search=Esplanade"
```

SBSTC note: the live official route page can time out from local runtime environments. The adapter has a timeout and falls back to a maintained snapshot from the official route-table page, with a validation warning, so client UI development is not blocked.

Ferry, Tram, and Eastern Railway suburban note: each adapter fetches an official public source page and uses a maintained seed snapshot when that source is not a stable machine-readable route API. The promoted data is enough for client-side route browsing, but launch-grade journey planning still needs coordinates, schedules, and source enrichment.

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
