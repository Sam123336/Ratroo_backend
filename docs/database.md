# Database Schema and Migration Strategy

## Technology Stack

- **Database:** PostgreSQL 16 with PostGIS 3.4 extension
- **ORM:** Sequelize with NestJS integration
- **Migrations:** Sequelize/Umzug-style migration scripts
- **Schema per bounded context:** PostgreSQL schemas for logical separation

## Schema Structure

```
postgres
└── databases: transitdb
    ├── public:      PostGIS extension, migration tracking
    ├── transit:     Stops, routes, trips, stop_times, agencies
    ├── journey:     (future) Journey plans, legs, segments
    ├── places:      (future) Places, addresses, landmarks
    └── planner:     (future) Saved routes, trip plans, alerts
```

## Tables (Transit Schema)

### `stops`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK | Domain entity ID, generated as UUID v7 by the API |
| `external_id` | `VARCHAR(255)` | UNIQUE, NOT NULL | Provider-prefixed ID (e.g., `wbbus:123`) |
| `name` | `VARCHAR(255)` | NOT NULL | Stop name |
| `code` | `VARCHAR(50)` | NULLABLE | Short stop code |
| `platform_code` | `VARCHAR(50)` | NULLABLE | Platform/bay |
| `provider` | `VARCHAR(50)` | NOT NULL, INDEX | Provider key |
| `stop_type` | `VARCHAR(50)` | NULLABLE | Enum: bus_stop, metro_station, etc. |
| `geography` | `GEOGRAPHY(Point, 4326)` | NOT NULL, INDEX (GiST) | PostGIS spatial column |
| `lat` | `NUMERIC(10, 7)` | NOT NULL | Latitude cached from geography |
| `lng` | `NUMERIC(10, 7)` | NOT NULL | Longitude cached from geography |
| `metadata` | `JSONB` | NULLABLE | Provider-specific extras |
| `parent_id` | `UUID` | FK → stops.id, NULLABLE | For station/platform hierarchy |
| `created_at` | `TIMESTAMP WITH TZ` | NOT NULL, DEFAULT NOW() | |
| `updated_at` | `TIMESTAMP WITH TZ` | NOT NULL, DEFAULT NOW() | |

### `routes`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK | |
| `external_id` | `VARCHAR(255)` | UNIQUE, NOT NULL | |
| `name` | `VARCHAR(255)` | NOT NULL | |
| `short_name` | `VARCHAR(50)` | NOT NULL | Route number |
| `description` | `TEXT` | NULLABLE | |
| `provider` | `VARCHAR(50)` | NOT NULL, INDEX | |
| `route_type` | `VARCHAR(50)` | NOT NULL | Enum: bus, metro, train, ferry |
| `direction` | `VARCHAR(20)` | NULLABLE | outbound, inbound, circular |
| `metadata` | `JSONB` | NULLABLE | |
| `created_at` | `TIMESTAMP WITH TZ` | NOT NULL | |
| `updated_at` | `TIMESTAMP WITH TZ` | NOT NULL | |

### `trips`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK | |
| `external_id` | `VARCHAR(255)` | UNIQUE, NOT NULL | |
| `route_id` | `UUID` | FK → routes.id, NOT NULL, INDEX | |
| `service_id` | `VARCHAR(255)` | NOT NULL, INDEX | |
| `direction` | `VARCHAR(20)` | NULLABLE | |
| `head_sign` | `VARCHAR(255)` | NULLABLE | |
| `metadata` | `JSONB` | NULLABLE | |
| `created_at` | `TIMESTAMP WITH TZ` | NOT NULL | |
| `updated_at` | `TIMESTAMP WITH TZ` | NOT NULL | |

