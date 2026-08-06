# Deployment

## Current State

The API can build locally with:

```bash
cd apps/api
npm run build
```

## Migrations

Umzug + Sequelize, tracked in the `sequelize_meta` table. Migrations live in
`apps/api/src/database/migrations/` and run in filename order (timestamp prefix).

```bash
cd apps/api
npm run migrate:create -- add-ferry-terminals   # scaffold a migration
npm run migrate                                 # apply everything pending
npm run migrate:status                          # applied vs pending
npm run migrate:down                            # roll back the last one
```

Every `up` needs a `down` that undoes it exactly — `migrate:down` is the only way
back. The generated template creates and drops a table; edit both halves.

`DB_SYNCHRONIZE` already defaults to `false` whenever `DATABASE_URL` is set, so
production never auto-syncs. Leave it that way.

## Vercel

The Vercel project's **Root Directory must be `apps/api`** — that is where the
Nest dependencies are installed. Config lives in `apps/api/vercel.json`, and the
serverless entry is `apps/api/api/index.ts` (outside `src/`, so `nest build`
ignores it). The Nest app is cached per warm container; only cold starts pay
bootstrap.

Environment variables to set in the Vercel project:

```env
DATABASE_URL=...
INTERNAL_INGESTION_API_KEY=...
CRON_SECRET=...            # Vercel sends this as `Authorization: Bearer <secret>`
REDIS_URL=...              # required for the nightly sync — see below
```

### What must not run on Vercel

A Vercel function is killed as soon as it responds, and is hard-capped by
`maxDuration`. A full provider import (WBBus alone is ~1280 items over an
external site) cannot run inside one.

So the ingestion path is split:

```text
Vercel Cron  ──GET──>  /internal/cron/provider-sync   (returns immediately)
                              │
                              └─ enqueues one BullMQ job per provider
                                        │
                        apps/worker (long-lived host) picks them up
                                        │
                                        └─> POST /internal/providers/:code/sync
```

**The worker must run on a long-lived host** (Railway, Fly, Render, or the
included `docker/`), not on Vercel. If the worker calls back into a Vercel-hosted
API, heavy imports will still hit the function timeout — point `API_BASE_URL` at
a long-lived API instance for ingestion, and use Vercel for the read-only public
API.

Without `REDIS_URL` the cron endpoint falls back to running the sync inline. That
is correct on a long-lived host and **will be truncated on Vercel** — the
endpoint logs a warning when it happens.

## Required Before Production

- Add an initial schema migration that creates PostGIS and all Sequelize tables/indexes
  (the existing tables were created by auto-sync and have no migration history).
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
