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

Launch regions are modular API scopes for state, city, country, and future global rollout.

### List Regions

```
GET /v1/coverage/regions
```

Example region slugs:

| Slug | Meaning |
|------|---------|
| `india` | National API shell |
| `west-bengal` | West Bengal state launch |
| `kerala` | Kerala state launch |
| `karnataka` | Karnataka state launch |
| `bengaluru` | Bengaluru city launch |
| `global` | Future non-India expansion shell |

### Region Details

```
GET /v1/coverage/regions/west-bengal
GET /v1/coverage/regions/west-bengal/providers
```

### Region-Scoped Transit APIs

These endpoints use the same transit use cases as global APIs but apply the launch region's provider and geography scope.

```
GET /v1/regions/west-bengal/stops/nearby?lat=22.5726&lng=88.3639&radius=2000
GET /v1/regions/west-bengal/routes?page=1&limit=50
GET /v1/regions/kerala/routes
GET /v1/regions/bengaluru/stops/nearby?lat=12.9716&lng=77.5946
```

Region configuration lives in the coverage module, so adding a new launch state or global geography does not require changing the transit controllers.
