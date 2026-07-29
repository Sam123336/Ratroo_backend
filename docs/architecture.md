# Transit Platform — Complete Architecture

A **Domain-Driven, Hexagonal (Ports & Adapters)** mobility platform for Indian cities. Ingests, normalizes, and serves transit data from multiple providers (WBBus, BMTC, WBTC, GTFS, Metro) through a unified REST API — with support for journey planning, places, events, and AI-powered routing.

**Core philosophy:** Think *mobility platform*, not *bus app*. Today bus. Tomorrow metro, train, auto, cab, walking, bike, events, places, AI planner. Every architectural decision prepares for this growth.

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [API Application Structure](#2-api-application-structure)
3. [Domain Layer](#3-domain-layer)
4. [Application Layer](#4-application-layer)
5. [Infrastructure Layer](#5-infrastructure-layer)
6. [Presentation Layer](#6-presentation-layer)
7. [Data Flow](#7-data-flow)
8. [Canonical Transit Model](#8-canonical-transit-model)
9. [Providers](#9-providers)
10. [Worker](#10-worker)
11. [Shared Kernel](#11-shared-kernel)
12. [Database & Migrations](#12-database--migrations)
13. [Architecture Principles](#13-architecture-principles)
14. [Tech Stack](#14-tech-stack)
15. [Naming Conventions](#15-naming-conventions)
16. [Testing Strategy](#16-testing-strategy)
17. [Future Growth Path](#17-future-growth-path)

---

## 1. Repository Structure

```
transit-platform/
│
├── apps/
│   ├── api/              # Public REST API (NestJS 10)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── shared/           # Shared Kernel
│   │   │   ├── canonical-model/  # Canonical Transit Model
│   │   │   ├── modules/          # Bounded contexts
│   │   │   └── database/         # DataSource, migrations, seeds
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── nest-cli.json
│   │
│   ├── worker/           # Background import/sync (BullMQ)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── jobs/
│   │   │   └── queues/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── admin/            # Internal dashboard (future)
│
├── providers/            # External data sources (workspace-root)
│   ├── wbbus/            # WBTC bus data
│   │   ├── v1/
│   │   │   ├── client/
│   │   │   ├── parser/
│   │   │   ├── mapper/
│   │   │   ├── fixtures/
│   │   │   └── tests/
│   │   └── README.md
│   ├── bmtc/             # Future
│   ├── wbtc/             # Future
│   ├── gtfs/             # Future
│   └── metro/            # Future
│
├── infrastructure/       # Docker, PostGIS, Redis, monitoring
│   ├── docker/
│   │   └── docker-compose.yml
│   ├── postgres/
│   ├── redis/
│   └── monitoring/
│
├── packages/             # Future shared packages
│   ├── shared/           # Extracted shared kernel
│   ├── transit-core/     # Domain logic as library
│   ├── canonical-model/  # Canonical types as package
│   └── sdk/              # Client SDK
│
└── docs/
    ├── architecture.md   # This file
    ├── api.md            # REST API reference
    ├── database.md       # Schema + migration strategy
    ├── providers.md      # Provider integration guide
    ├── planner.md        # Journey planner architecture
    └── adr/              # Architecture Decision Records (8 files)
```

---

## 2. API Application Structure

```
apps/api/src/
│
├── main.ts                           # Bootstrap NestJS app
├── app.module.ts                     # Root module (TypeORM, Config, modules)
│
├── shared/                           # Shared Kernel (framework-independent)
│   ├── errors/
│   │   └── app-error.ts              # AppError, NotFoundError, ValidationError
│   ├── events/
│   │   └── EventBus.ts               # EventBus interface (emit, on, off)
│   ├── observability/
│   │   ├── Logger.ts                 # Logger interface (info, warn, error, debug)
│   │   └── Metrics.ts                # Metrics interface (counter, histogram, gauge)
│   ├── constants/
│   │   └── transit-types.ts          # RouteType, Direction, Provider enums
│   ├── types/                        # Shared TypeScript types
│   ├── utils/                        # Pure utility functions
│   └── index.ts                      # Barrel exports
│
├── canonical-model/                  # Canonical Transit Model
│   ├── CanonicalStop.ts
│   ├── CanonicalRoute.ts
│   ├── CanonicalTrip.ts
│   ├── CanonicalAgency.ts
│   ├── CanonicalStopTime.ts
│   └── index.ts
│
├── modules/                          # Bounded contexts
│   │
│   ├── transit/                      # Core transit domain
│   │   ├── transit.module.ts         # NestJS module wiring
│   │   │
│   │   ├── domain/                   # PURE business logic (zero NestJS imports)
│   │   │   ├── entities/             # Stop, Route, Trip, Agency, StopTime
│   │   │   ├── repositories/         # StopRepository, RouteRepository, TripRepository, AgencyRepository
│   │   │   ├── services/             # StopNormalizer, RouteMatcher
│   │   │   ├── graph/                # TransitGraph, GraphNode, GraphEdge, Transfer
│   │   │   ├── events/               # DomainEvent, StopCreated, RouteUpdated, TripImported
│   │   │   └── value-objects/        # Coordinates
│   │   │
│   │   ├── application/              # Application layer
│   │   │   ├── use-cases/            # FindNearbyStopsUseCase, FindStopByIdUseCase, FindRoutesUseCase, FindRouteDetailsUseCase
│   │   │   ├── commands/             # Future: ImportProviderData, CreateStop, MergeStops
│   │   │   ├── queries/              # Future: FindNearbyStops, FindRoute, SearchStops
│   │   │   ├── handlers/             # Future: command/query handlers
│   │   │   └── events/               # Future: app-level event handlers
│   │   │
│   │   ├── infrastructure/           # Framework/DB concerns
│   │   │   ├── typeorm/entities/     # TypeOrmStopEntity, TypeOrmRouteEntity, TypeOrmTripEntity, TypeOrmAgencyEntity, TypeOrmStopTimeEntity
│   │   │   ├── repositories/         # PostgresStopRepository, PostgresRouteRepository, PostgresTripRepository, PostgresAgencyRepository
│   │   │   └── mappers/              # StopMapper, RouteMapper, TripMapper, AgencyMapper
│   │   │
│   │   └── presentation/             # HTTP layer
│   │       ├── controllers/          # stops.controller.ts, routes.controller.ts
│   │       └── dto/                  # nearby-stops.dto.ts
│   │
│   ├── journey/                      # Journey planning (future bounded context)
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   ├── repositories/
│   │   │   └── value-objects/
│   │   ├── application/
│   │   │   ├── commands/
│   │   │   └── queries/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── places/                       # Points of interest (future)
│   ├── planner/                      # AI multi-modal routing (future)
│   ├── geocoding/                    # Address → coordinates (future)
│   ├── events/                       # Transit disruptions (future)
│   ├── search/                       # Full-text search (future)
│   ├── fare/                         # Pricing (future)
│   └── admin/                        # Admin dashboard (future)
│
├── database/                         # Database layer
│   ├── entities/                     # TypeORM entity definitions (with decorators)
│   ├── data-source.ts                # TypeORM DataSource config for migrations
│   ├── migrations/                   # Generated migration files (filled via npm run migration:generate)
│   ├── seeds/                        # import-wbbus.service.ts, test-wbbus-import.ts
│   ├── views/                        # PostgreSQL views (future)
│   └── functions/                    # PostgreSQL functions (future)
│
├── integrations/                     # Legacy location (will migrate to providers/)
│   └── transit-providers/
│       └── wbbus/
│           ├── wbbus.client.ts
│           ├── wbbus.parser.ts
│           ├── wbbus.mapper.ts
│           ├── wbbus.module.ts
│           └── wbbus.types.ts
│
└── config/                           # NestJS configuration
```

---

## 3. Domain Layer

### 3.1 Core Rule: Zero Framework Dependencies

The domain layer has **no NestJS imports, no TypeORM decorators, no framework coupling of any kind**. It is pure TypeScript.

```typescript
// ✅ GOOD - domain/entities/Stop.ts
export class Stop {
  constructor(
    public readonly id: string,
    public name: string,
    public normalizedName: string,
    public latitude: number,
    public longitude: number,
    public readonly provider: string,
    public city?: string,
    public district?: string,
    public state?: string,
    public externalId?: string,
  ) {}

  normalize(): void {
    this.normalizedName = this.name.toLowerCase().trim();
  }
}

// ❌ NEVER - no NestJS @Injectable(), no TypeORM @Entity() in domain
```

### 3.2 Domain Entities

| Entity | File | Key Properties |
|---|---|---|
| `Stop` | `domain/entities/Stop.ts` | `id`, `name`, `normalizedName`, `latitude`, `longitude`, `provider` |
| `Route` | `domain/entities/Route.ts` | `id`, `agencyId`, `shortName`, `longName`, `originStopId`, `destinationStopId`, `routeType`, `provider` |
| `Trip` | `domain/entities/Trip.ts` | `id`, `routeId`, `serviceId`, `direction`, `provider` |
| `Agency` | `domain/entities/Agency.ts` | `id`, `name`, `timezone`, `language`, `phone`, `provider` |
| `StopTime` | `domain/entities/StopTime.ts` | `id`, `tripId`, `stopId`, `arrivalTime`, `departureTime`, `stopSequence` |

### 3.3 Repository Interfaces (Ports)

```typescript
// domain/repositories/StopRepository.ts
export interface StopRepository {
  findNearby(lat: number, lng: number, radius: number): Promise<Stop[]>;
  findById(id: string): Promise<Stop | null>;
  search(query: string): Promise<Stop[]>;
  save(stop: Stop): Promise<Stop>;
  saveMany(stops: Stop[]): Promise<Stop[]>;
  merge(stops: Stop[]): Promise<Stop[]>;
}

// domain/repositories/RouteRepository.ts
export interface RouteRepository {
  findAll(page: number, limit: number, search?: string): Promise<{ data: Route[]; total: number }>;
  findById(id: string): Promise<Route | null>;
  findByAgency(agencyId: string): Promise<Route[]>;
  save(route: Route): Promise<Route>;
}
```

**Business language, not ORM language:** methods are `findNearby`, `search`, `merge` — not `findAndCount`, `findOneBy`.

### 3.4 Domain Services

```typescript
// domain/services/StopNormalizer.ts
export class StopNormalizer {
  normalizeName(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  detectDuplicates(stops: Stop[]): Stop[][] {
    const groups = new Map<string, Stop[]>();
    for (const stop of stops) {
      const key = `${stop.normalizedName}|${stop.latitude.toFixed(4)}|${stop.longitude.toFixed(4)}`;
      const group = groups.get(key) || [];
      group.push(stop);
      groups.set(key, group);
    }
    return Array.from(groups.values()).filter(g => g.length > 1);
  }
}

// domain/services/RouteMatcher.ts
export class RouteMatcher {
  matchStopsToRoute(route: Route, stops: Stop[]): Route {
    // Find origin and destination stops from route name pattern
    const parts = route.longName.split(' - ');
    const origin = stops.find(s =>
      parts[0] && s.normalizedName.includes(parts[0].toLowerCase()),
    );
    const dest = stops.find(s =>
      parts[1] && s.normalizedName.includes(parts[1].toLowerCase()),
    );
    return new Route(
      route.id,
      route.agencyId,
      route.shortName,
      route.longName,
      origin?.id || route.originStopId,
      dest?.id || route.destinationStopId,
      route.routeType,
      route.provider,
      route.externalId,
    );
  }
}
```

### 3.5 Transit Graph

An in-memory graph for route finding and transfer computation. Independent of the database.

```
domain/graph/
├── GraphNode.ts          # Interface: { id, type, coordinates, properties }
├── GraphEdge.ts          # Interface: { id, from, to, weight, mode, properties }
├── Transfer.ts           # Class: { fromStopId, toStopId, distanceMeters, durationSeconds, mode, isWalkable }
└── TransitGraph.ts       # Class: graph operations
```

```typescript
export class TransitGraph {
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | undefined;
  getEdge(id: string): GraphEdge | undefined;

  // Spatial query — O(n) Haversine distance on all nodes
  findNearestNodes(lat: number, lng: number, limit?: number): GraphNode[];

  // Route finding — DFS with weight-based sorting
  findRoutesBetween(fromId: string, toId: string): GraphEdge[][];

  // Auto-create walking/transit edges between stops
  createTransfer(from: GraphNode, to: GraphNode, mode: Transfer['mode']): void;
}
```

**Node types:** `STOP`, `STATION`, `INTERCHANGE`

**Transfer modes:** `WALKING`, `BUS`, `METRO`, `TRAIN`, `AUTO`

**Walking speed:** 1.4 m/s (5 km/h) — used to compute transfer duration from Haversine distance.

### 3.6 Domain Events

```typescript
// domain/events/DomainEvent.ts
export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly timestamp: Date;
  constructor(
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Record<string, unknown>,
  ) {
    this.eventId = `${eventType}_${aggregateId}_${Date.now()}`;
    this.timestamp = new Date();
  }
}
```

| Event | When Emitted | Payload |
|---|---|---|
| `StopCreatedEvent` | New stop imported | `{ name, latitude, longitude, provider }` |
| `RouteUpdatedEvent` | Route details changed | `{ routeId, shortName, longName }` |
| `TripImportedEvent` | Batch import completed | `{ agencyId, tripCount, provider }` |

### 3.7 Value Objects

```typescript
// domain/value-objects/Coordinates.ts
export class Coordinates {
  constructor(
    public readonly latitude: number,
    public readonly longitude: number,
  ) {
    if (latitude < -90 || latitude > 90) throw new Error('Invalid latitude');
    if (longitude < -180 || longitude > 180) throw new Error('Invalid longitude');
  }

  distanceTo(other: Coordinates): number {
    // Haversine formula
    const R = 6371000;
    const dLat = this.toRad(other.latitude - this.latitude);
    const dLng = this.toRad(other.longitude - this.longitude);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(this.toRad(this.latitude))
      * Math.cos(this.toRad(other.latitude))
      * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
```

---

## 4. Application Layer

### 4.1 Use Cases (Current)

Each use case is a single class injected as a NestJS provider. It calls a repository interface (never the domain entities directly for persistence logic).

| Use Case | File | Action |
|---|---|---|
| `FindNearbyStopsUseCase` | `application/use-cases/FindNearbyStopsUseCase.ts` | Find stops within radius of coordinates |
| `FindStopByIdUseCase` | `application/use-cases/FindStopByIdUseCase.ts` | Get single stop by UUID |
| `FindRoutesUseCase` | `application/use-cases/FindRoutesUseCase.ts` | List routes with pagination + search |
| `FindRouteDetailsUseCase` | `application/use-cases/FindRouteDetailsUseCase.ts` | Get single route by UUID |

```typescript
// application/use-cases/FindNearbyStopsUseCase.ts
@Injectable()
export class FindNearbyStopsUseCase {
  constructor(
    @Inject('STOP_REPOSITORY')
    private readonly stopRepository: StopRepository,
  ) {}

  async execute(lat: number, lng: number, radius: number = 2000) {
    // Validate
    if (lat < -90 || lat > 90) throw new ValidationError('Invalid latitude');
    if (radius < 100 || radius > 50000) throw new ValidationError('Radius must be 100–50000m');

    // Execute
    const stops = await this.stopRepository.findNearby(lat, lng, radius);

    // Format response
    const data = stops.map(stop => ({
      id: stop.id,
      name: stop.name,
      normalizedName: stop.normalizedName,
      latitude: stop.latitude,
      longitude: stop.longitude,
      provider: stop.provider,
      distanceMeters: Math.round(
        new Coordinates(lat, lng).distanceTo(
          new Coordinates(stop.latitude, stop.longitude),
        ),
      ),
    }));

    return { data, count: data.length, searchCenter: { lat, lng, radiusMeters: radius } };
  }
}
```

### 4.2 CQRS-Ready Structure

Directories exist for future CQRS expansion:

```
application/
├── commands/         # ImportProviderData, CreateStop, MergeStops, UpdateTrip
├── queries/          # FindNearbyStops, FindRoute, SearchStops, FindTransfers
├── handlers/         # Command/query handlers (when complexity grows)
└── events/           # App-level event handlers
```

---

## 5. Infrastructure Layer

### 5.1 TypeORM Entities

These live in `infrastructure/typeorm/entities/` — NOT in the domain layer.

| File | Entity | Maps To Domain |
|---|---|---|
| `typeorm-stop.entity.ts` | `TypeOrmStopEntity` | `Stop` |
| `typeorm-route.entity.ts` | `TypeOrmRouteEntity` | `Route` |
| `typeorm-trip.entity.ts` | `TypeOrmTripEntity` | `Trip` |
| `typeorm-agency.entity.ts` | `TypeOrmAgencyEntity` | `Agency` |
| `typeorm-stop-time.entity.ts` | `TypeOrmStopTimeEntity` | `StopTime` |

Each uses TypeORM decorators (`@Entity`, `@Column`, `@ManyToOne`, etc.) but these decorators never leak into the domain.

```typescript
// infrastructure/typeorm/entities/typeorm-stop.entity.ts
@Entity({ name: 'stops' })
export class TypeOrmStopEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  normalizedName: string;

  @Column({ type: 'double precision' })
  latitude: number;

  @Column({ type: 'double precision' })
  longitude: number;

  @Column({ type: 'varchar', length: 20 })
  provider: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 5.2 Infrastructure Repositories (Adapters)

Implement domain repository interfaces using TypeORM QueryBuilder. **No raw `.query()` calls.**

```typescript
// infrastructure/repositories/PostgresStopRepository.ts
@Injectable()
export class PostgresStopRepository implements StopRepository {
  constructor(
    @InjectRepository(TypeOrmStopEntity)
    private readonly repo: Repository<TypeOrmStopEntity>,
  ) {}

  async findNearby(lat: number, lng: number, radius: number): Promise<Stop[]> {
    const entities = await this.repo
      .createQueryBuilder('s')
      .addSelect(
        `ST_DWithin(
          ST_MakePoint(s.longitude, s.latitude)::geography,
          ST_MakePoint(:lng, :lat)::geography,
          :radius
        )`,
        'within',
      )
      .where(
        `ST_DWithin(
          ST_MakePoint(s.longitude, s.latitude)::geography,
          ST_MakePoint(:lng, :lat)::geography,
          :radius
        )`,
        { lat, lng, radius },
      )
      .orderBy(
        `ST_Distance(
          ST_MakePoint(s.longitude, s.latitude)::geography,
          ST_MakePoint(:lng, :lat)::geography
        )`,
        'ASC',
      )
      .limit(100)
      .setParameters({ lat, lng, radius })
      .getMany();

    return entities.map(e => StopMapper.toDomain(e));
  }

  async findById(id: string): Promise<Stop | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? StopMapper.toDomain(entity) : null;
  }

  async search(query: string): Promise<Stop[]> {
    const entities = await this.repo
      .createQueryBuilder('s')
      .where('s.normalizedName LIKE :query', { query: `%${query.toLowerCase()}%` })
      .orWhere('s.name ILIKE :query', { query: `%${query}%` })
      .limit(20)
      .getMany();
    return entities.map(e => StopMapper.toDomain(e));
  }

  async save(stop: Stop): Promise<Stop> {
    const entity = StopMapper.toTypeORM(stop);
    const saved = await this.repo.save(entity);
    return StopMapper.toDomain(saved);
  }

  async saveMany(stops: Stop[]): Promise<Stop[]> {
    const entities = stops.map(s => StopMapper.toTypeORM(s));
    const saved = await this.repo.save(entities);
    return saved.map(e => StopMapper.toDomain(e));
  }

  async merge(stops: Stop[]): Promise<Stop[]> {
    // Upsert logic: match by normalizedName + provider, update if exists
    const saved: Stop[] = [];
    for (const stop of stops) {
      const existing = await this.repo.findOne({
        where: {
          normalizedName: stop.normalizedName,
          provider: stop.provider,
        },
      });
      if (existing) {
        existing.name = stop.name;
        existing.latitude = stop.latitude;
        existing.longitude = stop.longitude;
        existing.city = stop.city;
        existing.district = stop.district;
        existing.state = stop.state;
        const updated = await this.repo.save(existing);
        saved.push(StopMapper.toDomain(updated));
      } else {
        const created = await this.repo.save(StopMapper.toTypeORM(stop));
        saved.push(StopMapper.toDomain(created));
      }
    }
    return saved;
  }
}
```

### 5.3 Mappers

Convert between domain objects and TypeORM entities. This is the only layer that knows about both.

```typescript
// infrastructure/mappers/StopMapper.ts
export class StopMapper {
  static toDomain(entity: TypeOrmStopEntity): Stop {
    return new Stop(
      entity.id,
      entity.name,
      entity.normalizedName,
      entity.latitude,
      entity.longitude,
      entity.provider,
      entity.city,
      entity.district,
      entity.state,
      entity.externalId,
    );
  }

  static toTypeORM(domain: Stop): TypeOrmStopEntity {
    const entity = new TypeOrmStopEntity();
    entity.id = domain.id;
    entity.name = domain.name;
    entity.normalizedName = domain.normalizedName;
    entity.latitude = domain.latitude;
    entity.longitude = domain.longitude;
    entity.provider = domain.provider;
    entity.city = domain.city;
    entity.district = domain.district;
    entity.state = domain.state;
    entity.externalId = domain.externalId;
    return entity;
  }
}
```

---

## 6. Presentation Layer

### 6.1 Controllers (Thin HTTP Parsers)

Controllers validate input, call exactly one use case, return the result. No business logic.

```typescript
// presentation/controllers/stops.controller.ts
@Controller('v1/stops')
export class StopsController {
  constructor(
    private readonly findNearbyStops: FindNearbyStopsUseCase,
    private readonly findStopById: FindStopByIdUseCase,
  ) {}

  @Get('nearby')
  @ApiOperation({ summary: 'Find stops near coordinates' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'radius', required: false, type: Number })
  async findNearby(@Query() query: NearbyStopsDto) {
    return this.findNearbyStops.execute(query.lat, query.lng, query.radius);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get stop by UUID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findStopById.execute(id);
  }
}
```

### 6.2 DTOs

```typescript
// presentation/controllers/dto/nearby-stops.dto.ts
export class NearbyStopsDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(50000)
  @Type(() => Number)
  radius?: number;
}
```

---

## 7. Data Flow

```
                          ┌──────────────────┐
                          │   Flutter App     │
                          └────────┬─────────┘
                                   │ HTTP (JSON)
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     REST API (NestJS 10)                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Presentation Layer                          │    │
│  │         Controllers (thin HTTP parsers)                  │    │
│  │         - Parse + validate input                         │    │
│  │         - Call one use case                              │    │
│  │         - Return result                                  │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
│  ┌──────────────────────▼───────────────────────────────────┐    │
│  │              Application Layer                           │    │
│  │         Use Cases (one per business action)              │    │
│  │         - Validate business rules                        │    │
│  │         - Orchestrate domain logic                       │    │
│  │         - Call repository interfaces                     │    │
│  │         - Format response                                │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
│  ┌──────────────────────▼───────────────────────────────────┐    │
│  │               Domain Layer                               │    │
│  │  Entities (pure TS - zero framework deps)                │    │
│  │  Repository Interfaces (contracts - ports)               │    │
│  │  Services (StopNormalizer, RouteMatcher)                 │    │
│  │  Graph (TransitGraph, Node, Edge, Transfer)              │    │
│  │  Events (DomainEvent, StopCreated, etc.)                 │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │ implements                              │
└─────────────────────────┼─────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                            │
│                                                                  │
│  ┌────────────────┐    ┌───────────────────────────┐             │
│  │   Mappers      │    │   Postgres Repositories   │             │
│  │   Domain ↔     │◄──►│   (TypeORM QueryBuilder)  │             │
│  │   TypeORM      │    │    - No raw SQL           │             │
│  └────────────────┘    └───────────┬───────────────┘             │
│                                    │                              │
│                                    ▼                              │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL / PostGIS                          │   │
│  │  - GiST indexes on geography columns                      │   │
│  │  - ST_DWithin for radius queries                          │   │
│  │  - ST_MakePoint for geometry creation                     │   │
│  │  - ST_Distance for distance ordering                      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                    ▲                              │
│  ┌─────────────────────────────────┴───────────────────────────┐ │
│  │                    Redis Cache                               │ │
│  │  - NearbyStopsCache (TTL: 5 min)                            │ │
│  │  - RouteCache (TTL: 30 min)                                 │ │
│  │  - JourneyCache (TTL: 10 min)                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                         ▲
                         │ triggers
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Worker (BullMQ)                              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ WBBus Job   │  │ BMTC Job    │  │ GTFS Import Job         │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         ▼                ▼                     ▼                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Providers                               │   │
│  │                                                           │   │
│  │  providers/wbbus/v1/  → client → parser → mapper         │   │
│  │  providers/bmtc/      → client → parser → mapper         │   │
│  │                                                           │   │
│  │                       ↓                                   │   │
│  │          Canonical Transit Model                          │   │
│  │    (CanonicalStop, CanonicalRoute, CanonicalTrip, ...)    │   │
│  │                                                           │   │
│  │                       ↓                                   │   │
│  │          Domain Mapper (Canonical → Domain)               │   │
│  │                                                           │   │
│  │                       ↓                                   │   │
│  │          Repository (persist to Postgres)                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                         │ emits
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                Event Bus (future)                                │
│                                                                  │
│  StopCreated  ──→ Update TransitGraph                           │
│  RouteUpdated ──→ Invalidate RouteCache                         │
│  TripImported ──→ Notify subscribers                            │
│  TransferDetected → Update journey planner                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Canonical Transit Model

### 8.1 Purpose

Providers **never directly create domain entities**. Each provider produces its own raw model (HTML-parsed, API-response-shaped), which is then mapped to a **canonical model** — a standardized intermediate representation. Domain mappers then convert canonical objects into domain entities.

```
Provider Client (HTML/API)
       ↓
Provider Parser (HTML → Raw Provider Object)
       ↓
Provider Mapper (Raw Provider Object → Canonical Model)
       ↓
Canonical Transit Model (CanonicalStop, CanonicalRoute, ...)
       ↓
Domain Mapper (Canonical → Domain Entity)
       ↓
Database (via Repository)
```

### 8.2 Canonical Types

```typescript
// canonical-model/CanonicalStop.ts
export interface CanonicalStop {
  id?: string;
  name: string;
  normalizedName: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  district?: string;
  state?: string;
  provider: string;
  externalId?: string;
}

// canonical-model/CanonicalRoute.ts
export interface CanonicalRoute {
  id?: string;
  agencyId: string;
  shortName?: string;
  longName: string;
  originStopId?: string;
  destinationStopId?: string;
  routeType?: string;
  provider: string;
  externalId?: string;
}

// canonical-model/CanonicalTrip.ts
export interface CanonicalTrip {
  id?: string;
  routeId: string;
  serviceId?: string;
  direction?: string;
  provider: string;
}

// canonical-model/CanonicalAgency.ts
export interface CanonicalAgency {
  id?: string;
  name: string;
  timezone?: string;
  language?: string;
  phone?: string;
  provider: string;
}

// canonical-model/CanonicalStopTime.ts
export interface CanonicalStopTime {
  id?: string;
  tripId: string;
  stopId: string;
  arrivalTime?: string;
  departureTime?: string;
  stopSequence: number;
}
```

### 8.3 Benefits

- If a new provider joins (e.g., BMTC), they only need to implement `Provider Mapper → Canonical Model`. No DB knowledge required.
- If the database schema changes, only `Domain Mapper` and `Repository` are updated. All providers continue working unchanged.
- Testing: canonical model is a plain interface — easy to create fixtures.

---

## 9. Providers

### 9.1 Structure

Each provider is a **self-contained, workspace-root package**:

```
providers/wbbus/
├── v1/                       # Versioned
│   ├── client/               # HTTP fetching + HTML parsing
│   │   └── wbbus.client.ts
│   ├── parser/               # HTML → Raw WBBus model
│   │   └── wbbus.parser.ts
│   ├── mapper/               # Raw → Canonical model
│   │   └── wbbus.mapper.ts
│   ├── fixtures/             # Sample HTML pages for tests
│   └── tests/                # Unit tests (parser + mapper)
├── README.md
└── package.json              # Standalone package (can be published independently)
```

### 9.2 Provider Interface

```typescript
// Each provider implements:
interface TransitProvider {
  readonly name: string;
  discover(): Promise<string[]>;          // Get list of route URLs
  fetch(url: string): Promise<string>;     // Download HTML/API data
  parse(raw: string): Promise<ProviderModel>; // Parse into raw model
  map(raw: ProviderModel): Promise<CanonicalModel>; // Map to canonical
}
```

### 9.3 Versioning

If WBBus redesigns its website:

- `v1/` — archived (existing data remains in DB)
- `v2/` — new implementation (new data uses v2 parser)
- Both can coexist during migration

### 9.4 Current Providers

| Provider | Location | Type | Status |
|---|---|---|---|
| WBBus | `providers/wbbus/v1/` | HTML scraper | ✅ Active |
| BMTC | `providers/bmtc/` | Future | 📅 Planned |
| WBTC | `providers/wbtc/` | Future | 📅 Planned |
| GTFS | `providers/gtfs/` | GTFS feed | 📅 Planned |
| Metro | `providers/metro/` | Future | 📅 Planned |

---

## 10. Worker

### 10.1 Structure

```
apps/worker/
├── package.json              # Minimal NestJS dependencies + bullmq
├── tsconfig.json             # Strict TS config
└── src/
    ├── main.ts               # BullMQ worker bootstrap
    ├── jobs/                  # Import job definitions
    │   └── ImportWBBusJob.ts
    └── queues/                # Queue definitions
        └── transit-queue.ts
```

### 10.2 Job Flow

```
BullMQ Queue (transit-import)
       │
       ▼
Worker picks up job
       │
       ▼
ImportWBBusJob.execute()
       │
       ├── 1. Provider.discover() → get all route URLs
       ├── 2. For each URL:
       │      ├── Provider.fetch(url) → HTML
       │      ├── Provider.parse(html) → Raw model
       │      └── Provider.map(raw) → Canonical model
       ├── 3. Domain mapper → Domain entities
       ├── 4. Repository.save() → PostgreSQL
       └── 5. EventBus.emit(TripImportedEvent)
```

### 10.3 Scheduling

Jobs are scheduled via BullMQ repeatable jobs (e.g., daily full import, hourly incremental).

```typescript
// Future implementation:
const myQueue = new Queue('transit-import');
await myQueue.add(
  'wbbus-daily-import',
  { provider: 'wbbus', type: 'FULL' },
  { repeat: { pattern: '0 2 * * *' } }, // Every day at 2 AM
);
```

---

## 11. Shared Kernel

### 11.1 Overview

```
apps/api/src/shared/
├── index.ts                  # Barrel exports
├── errors/
│   └── app-error.ts          # AppError, NotFoundError, ValidationError
├── events/
│   └── EventBus.ts           # EventBus interface
├── observability/
│   ├── Logger.ts             # Logger interface
│   └── Metrics.ts            # Metrics interface
├── constants/
│   └── transit-types.ts      # RouteType, Direction, Provider enums
├── types/                    # Shared TypeScript types
└── utils/                    # Pure utility functions
```

### 11.2 Error Classes

```typescript
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} with ID "${id}" not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
  }
}
```

### 11.3 Enums

```typescript
export enum RouteType {
  BUS = 'BUS',
  METRO = 'METRO',
  TRAIN = 'TRAIN',
  AUTO = 'AUTO',
  CAB = 'CAB',
  WALKING = 'WALKING',
  BIKE = 'BIKE',
}

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
}

export enum Provider {
  WBBUS = 'WBBUS',
  BMTC = 'BMTC',
  WBTC = 'WBTC',
  METRO = 'METRO',
  GTFS = 'GTFS',
}
```

### 11.4 EventBus Interface

```typescript
export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export interface EventBus {
  emit(event: DomainEvent): void | Promise<void>;
  on(eventType: string, handler: EventHandler): void;
  off(eventType: string, handler: EventHandler): void;
}
```

### 11.5 Observability Interfaces

```typescript
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

export interface Metrics {
  increment(counter: string, tags?: Record<string, string>): void;
  histogram(metric: string, value: number, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
}
```

**All shared interfaces are framework-independent** — no NestJS imports. They are implemented by infrastructure modules using NestJS-specific tools (e.g., NestJS Logger, Prometheus client).

---

## 12. Database & Migrations

### 12.1 Strategy

| Environment | Mode | How |
|---|---|---|
| Development | `synchronize: true` | TypeORM auto-creates tables on app start |
| Staging | Migration files | `npm run migration:run` |
| Production | Migration files | `npm run migration:run` via CI/CD |

### 12.2 Migration Commands

```bash
# Generate a migration from entity changes
npm run migration:generate InitialSchema

# Apply pending migrations
npm run migration:run

# Rollback last migration
npm run migration:revert

# Create an empty migration file
npm run migration:create AddRoutesView
```

### 12.3 DataSource Configuration

```typescript
// src/database/data-source.ts
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'transit_admin',
  password: process.env.DB_PASSWORD || 'transit_password',
  database: process.env.DB_NAME || 'transit_db',
  entities: [
    // Domain-entity copies (with TypeORM decorators)
    AgencyEntity,
    StopEntity,
    RouteEntity,
    TripEntity,
    StopTimeEntity,
    TransitSourceRecordEntity,
    // TypeORM infrastructure entities
    TypeOrmAgencyEntity,
    TypeOrmStopEntity,
    TypeOrmRouteEntity,
    TypeOrmTripEntity,
    TypeOrmStopTimeEntity,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
};
```

### 12.4 Core Tables

| Table | Key Columns | PostGIS | Purpose |
|---|---|---|---|
| `stops` | `id`, `name`, `normalizedName`, `latitude`, `longitude`, `provider` | geography(indexed) | All transit stops |
| `routes` | `id`, `agencyId`, `shortName`, `longName`, `routeType`, `provider` | — | Transit routes |
| `trips` | `id`, `routeId`, `serviceId`, `direction`, `provider` | — | Trip instances |
| `stop_times` | `id`, `tripId`, `stopId`, `arrivalTime`, `departureTime`, `stopSequence` | — | Timetables |
| `agencies` | `id`, `name`, `timezone`, `language`, `phone`, `provider` | — | Operating agencies |
| `transit_source_records` | `id`, `provider`, `sourceUrl`, `importedAt`, `status` | — | Import audit trail |

### 12.5 PostGIS Index

```sql
CREATE INDEX idx_stops_geography ON stops USING GIST (
  ST_GeographyFromText('SRID=4326;POINT(' || longitude || ' ' || latitude || ')')
);
```

This index is what makes `ST_DWithin` queries fast even with millions of stops.

---

## 13. Architecture Principles

| # | Principle | What It Means | Where It's Practiced |
|---|---|---|---|
| 1 | **Domain Independence** | Domain has zero NestJS/TypeORM imports. Pure TypeScript only. | `domain/entities/`, `domain/repositories/`, `domain/services/` |
| 2 | **Dependency Inversion** | High-level modules (controllers, use cases) depend on abstractions (interfaces), not concretions (TypeORM). | DI tokens in TransitModule: `@Inject('STOP_REPOSITORY')` |
| 3 | **Single Responsibility** | Each file does exactly one thing. | 4 use case files instead of 2 service files. One use case = one business action. |
| 4 | **Mapper Isolation** | Domain objects never leak into persistence. Mappers convert between layers. | `infrastructure/mappers/StopMapper.ts`, `RouteMapper.ts`, etc. |
| 5 | **Provider Isolation** | Each provider is a standalone, workspace-root package. HTML changes to one provider never affect another. | `providers/wbbus/`, `providers/bmtc/` (future) |
| 6 | **Canonical Model** | Providers talk to a shared canonical model, not directly to domain entities or the database. | `canonical-model/` package |
| 7 | **CQRS-Ready** | Separate directories for commands (writes) and queries (reads) from day one, even if current implementation merges them. | `application/commands/`, `application/queries/` directories |
| 8 | **Bounded Contexts** | Each major capability is a self-contained module with its own domain, application, infrastructure, and presentation layers. | `modules/transit/`, `journey/`, `places/`, `planner/` |
| 9 | **Domain Events** | Important state changes emit events. No direct coupling between aggregates. | `domain/events/DomainEvent.ts`, `StopCreatedEvent`, `RouteUpdatedEvent` |
| 10 | **Transit Graph** | Route planning uses an explicit graph model, not ad-hoc query joins. | `domain/graph/TransitGraph.ts` |
| 11 | **No Raw SQL** | All database access through TypeORM QueryBuilder with typed parameters. Zero `.query()` calls. | `infrastructure/repositories/` |
| 12 | **Thin Controllers** | Controllers only parse HTTP input, call one use case, return output. No business logic. | `presentation/controllers/stops.controller.ts` |
| 13 | **Versioned Providers** | Provider implementations are versioned so source changes don't break historical imports. | `providers/wbbus/v1/` |
| 14 | **ADRs** | Every architectural decision is documented with context, decision, and consequences. | `docs/adr/0001-*.md` through `0008-*.md` |
| 15 | **Mobility Platform** | Architecture is designed for multi-modal growth (bus, metro, train, auto, cab, walking, bike). Not "bus app". | bounded contexts for journey, places, planner, fare, search |
| 16 | **Framework Portability** | All business logic is framework-agnostic. NestJS can be swapped for Fastify/Express without touching domain. | domain layer has zero `@nestjs/*` imports |
| 17 | **Testability** | Repositories are interfaces → mockable. Domain services are pure functions → unit-testable. Use cases are classes → integration-testable. | `StopRepository` interface → `MockStopRepository` in tests |

---

## 14. Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js 20+ | JavaScript runtime |
| **Framework** | NestJS 10 | HTTP framework, DI, module system |
| **Language** | TypeScript 5.3 | Type safety |
| **Database** | PostgreSQL 16 | Relational data store |
| **Geospatial** | PostGIS 3 | Spatial queries (ST_DWithin, ST_Distance, GiST indexes) |
| **ORM** | TypeORM 0.3 | DB schema + QueryBuilder (no raw SQL) |
| **Validation** | class-validator + class-transformer | Request DTO validation |
| **API Docs** | @nestjs/swagger | OpenAPI/Swagger spec generation |
| **Import Worker** | BullMQ | Background job processing (future) |
| **Caching** | Redis | Nearby stops, route, journey cache (future) |
| **Monitoring** | Prometheus + Grafana | Metrics and dashboards (future) |
| **Testing** | Jest + Supertest | Unit, integration, E2E tests |
| **Containerization** | Docker + docker-compose | Local development + deployment |
| **HTTP Client** | Axios | Provider data fetching |
| **HTML Parsing** | cheerio | WBBus HTML scraper |

---

## 15. Naming Conventions

### 15.1 Files

| Pattern | Example | Where |
|---|---|---|
| `PascalCase.ts` — classes | `Stop.ts`, `FindNearbyStopsUseCase.ts` | Domain entities, use cases |
| `kebab-case.ts` — controllers | `stops.controller.ts`, `routes.controller.ts` | Presentation |
| `PascalCase.dto.ts` — DTOs | `NearbyStopsDto.ts` | DTOs |
| `PascalCase.entity.ts` — ORM | `TypeOrmStopEntity.ts` | TypeORM entities |
| `PascalCaseMapper.ts` — mappers | `StopMapper.ts` | Infrastructure mappers |
| `PascalCaseRepository.ts` — repos | `StopRepository.ts` (interface), `PostgresStopRepository.ts` (impl) | Repositories |

### 15.2 Instead of `.service.ts`

| Instead Of | Use |
|---|---|
| `StopsService` | `FindNearbyStopsUseCase`, `FindStopByIdUseCase` |
| `RoutesService` | `FindRoutesUseCase`, `FindRouteDetailsUseCase` |
| `ImportService` | `ImportTransitProviderUseCase` |

### 15.3 Variables

| Pattern | Example |
|---|---|
| `camelCase` for variables | `stopRepository`, `findNearbyStops` |
| `PascalCase` for classes/interfaces | `Stop`, `StopRepository`, `FindNearbyStopsUseCase` |
| `UPPER_SNAKE_CASE` for constants | `TRANSIT_QUEUE`, `STOP_CREATED` |
| `is/has` prefix for booleans | `isWalkable`, `hasCoordinates` |
| Plurals for arrays | `stops`, `routes`, `trips` |

---

## 16. Testing Strategy

### 16.1 Layer Testing

| Layer | What to Test | Tools |
|---|---|---|
| **Domain** | Entity logic, value objects, domain services, transit graph | Jest (pure TS — no mocking needed) |
| **Application** | Use case orchestration, validation, response formatting | Jest + mock repositories |
| **Infrastructure** | Repository implementations, mappers, TypeORM query building | Jest + Testcontainers/PostgreSQL |
| **Presentation** | Controller behavior, DTO validation, HTTP status codes | Jest + Supertest + NestJS testing |
| **Providers** | Parser output, mapper correctness | Jest + fixture HTML files |

### 16.2 File Layout

```
modules/transit/
├── domain/
│   ├── entities/__tests__/        # Stop.test.ts, Route.test.ts
│   ├── services/__tests__/        # StopNormalizer.test.ts, RouteMatcher.test.ts
│   └── graph/__tests__/           # TransitGraph.test.ts
├── application/
│   └── use-cases/__tests__/       # FindNearbyStopsUseCase.test.ts
├── infrastructure/
│   ├── repositories/__tests__/    # PostgresStopRepository.test.ts
│   └── mappers/__tests__/         # StopMapper.test.ts
└── presentation/
    └── controllers/__tests__/     # StopsController.test.ts

providers/wbbus/v1/
├── tests/
│   ├── parser.test.ts
│   └── mapper.test.ts
└── fixtures/
    ├── route-page.html
    └── route-list.html
```

### 16.3 Fixture-Based Provider Tests

```typescript
// providers/wbbus/v1/tests/parser.test.ts
import { readFileSync } from 'fs';
import { WBBusParser } from '../parser/wbbus.parser';

describe('WBBusParser', () => {
  const html = readFileSync('providers/wbbus/v1/fixtures/route-page.html', 'utf-8');
  const parser = new WBBusParser();

  it('should extract stop names from route page', () => {
    const result = parser.parse(html);
    expect(result.stops).toHaveLength(42);
    expect(result.stops[0].name).toBe('Esplanade');
  });
});
```

---

## 17. Future Growth Path

```
Phase 1: Foundation (Current)
├── ✅ NestJS 10 REST API
├── ✅ PostGIS + TypeORM QueryBuilder
├── ✅ DDD + Hexagonal Architecture
├── ✅ WBBus HTML scraper provider
├── ✅ Use cases instead of services
├── ✅ Repository pattern with DI
├── ✅ Domain events (StopCreated, RouteUpdated, TripImported)
├── ✅ Transit Graph (in-memory route engine)
├── ✅ Canonical Transit Model
├── ✅ Architecture Decision Records (8 ADRs)
├── ✅ Migration scripts + data-source.ts
├── ✅ Provider isolation (workspace-root packages)
├── ✅ Worker stub (apps/worker/)
├── ✅ Bounded context stubs (journey, places, planner)
├── ✅ Shared kernel (errors, events, constants, observability)
└── ✅ Complete architecture documentation

Phase 2: Production Hardening
├── 📅 BullMQ worker (full import pipeline)
├── 📅 Redis caching (NearbyStopsCache, RouteCache, JourneyCache)
├── 📅 Swagger/OpenAPI docs (@nestjs/swagger)
├── 📅 Provider fixture-based tests
├── 📅 Metrics + structured logging
├── 📅 Error tracking (Sentry)
├── 📅 Docker Compose (postgres + redis + api + worker)
├── 📅 CI/CD pipeline

Phase 3: Multi-Modal Expansion
├── 📅 Journey planning (transfers, itineraries)
├── 📅 GTFS import provider
├── 📅 BMTC + WBTC providers
├── 📅 Metro provider
├── 📅 Places + Geocoding modules
├── 📅 Full-text search (Elasticsearch)
├── 📅 Event-driven architecture (RabbitMQ/Kafka)
├── 📅 Read models for optimized queries

Phase 4: Intelligence & Scale
├── 📅 AI journey planner
├── 📅 Real-time tracking
├── 📅 Fare calculation
├── 📅 Multi-city support
├── 📅 Open API for partners
├── 📅 Mobile SDK package
├── 📅 Admin dashboard
└── 📅 Performance optimization at scale
