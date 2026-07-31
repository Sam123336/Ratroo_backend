# ADR-0006: TypeORM QueryBuilder Over Raw SQL

## Status

Superseded by [ADR-0009: Use Sequelize ORM With Feature-Driven NestJS Modules](0009-use-sequelize.md) for new implementation work.

**Status:** Accepted  
**Date:** 2026-07-30

## Context

The system needs to execute complex database queries — spatial lookups with PostGIS, multi-table joins for route-stop associations, and filtered aggregations for trip schedules. The team must choose between TypeORM's QueryBuilder, raw SQL strings, or an alternative query builder (e.g., Knex.js). Considerations include query correctness, maintainability, refactoring resilience, and NestJS ecosystem alignment.

## Decision

All database queries are constructed using **TypeORM's `SelectQueryBuilder`** (and `InsertQueryBuilder` / `UpdateQueryBuilder` as needed). Raw SQL is never used directly.

### Guidelines

1. **QueryBuilder for all queries** — Stops, routes, trips, stop times, and spatial queries all go through `SelectQueryBuilder`.
2. **PostGIS functions via QueryBuilder's `.where()`** — Spatial functions like `ST_DWithin`, `ST_DistanceSphere`, and `ST_AsGeoJSON` are passed as expressions in `where()` clauses using parameterized bindings.
   ```typescript
   .where('ST_DWithin(stop.geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)', { lng, lat, radius })
   ```
3. **Named parameters always** — Never concatenate values into query strings. Use `:paramName` syntax with parameter objects.
4. **Raw SQL fragments are minimized** — Only PostGIS function names and column references that TypeORM cannot express go into raw strings. Everything else uses QueryBuilder methods (`.select()`, `.where()`, `.leftJoin()`, etc.).
5. **Complex queries are in repository methods** — Not in use cases or controllers. If a query spans multiple aggregates, it still lives in a repository — the use case calls it.

### Prohibited

- No `@Query('SELECT * FROM...')` decorators.
- No raw SQL strings passed to `manager.query()`.
- No SQL files loaded at runtime.
- No direct `EntityManager` operations outside of repositories.

### Exception

Read-only reporting queries that span multiple bounded contexts (future cross-context analytics) may use `DataSource.query()` with raw SQL, but only when QueryBuilder cannot express the query efficiently. Any raw SQL must be reviewed and explicitly approved.

## Consequences

- **Positive:** Queries are refactoring-safe — renaming a column or table in the entity updates all QueryBuilder references, unlike raw SQL strings.
- **Positive:** TypeORM's parameterized queries prevent SQL injection without manual escaping.
- **Positive:** QueryBuilder code is more readable than concatenated SQL strings — joins are explicit, conditions are chainable.
- **Positive:** NestJS/TypeORM ecosystem alignment — `@InjectRepository`, `@Transactional`, and logging work seamlessly.
- **Negative:** PostGIS functions exposed as raw expressions inside QueryBuilder — some raw SQL still appears, which could have been avoided with a different ORM.
- **Negative:** TypeORM's query builder has a steeper learning curve for complex spatial queries compared to writing raw SQL.
- **Negative:** Certain PostgreSQL-specific features (window functions, CTEs, `DISTINCT ON`) are awkward to express in QueryBuilder, sometimes requiring `.subQuery()` workarounds.
