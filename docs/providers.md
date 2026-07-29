# Provider Architecture Overview

## Purpose

The provider system is responsible for ingesting transit data from multiple Indian transit authorities and data sources, normalizing it into the canonical model, and persisting it to the database. Each provider integration is self-contained — changes to one provider never affect another.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Ingestion Trigger                  │
│  (CLI command, cron job, webhook, or manual admin)  │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│                Provider Client                        │
│  HTTP client, HTML scraper, or FTP/GTFS downloader   │
│  Provider-specific auth, headers, rate limiting       │
└──────────┬──────────────────────────────────────────┘
           │
           ▼  (raw response: JSON, HTML, CSV, XML)
┌─────────────────────────────────────────────────────┐
│                Provider Parser                        │
│  Parses raw format → Canonical Model interfaces       │
│  One parser per provider                              │
└──────────┬──────────────────────────────────────────┘
           │
           ▼  (CanonicalStop[], CanonicalRoute[], ...)
┌─────────────────────────────────────────────────────┐
│                   Mapper                              │
│  Canonical Model → Domain entities                    │
│  Applies business rules, validation, ID generation   │
└──────────┬──────────────────────────────────────────┘
           │
           ▼  (Stop, Route, Trip, StopTime entities)
┌─────────────────────────────────────────────────────┐
│             Repository (Transit Context)              │
│  Persists domain entities via TypeORM repositories   │
└─────────────────────────────────────────────────────┘
```

## Provider Directory Structure

```
apps/api/src/providers/
├── index.ts                         # Provider registry / factory
├── wbbus/
│   ├── config.ts                    # Base URL, endpoints, rate limits
│   ├── client.ts                    # HTTP scraper for wbbuses.org
│   ├── parser.ts                    # HTML → CanonicalStop/Route/Trip
│   ├── mapper.ts                    # Canonical → Domain entities
│   └── index.ts                     # Module exports
├── bmtc/
│   ├── config.ts                    # API key, base URL
│   ├── client.ts                    # BMTC ONDC API client
│   ├── parser.ts                    # JSON → Canonical model
│   ├── mapper.ts                    # Canonical → Domain entities
│   └── index.ts                     # Module exports
├── wbtc/
│   ├── config.ts
│   ├── client.ts
│   ├── parser.ts
│   ├── mapper.ts
│   └── index.ts
├── delhi-metro/
│   └── ... (future)
└── gtfs/
    ├── config.ts                    # Feed URLs, schedule
    ├── fetcher.ts                   # Downloads/parses GTFS zip
    ├── gtfs-stops-parser.ts         # stops.txt → CanonicalStop[]
    ├── gtfs-routes-parser.ts        # routes.txt → CanonicalRoute[]
    ├── gtfs-trips-parser.ts         # trips.txt → CanonicalTrip[]
    ├── gtfs-stop-times-parser.ts    # stop_times.txt → CanonicalStopTime[]
    ├── mapper.ts
    └── index.ts
```

## Provider Registry

The `providers/index.ts` file exports a registry that maps provider keys to their implementations:

```typescript
// apps/api/src/providers/index.ts
export const PROVIDER_REGISTRY = {
  wbbus: WBBusProviderModule,
  bmtc: BMTCProviderModule,
  wbtc: WBTCProviderModule,
  'delhi-metro': DelhiMetroProviderModule,
  gtfs: GTFSProviderModule,
} as const;

export type ProviderKey = keyof typeof PROVIDER_REGISTRY;
```

## Provider Contract

Every provider module must export:

| Export | Type | Description |
|--------|------|-------------|
| `ProviderModule` | NestJS `DynamicModule` | Module that registers client, parser, and mapper |
| `ProviderConfig` | Interface | Configuration interface (base URL, auth, etc.) |
| `PROVIDER_KEY` | `string` | Unique provider identifier (e.g., `'wbbus'`) |
| `fetchStops()` | `() => Promise<CanonicalStop[]>` | Fetch all stops |
| `fetchRoutes()` | `() => Promise<CanonicalRoute[]>` | Fetch all routes |
| `fetchTrips()` | `() => Promise<CanonicalTrip[]>` | Fetch all trips with stop times |
| `fetchRouteStops(routeId)` | `(routeId: string) => Promise<CanonicalRouteStop[]>` | Fetch stops for a route |

## Adding a New Provider

1. Create a new directory under `providers/<provider-key>/`
2. Implement `client.ts`, `parser.ts`, `mapper.ts`, `config.ts`
3. Export the contract functions and module from `index.ts`
4. Register in `providers/index.ts`
5. Add provider configuration to environment variables

## Testing

Each provider has its own test fixtures (sample HTML, sample JSON responses) stored in `providers/<provider-key>/__fixtures__/`. Tests mock the HTTP layer and test the parser/mapper pipeline independently.

## Future: Provider Health Dashboard

Planned feature: A dashboard that shows the last successful import time, data freshness, and error rate for each provider.