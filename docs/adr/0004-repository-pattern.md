# ADR-0004: Repository Pattern — Repository Interfaces Over Direct ORM Usage

**Status:** Accepted  
**Date:** 2026-07-30

## Context

In a hexagonal architecture, the domain layer must not depend on infrastructure concerns like TypeORM, SQL queries, or database connections. However, the application still needs to persist and retrieve entities. Without a clear abstraction, use cases would either call TypeORM directly (violating dependency inversion) or be forced to implement persistence logic themselves (violating single responsibility).

## Decision

The domain layer defines **repository interfaces** as contracts for data access. The infrastructure layer provides **concrete implementations** that fulfill these contracts using TypeORM with PostGIS.

### Interface Definition (Domain Layer)

```typescript
// apps/api/src/modules/transit/domain/repositories/StopRepository.ts
export interface StopRepository {
  findNearby(params: FindNearbyStopsParams): Promise<Stop[]>;
  findById(id: string): Promise<Stop | null>;
  findByIds(ids: string[]): Promise<Stop[]>;
  save(stop: Stop): Promise<Stop>;
  delete(id: string): Promise<void>;
}
```

### Implementation (Infrastructure Layer)

```typescript
// apps/api/src/modules/transit/infrastructure/repositories/TypeOrmStopRepository.ts
@Injectable()
export class TypeOrmStopRepository implements StopRepository {
  constructor(
    @InjectRepository(TypeOrmStopEntity)
    private readonly repo: Repository<TypeOrmStopEntity>,
    private readonly mapper: StopMapper,
  ) {}

  async findNearby(params: FindNearbyStopsParams): Promise<Stop[]> {
    const { lat, lng, radius } = params;
    const point = `SRID=4326;POINT(${lng} ${lat})`;
    const entities = await this.repo
      .createQueryBuilder('stop')
      .where(
        `ST_DWithin(stop.geography, ST_GeomFromText(:point, 4326)::geography, :radius)`,
        { point, radius },
      )
      .orderBy(
        `ST_Distance(stop.geography, ST_GeomFromText(:point, 4326)::geography)`,
      )
      .take(50)
      .getMany();
    return entities.map(e => this.mapper.toDomain(e));
  }

  async findById(id: string): Promise<Stop | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.mapper.toDomain(entity) : null;
  }
  // ...
}
```

### Dependency Injection

Repository interfaces are bound to implementations via NestJS module configuration using tokens (`@Inject('StopRepository')` or custom provider tokens).

### Rules

1. **Repositories return domain entities** — never ORM entities. The mapper conversion happens inside the repository implementation.
2. **Repository methods express business intent** — `findNearbyStops`, not `findByLatAndLng`.
3. **Query complexity lives in repositories** — use cases should not construct complex queries.
4. **Transactions are handled at the application layer** using a `UnitOfWork` pattern or NestJS `@Transactional`, not inside repositories.

## Consequences

- **Positive:** Use cases are testable with in-memory repository stubs — no database required.
- **Positive:** Changing from TypeORM to another ORM or database requires only rewriting the infrastructure repository implementations — domain and application layers are untouched.
- **Positive:** Query logic is centralized in repositories, making it easy to review and optimize SQL/PostGIS queries.
- **Positive:** Repository interfaces act as a clear contract between domain and infrastructure — both sides can be developed in parallel.
- **Negative:** One extra layer of mapping (domain ↔ ORM entity) per aggregate — additional boilerplate files.
- **Negative:** For simple CRUD, the repository pattern adds indirection that a framework-first approach would not require.
- **Negative:** Complex queries with joins and aggregations require careful design to keep the repository interface clean and not leak DB-specific concepts.