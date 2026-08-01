# Runbook

## Local API

```bash
cd apps/api
npm run build
DB_SYNCHRONIZE=true npm run start:dev
```

`DB_SYNCHRONIZE=true` is development-only. Production must use migrations.

## Internal Provider Sync

All internal sync routes require:

```http
x-internal-api-key: $INTERNAL_INGESTION_API_KEY
```

Examples:

```bash
curl -X POST "http://localhost:3000/internal/providers/BMRCL/sync" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"

curl -X POST "http://localhost:3000/internal/providers/BMTC_OFFICIAL/sync?maxRoutePatterns=50" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"

curl -X POST "http://localhost:3000/internal/providers/WBBUS/sync?maxItems=100&maxPages=20" \
  -H "x-internal-api-key: $INTERNAL_INGESTION_API_KEY"
```

## Verification

```bash
curl "http://localhost:3000/v1/regions/bengaluru/network-summary"
curl "http://localhost:3000/v1/regions/bengaluru/journeys?from=Anekal&to=MG%20Road"
curl "http://localhost:3000/v1/regions/west-bengal/bus/routes"
curl "http://localhost:3000/v1/regions/west-bengal/bus/stops"
curl "http://localhost:3000/v1/provider-runs"
```

## Production Blockers

- Add and run migrations before disabling `DB_SYNCHRONIZE`.
- Configure Redis/BullMQ before full provider sync.
- Move full sync execution out of blocking API requests.
- Add rate limits and DTO validation before public exposure.

## Worker

Start local Redis:

```bash
docker compose -f docker/docker-compose.yml up -d redis
```

Build:

```bash
cd apps/worker
npm install
npm run build
```

Required environment:

```env
REDIS_URL=redis://...
API_BASE_URL=http://localhost:3000
INTERNAL_INGESTION_API_KEY=...
```

Local default:

```env
REDIS_URL=redis://localhost:6379
```

Start worker:

```bash
npm run start
```

Enqueue a provider sync:

```bash
npm run enqueue -- BMTC_OFFICIAL 500
```

Current verified state: worker build passes. Runtime was verified with temporary local Redis at `redis://localhost:6379`; BMRCL and WBBUS provider jobs completed through the queue.
