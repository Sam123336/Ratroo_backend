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
        mobility/
        journey/
        regions/
        community/
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
  mobility-core/
  journey-engine/
  provider-sdk/
  geo-engine/
  routing-engine/
  shared/
providers/
  west-bengal/
    wbbus/
    wbtc/
    sbstc/
    nbstc/
    metro/
    rail/
    ferry/
    tram/
    auto/
  karnataka/
    bengaluru/
      bmtc/
      metro/
      osm/
      auto/
      shuttle/
infrastructure/
  docker/
  postgres/
  redis/
  monitoring/
docs/
```

## Feature Module Contract

Each feature owns one folder under `apps/api/src/modules/`. Everything that
feature needs lives in it — no global `controllers/`, `services/`, or `models/`
buckets to hunt through.

There are two tiers. Start at Tier 1; move to Tier 2 only when a module earns it.

### Tier 1 — standard feature module (the default)

`npm run gen:module -- <name>` emits exactly this.

```text
modules/<feature>/
  <feature>.module.ts   # NestJS wiring. The only file other modules import.
  controllers/          # HTTP in, DTO out. No business logic.
  services/             # Business logic. No SQL, no req/res.
  repositories/         # Data access. The only place models are queried.
  entities/             # Sequelize models = table shape.
  dto/                  # Request/response contracts.
```

`modules/villages/` is the reference implementation.

### Tier 2 — layered module

For modules too big for Tier 1, or whose domain is genuinely modelled rather
than just stored. Two qualify today:

- **`provider-ingestion`** — ~60 services and many external adapters, each
  needing its own fetcher, parser and mapper.
- **`transit`** — the core domain. Not on service count (it has about six) but
  on modelling: it carries value objects, domain events, and a domain
  repository interface separate from its Sequelize implementation. Flattening
  those into `services/` would put the network model and the code that
  persists it in the same folder, which is the distinction the layering
  exists to keep.

```text
modules/<feature>/
  domain/              # Pure business model, no NestJS or Sequelize
  application/         # Use cases and ports
  infrastructure/      # Sequelize models, repositories, external clients
  presentation/        # Controllers, DTOs, API serializers
  <feature>.module.ts  # NestJS wiring
```

`modules/transit/` is the reference implementation — smaller than
`provider-ingestion` and easier to read end to end.

**Graduate to Tier 2 when** a module passes ~10 services, integrates several
external systems that each need their own adapter, or models a domain with
behaviour of its own — value objects, events, invariants that must hold
regardless of storage. Not before: premature layering costs more than it
saves, and most modules only ever move rows.

**Everything else is Tier 1**, including modules that look big. `journey` and
`places` both carried a full `domain/application/infrastructure/presentation`
skeleton around four to seven files; the folders were empty and the real code
was Tier 1 underneath. Empty layering is worse than none — it tells the next
developer to look somewhere nothing lives.

### Layer rules

The folder names matter less than these. They are what keep the codebase
predictable.

| Layer | May do | Must never do |
|---|---|---|
| Controller | Parse/validate input, call one service, return its result | Contain business logic; touch a model or repository |
| Service | Business rules, orchestration, call repositories and other services | Write SQL; touch `req`/`res`; import another module's repository |
| Repository | All queries for its own models | Contain business rules |
| Entity | Describe a table | Contain logic |

Dependency direction is one-way: controller → service → repository → entity.
Nothing points back up.

**Cross-feature access goes through the exported service**, never the other
feature's repository or model. If `journey` needs stops, it imports
`TransitModule` and injects the stop service — it does not import `StopModel`.
Import the *module*, inject the *service*.

### Where things go

| You want to… | Put it in |
|---|---|
| Add an endpoint | `controllers/` + a service method |
| Change a rule ("confidence below 0.5 is unreliable") | `services/` |
| Change a query | `repositories/` |
| Add a column | `entities/` **and** a migration |
| Change what the API returns | `dto/` — a contract change; clients depend on it |

### Adding a feature

```bash
cd apps/api
npm run gen:module -- ferry-terminal        # add --no-entity if there is no table
```

Then register the module in `src/app.module.ts` (the generator prints both
lines) and, if it has an entity, create the table with a migration — see
[deployment.md](./deployment.md).

The generator deliberately does not edit `app.module.ts`; it prints what to
paste, so a generator bug can never scramble the root module.

### Response envelope

`TransformResponseInterceptor` wraps every response:

```json
{ "success": true, "data": "<payload>", "metadata": { "confidenceScore": 1.0 } }
```

Return `new ApiResult(data, metadata)` to control the metadata, or return the
payload bare and the interceptor fills in defaults. **Do not wrap the payload
yourself** — returning `{ data: x }` reaches the client as `data.data.x`.

## Migration Rule

Do not move early scripts only for neatness. Move them when the production worker job or provider adapter replaces their responsibility.
