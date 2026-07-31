# ADR-0009: Use Sequelize ORM With Feature-Driven NestJS Modules

## Status

Accepted.

Supersedes ADR-0006 for new database access code.

## Context

The platform needs a backend structure that remains readable as it grows from a West Bengal bus API into a national and global mobility platform. The codebase will contain many feature areas: transit, regions, providers, journey planning, workers, community verification, admin tools, and AI planning.

The previous implementation used TypeORM. The product direction is now NestJS with Sequelize ORM, organized by feature modules instead of central technical folders.

## Decision

Use NestJS with Sequelize as the target ORM.

Each feature module owns its own:

- Domain entities and value objects
- Application use cases
- Sequelize models
- Repository implementations
- Controllers and DTOs
- Feature-local tests

Shared infrastructure remains in `src/shared`, but business behavior lives in feature folders.

## Target Module Shape

```text
apps/api/src/modules/transit/
  domain/
  application/
  infrastructure/
    sequelize/
      models/
      repositories/
      mappers/
  presentation/
    controllers/
    dto/
  transit.module.ts
```

## Rules

- Domain code must not import NestJS or Sequelize.
- Controllers call use cases, not Sequelize models.
- Use cases depend on repository interfaces.
- Sequelize models stay inside feature infrastructure folders.
- Cross-feature calls go through use cases, events, or explicit integration services.
- Provider drivers normalize data before persistence.
- UUID v7 remains the ID strategy.

## Consequences

Positive:

- Feature folders are easier for new developers to navigate.
- Sequelize models are explicit and familiar for SQL-backed CRUD.
- ORM details stay isolated behind repository interfaces.
- Future module extraction remains possible.

Tradeoffs:

- Existing TypeORM entities and repositories need migration.
- Migrations must move to Sequelize CLI or Umzug-style migration scripts.
- PostGIS queries will still require carefully reviewed SQL fragments through Sequelize.

## Migration Plan

1. Add Sequelize dependencies and database bootstrap.
2. Create Sequelize model equivalents for transit entities.
3. Implement Sequelize repositories behind existing repository interfaces.
4. Switch `TransitModule` providers from TypeORM repositories to Sequelize repositories.
5. Move import/seed services to Sequelize.
6. Remove TypeORM dependencies and legacy data-source files.
7. Update database docs and migration commands.

