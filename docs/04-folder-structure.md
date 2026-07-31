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
        coverage/
        community/
        admin/
        ai-planner/
      integrations/
      database/
      shared/
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

## Migration Rule

Do not move early scripts only for neatness. Move them when the production worker job or provider adapter replaces their responsibility.