### `stop_times`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK | |
| `trip_id` | `UUID` | FK → trips.id, NOT NULL, INDEX | |
| `stop_id` | `UUID` | FK → stops.id, NOT NULL, INDEX | |
| `arrival_time` | `INTERVAL` | NOT NULL | Time of day (can exceed 24:00) |
| `departure_time` | `INTERVAL` | NOT NULL | Time of day |
| `stop_sequence` | `INTEGER` | NOT NULL | |
| `pickup_type` | `VARCHAR(20)` | NULLABLE | Enum |
| `drop_off_type` | `VARCHAR(20)` | NULLABLE | Enum |
| `created_at` | `TIMESTAMP WITH TZ` | NOT NULL | |

### `agencies`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK | |
| `external_id` | `VARCHAR(255)` | UNIQUE, NOT NULL | |
| `name` | `VARCHAR(255)` | NOT NULL | |
| `timezone` | `VARCHAR(50)` | NOT NULL | |
| `url` | `VARCHAR(500)` | NULLABLE | |
| `lang` | `VARCHAR(10)` | NULLABLE | |
| `phone` | `VARCHAR(20)` | NULLABLE | |
| `provider` | `VARCHAR(50)` | NOT NULL | |
| `metadata` | `JSONB` | NULLABLE | |
| `created_at` | `TIMESTAMP WITH TZ` | NOT NULL | |
| `updated_at` | `TIMESTAMP WITH TZ` | NOT NULL | |

## Migration Strategy

### Approach

Sequelize/Umzug-style migrations are used for all schema changes. The workflow is:

1. **Create migration** for the feature change.
2. **Review migration** before running. PostGIS operations (`CREATE EXTENSION`, spatial index creation, geography columns) should be explicit and hand-written when needed.
3. **Run migrations** through the deployment pipeline, and locally through the API migration command once Sequelize is wired.

### Conventions

- Migration files are stored in `apps/api/src/database/migrations/` or a feature-owned migration folder if the runner supports it.
- Each migration file is a single concern (do not combine unrelated schema changes)
- PostGIS extension is created in the first migration: `query('CREATE EXTENSION IF NOT EXISTS postgis')`
- Indexes are created in the same migration as the table they belong to
- Down migrations are written for all production migrations

### Sequelize Configuration

```typescript
// apps/api/src/database/sequelize.config.ts
export const sequelizeConfig = {
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'transit_admin',
  password: process.env.DB_PASSWORD || 'transit_password',
  database: process.env.DB_NAME || 'transit_db',
};
```

### Local Development

- A `docker-compose.yml` at workspace root runs `postgis/postgis:16-3.4` on port 5433
- Schema is reset on demand via `npm run db:reset` (drops and recreates schemas, runs all migrations)
- Seed data is loaded via `npm run db:seed` from provider fixtures

## Indexing Strategy

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `stops` | `idx_stops_geography` | GiST on `geography` | Nearby stop queries |
| `stops` | `idx_stops_provider` | B-tree on `provider` | Provider-scoped queries |
| `stops` | `idx_stops_external_id` | UNIQUE B-tree on `external_id` | ID lookup |
| `stops` | `idx_stops_parent_id` | B-tree on `parent_id` | Parent-child traversal |
| `routes` | `idx_routes_provider` | B-tree on `provider` | Provider-scoped queries |
| `routes` | `idx_routes_short_name` | B-tree on `short_name` | Route number lookup |
| `trips` | `idx_trips_route_id` | B-tree on `route_id` | Route-to-trips join |
| `trips` | `idx_trips_service_id` | B-tree on `service_id` | Schedule filtering |
| `stop_times` | `idx_stop_times_trip_id` | B-tree on `trip_id` | Trip-to-stop_times join |
| `stop_times` | `idx_stop_times_stop_id` | B-tree on `stop_id` | Stop-to-stop_times join |
| `stop_times` | `idx_stop_times_trip_sequence` | Composite on `(trip_id, stop_sequence)` | Ordering |

## Future Considerations

- **Partitioning:** `stop_times` may be partitioned by route or service_id when it grows beyond 10M rows
- **Materialized views:** Route geometry (derived from stop points) could be cached as a materialized view
- **Full-text search:** Stops table may get a `tsvector` column for name/address full-text search
- **Read replicas:** Analytics queries route to a read replica while writes go to primary
