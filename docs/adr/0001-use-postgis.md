# ADR-0001: Use PostgreSQL with PostGIS for Geospatial Data

**Status:** Accepted  
**Date:** 2026-07-30

## Context

The West Bengal Bus Data platform needs to store and query transit stops, routes, and trip geometries. Core use cases include finding nearby stops within a radius, computing distances between stops, rendering route lines on a map, and (in future) planning journeys across multiple transit modes. We evaluated options for geospatial storage: a standalone spatial database (PostGIS), a cloud-native geospatial service (MongoDB Atlas with GeoJSON, Google BigQuery GEOGRAPHY), or a separate tile/map service (Mapbox). The rest of the stack is already PostgreSQL 16 via TypeORM, and introducing a second database system adds operational complexity.

## Decision

We use **PostgreSQL 16 with the PostGIS 3.4 extension** as the single database. All geospatial data is stored in PostGIS `GEOGRAPHY` columns, and all spatial queries use PostGIS functions (via TypeORM's QueryBuilder with raw expression fragments).

### Key Details

1. **`GEOGRAPHY` type** for all point and geometry columns — allows accurate distance calculations over the Earth's ellipsoid.
2. **GiST indexes** on all geography columns — enables efficient spatial queries (`ST_DWithin`, `ST_DistanceSphere`).
3. **SRID 4326** (WGS 84) — standard GPS coordinate system. All lat/lng inputs are in this system.
4. **No separate spatial database** — PostGIS lives in the same PostgreSQL instance, in the same database, using the same connection pool.
5. **No map tile server** — map rendering is a frontend concern. The API returns GeoJSON, the frontend renders it with MapLibre/Leaflet.

### Examples

```sql
-- Find stops within 500m of a point
SELECT id, name, ST_AsGeoJSON(geography) as location
FROM stops
WHERE ST_DWithin(
  geography,
  ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
  :radius
);
```

```typescript
// TypeORM QueryBuilder usage
const stops = await this.stopRepository
  .createQueryBuilder('stop')
  .where(
    `ST_DWithin(
      stop.geography,
      ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
      :radius
    )`,
    { lng, lat, radius: 500 }
  )
  .getMany();
```

## Consequences

- **Positive:** Single database for both relational and spatial data — no operational overhead of managing a second system.
- **Positive:** PostGIS is mature, well-documented, and the spatial features match our needs (distance, containment, nearest-neighbor).
- **Positive:** GeoJSON output is straightforward via `ST_AsGeoJSON()`, consumed directly by the frontend.
- **Negative:** PostGIS functions must be written as raw expression strings inside TypeORM's QueryBuilder — the ORM has no native abstraction for PostGIS.
- **Negative:** Spatial operations that could be done in application code (e.g., Haversine) are pushed into the database, which can be a bottleneck for high-volume queries.
- **Negative:** Schema migrations involving PostGIS columns (e.g., adding a geography column to an existing table) require careful handling — TypeORM migration generation may not produce correct spatial DDL automatically.