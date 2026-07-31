# Folder Structure

## Current Repository

```text
apps/
  api/
  worker/
docs/
providers/
src/
data/
docker/
```

The root `src/` and `data/` folders contain early WBBus discovery/import scripts and generated artifacts. As the platform matures, production ingestion should move into `apps/worker` and provider packages.

## Target Repository

```text
apps/
  api/
    src/
      modules/
        transit/
        journey/
        regions/
        community/
        admin/
        ai-planner/
      shared/
      database/
  worker/
    src/
      jobs/
      queues/
      schedules/
      importers/
  admin/
  mobile/
packages/
  canonical-model/
  transit-core/
  provider-sdk/
  shared/
providers/
  wbbus/
  gtfs/
  bmtc/
  optics-odisha/
  mp-transport/
  ksrtc-karnataka/
infrastructure/
  docker/
  postgres/
  redis/
  monitoring/
docs/
```

## Feature Module Contract

```text
modules/<feature>/
  domain/              # Pure business model, no NestJS or Sequelize
  application/         # Use cases and ports
  infrastructure/      # Sequelize models, repositories, external clients
  presentation/        # Controllers, DTOs, API serializers
  <feature>.module.ts  # NestJS wiring
```

Developers should be able to add or change a feature without hunting across global `controllers/`, `services/`, `models/`, and `repositories/` folders.

## Migration Rule

Do not move early scripts only for neatness. Move them when the production worker job or provider adapter replaces their responsibility.
