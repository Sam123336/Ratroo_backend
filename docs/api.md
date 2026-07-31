# Transit Platform API

Base URL: `http://localhost:3000`

## Health

```
GET /v1/health
```

Response:
```json
{
  "status": "ok",
  "service": "transit-platform-api",
  "timestamp": "2026-07-30T00:00:00.000Z"
}
```

## Stops

### Find Nearby Stops

```
GET /v1/stops/nearby?lat=22.5726&lng=88.3639&radius=2000
```

Query Parameters:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| lat | number | yes | — | Latitude (-90 to 90) |
| lng | number | yes | — | Longitude (-180 to 180) |
| radius | number | no | 2000 | Search radius in meters (100-50000) |

Response (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Esplanade",
      "normalizedName": "esplanade",
      "latitude": 22.5645,
      "longitude": 88.3509,
      "provider": "WBBUS",
      "distanceMeters": 150
    }
  ],
  "count": 1,
  "searchCenter": {
    "lat": 22.5726,
    "lng": 88.3639,
    "radiusMeters": 2000
  }
}
```

### Get Stop by ID

```
GET /v1/stops/:id
```

Response (200):
```json
{
  "data": {
    "id": "uuid",
    "name": "Esplanade",
    "normalizedName": "esplanade",
    "latitude": 22.5645,
    "longitude": 88.3509,
    "city": "Kolkata",
    "district": null,
    "state": "West Bengal",
    "provider": "WBBUS",
    "externalId": null,
    "createdAt": "2026-07-29T00:00:00.000Z",
    "updatedAt": "2026-07-29T00:00:00.000Z"
  }
}
```

Response (404):
```json
{
  "statusCode": 404,
  "message": "Stop with ID \"bad-id\" not found",
  "error": "Not Found"
}
```

## Routes

### List Routes

```
GET /v1/routes?page=1&limit=50&search=esplanade
```

Query Parameters:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| page | number | no | 1 | Page number |
| limit | number | no | 50 | Items per page |
| search | string | no | — | Search by route name |

Response (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "agencyId": "uuid",
      "shortName": "Esplanade - Dakshineswar",
      "longName": "Esplanade - Dakshineswar",
      "originStopId": "uuid",
      "destinationStopId": "uuid",
      "routeType": "BUS",
      "provider": "WBBUS",
      "externalId": "WBBUS_ROUTE_ESPLANADE_DASHINESWAR"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50
}
```

### Get Route by ID

```
GET /v1/routes/:id
```

Response (200):
```json
{
  "data": {
    "id": "uuid",
    "agencyId": "uuid",
    "shortName": "Esplanade - Dakshineswar",
    "longName": "Esplanade - Dakshineswar",
    "originStopId": "uuid",
    "destinationStopId": "uuid",
    "routeType": "BUS",
    "provider": "WBBUS",
    "externalId": "WBBUS_ROUTE_ESPLANADE_DASHINESWAR"
  }
}
```

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid input parameters |
| INTERNAL | 500 | Unexpected server error |

## Coverage and Launch Regions

Launch regions are modular API scopes. Expansion is frozen to West Bengal and Karnataka, with Bengaluru completed first.

### List Regions

```
GET /v1/coverage/regions
```

Example region slugs:

| Slug | Meaning |
|------|---------|
| `west-bengal` | West Bengal state launch |
| `bengaluru` | Bengaluru city launch |
| `karnataka` | Karnataka statewide backlog after Bengaluru launch |

### Region Details

```
GET /v1/coverage/regions/west-bengal
GET /v1/coverage/regions/west-bengal/providers
```

### Region-Scoped Transit APIs

These endpoints apply each launch region's provider and geography scope.

```
GET /v1/regions/west-bengal/stops/nearby?lat=22.5726&lng=88.3639&radius=2000
GET /v1/regions/west-bengal/routes?page=1&limit=50
GET /v1/regions/bengaluru/stops/nearby?lat=12.9716&lng=77.5946
GET /v1/regions/bengaluru/metro/lines
```

Do not add Kerala, Odisha, events, AI planning, or additional state launch regions until West Bengal and Bengaluru work end to end.

## Provider Registry

Provider registry APIs expose ingestion configuration only. They do not scrape or import data from public controllers.

```
GET /v1/provider-registry/west-bengal
GET /v1/provider-registry/west-bengal/WBBUS
GET /v1/provider-registry/bengaluru
GET /v1/provider-registry/bengaluru/BMTC_OFFICIAL
```

The West Bengal registry currently includes WBBus, WBTC, SBSTC, NBSTC, Kolkata Metro, Eastern Railway suburban, West Bengal ferry, Kolkata auto notifications, and Kolkata Tram.

The Bengaluru registry currently includes BMTC official, BMRCL Metro, the Bengaluru OSM road network, and future community-backed auto/shuttle sources. Airport, metro feeder, night, express, Vajra, and premium BMTC services are `serviceClass` values under `BMTC_OFFICIAL`, not separate providers.

Every provider must follow:

```text
Discover -> Fetch -> Save raw source -> Parse -> Validate -> Map -> Version -> Promote
```

## Ingestion Visibility

Administrative visibility endpoints:

```text
GET /v1/provider-runs
GET /v1/provider-runs/:id
GET /v1/provider-runs/:id/report
GET /v1/dataset-versions
GET /v1/dataset-versions/:id
GET /v1/source-observations/:id
GET /v1/canonical-conflicts
```

Internal command endpoints:

```text
POST /internal/providers/:code/sync
POST /internal/dataset-versions/:id/promote
POST /internal/dataset-versions/:id/reject
POST /internal/node-mappings/:id/resolve
```
