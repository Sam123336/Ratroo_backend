# Deployment

## Current State

The API can build locally with:

```bash
cd apps/api
npm run build
```

The current schema is not yet reproducible from migrations. Deployment is blocked until migration scripts exist and have been verified from an empty database.

## Required Before Production

- Add migration scripts:
  - `migration:run`
  - `migration:status`
  - `migration:undo`
  - `migration:create`
- Add an initial schema migration that creates PostGIS and all Sequelize tables/indexes.
- Disable `DB_SYNCHRONIZE` in production.
- Configure Redis for BullMQ.
- Run provider imports from worker jobs; WBBUS 500-item verification passed, but full imports should not depend on blocking worker-to-API HTTP requests.
- Configure CORS allowlist and production error sanitization.
- Document backup and restore.

## Environment

Required:

```env
DATABASE_URL=...
INTERNAL_INGESTION_API_KEY=...
```

Pending:

```env
REDIS_URL=redis://localhost:6379
PROVIDER_SYNC_ENABLED=false
```

## Worker Deployment

The worker has a BullMQ processor for `transit-import` jobs. It requires:

- `REDIS_URL`
- `API_BASE_URL`
- `INTERNAL_INGESTION_API_KEY`

Until Redis is configured in the target environment, full provider imports must not be described as production-ready.

For local development, Redis is available through:

```bash
docker compose -f docker/docker-compose.yml up -d redis
```
