# Developer Guide: Transport Provider SDK & Ingestion Pipeline

This document provides complete developer instructions on how to extend, configure, build, and maintain providers for India's largest transport graph platform.

---

## 1. Provider SDK Architecture & Principles

The core ingestion engine is strictly provider-agnostic. No provider-specific code or hardcoded rules are permitted inside core business logic or journey resolution modules.

Adding a new provider (e.g. RedBus, AbhiBus, Paytm Bus, KSRTC, BMTC, Metro Rail services) requires implementing only 5 standardized components:

1. **`ProviderConfig`**: Configuration declaring metadata, priority, rate limits, transport modes, and endpoints.
2. **`Fetcher`**: Format-specific engine fetching HTML, JSON, XML, CSV, GTFS ZIP, PDF text/tables, or Image OCR.
3. **`Parser`**: Extraction engine parsing DOM, JSON, CSV, GTFS, XPath/Regex, or Structured Tables.
4. **`Validator`**: Sanity validator checking mandatory fields, geographic bounds, and emit warnings/errors.
5. **`Mapper`**: Transformer mapping raw provider payloads to standardized `CanonicalMobilityDataset`.

```text
Discovery -> Fetcher -> Raw Records -> Parser -> Validator -> Mapper -> Dataset Builder -> Staging -> Promotion
```

---

## 2. Step-by-Step: How to Add a Provider

### Step 1: Define `ProviderConfig`

Create your provider config inside `apps/api/src/modules/provider-ingestion/providers/my-provider.provider.ts`:

```typescript
import { ProviderConfig } from '../sdk/provider-config.interface';

export const MY_PROVIDER_CONFIG: ProviderConfig = {
  providerCode: 'MY_PROVIDER',
  name: 'My State Transport Corporation',
  sourceType: 'GOVERNMENT',
  website: 'https://myprovider.gov.in',
  version: 'v1',
  priority: 'P0',
  modes: ['BUS'],
  accessType: 'JSON REST API',
  initialStatus: 'ACTIVE',
  endpoints: [
    { name: 'Routes Index', url: 'https://myprovider.gov.in/api/routes', format: 'JSON' },
  ],
  canonicalTargets: ['providers', 'agencies', 'nodes', 'routePatterns', 'trips', 'observations'],
};
```

### Step 2: Implement the `Mapper`

```typescript
import { IMapper } from '../sdk/mapper.interface';
import { CanonicalMobilityDataset } from '../domain/canonical-mobility';
import { ProviderMappingContext } from '../domain/mobility-provider.interface';

export class MyProviderMapper implements IMapper {
  async map(records: Record<string, unknown>[], context: ProviderMappingContext): Promise<CanonicalMobilityDataset> {
    return {
      providers: [{
        code: 'MY_PROVIDER',
        name: 'My State Transport Corporation',
        sourceType: 'GOVERNMENT',
        website: 'https://myprovider.gov.in',
        version: 'v1',
        transportModes: ['BUS'],
      }],
      agencies: [],
      nodes: records.map((r, idx) => ({
        externalId: `myprov_stop_${r.id || idx + 1}`,
        providerCode: 'MY_PROVIDER',
        nodeType: 'BUS_STOP',
        name: (r.stop_name as string) || `Stop ${idx + 1}`,
        normalizedName: ((r.stop_name as string) || `Stop ${idx + 1}`).toLowerCase().trim(),
        aliases: [],
        latitude: typeof r.lat === 'number' ? r.lat : 20.0,
        longitude: typeof r.lon === 'number' ? r.lon : 78.0,
        geography: { countryCode: 'IN' },
        confidence: 0.90,
      })),
      routePatterns: [],
      trips: [],
      frequencies: [],
      fares: [],
      observations: [{
        providerCode: 'MY_PROVIDER',
        providerVersion: 'v1',
        sourceUrl: 'https://myprovider.gov.in',
        fetchedAt: context.fetchedAt,
        contentHash: 'hash_myprov_v1',
        rawRecordId: context.runId,
        confidence: 0.90,
        verificationStatus: 'OFFICIAL',
        warnings: [],
      }],
    };
  }
}
```

### Step 3: Instantiate `BaseProviderAdapter`

```typescript
import { BaseProviderAdapter } from '../sdk/base-provider-adapter';
import { JsonFetcher } from '../sdk/fetcher.interface';
import { JsonParser } from '../sdk/parser.interface';
import { StandardProviderValidator } from '../sdk/validator.interface';

export class MyProviderAdapter extends BaseProviderAdapter {
  readonly config = MY_PROVIDER_CONFIG;
  readonly fetcher = new JsonFetcher();
  readonly parser = new JsonParser();
  readonly validator = new StandardProviderValidator();
  readonly mapper = new MyProviderMapper();
}
```

### Step 4: Register in `ProviderIngestionModule` & Registry

Add `MyProviderAdapter` to `ProviderIngestionModule`'s `providers` and `exports` arrays. Register the entry in your regional registry array (e.g. `WEST_BENGAL_PROVIDER_REGISTRY`).

---

## 3. How Staging, Validation & Promotion Work

```text
+-------------------+      +-------------------+      +--------------------+
|  Fetch & Parse    | ---> |  Validate & Stage | ---> |  Promote to Active |
| Raw Provider Data |      | Staged Canonical  |      | Production Model   |
+-------------------+      +-------------------+      +--------------------+
```

1. **Discovery & Raw Ingest**: Raw payloads are saved as `RawSourceRecord`s with content hashes.
2. **Parsing & Validation**: Raw payloads are parsed into structured items. The `IValidator` checks mandatory fields, coordinates, and sequence sanity. If errors exist, the run is flagged as `FAILED` or `BLOCKED_REQUIRES_PERMISSION`.
3. **Staging**: Valid records are mapped to `CanonicalMobilityDataset` and stored in `StagedCanonicalRecord`.
4. **Promotion**: `DatasetPromotionService` promotes staged versions into active production tables after passing cross-dataset collision and verification tests.

---

## 4. How Stop & Route Enrichment Works

### Stop Enrichment (`StopEnrichmentEngine`)
- **Deduplication**: Matches stops by normalized name and district/geography keys.
- **Alias Aggregation**: Combines aliases across providers (e.g., `Helan`, `Helan Bazar`, `Helan Gram`, `Helan Stand`) without creating duplicate stops.
- **Coordinate & Geography Merge**: Merges missing coordinates, block, and locality metadata from higher-confidence sources.

### Route Enrichment (`RouteEnrichmentEngine`)
- **Sequence Cross-Validation**: Compares stop sequences from multiple sources (e.g. `WBBUS` vs `WBBUSTIME` vs `BUSSATHI`).
- **Best Sequence Selection**: Prefers route definitions with higher sequence density, timetables, and exact fares.

---

## 5. Multi-Source Confidence Scoring

Every canonical entity tracks supporting providers and computes a dynamic confidence score (0-100%):

$$\text{Confidence Score} = \text{Base (0.40)} + \sum \text{Source Weights} + \text{Verification Bonus}$$

| Source Type | Weight |
| --- | --- |
| `GOVERNMENT` | +0.40 |
| `GOVERNMENT_GIS` | +0.38 |
| `GOVERNMENT_APP` | +0.35 |
| `OPERATOR` | +0.30 |
| `OPEN_DATA` | +0.25 |
| `COMMUNITY` | +0.20 |
| `THIRD_PARTY` | +0.15 |

**Example**: A bus stop supported by `WBBUSTIME` (Community), `BUSSATHI` (Community), and verified by `Census of India` (Government) computes to **94% Confidence**.

---

## 6. Pluggable Geocoder Pipeline

When coordinates are missing, `PluggableGeocoderEngine` triggers a prioritized geocoding cascade:

1. **Existing DB**: Direct lookup against indexed canonical nodes.
2. **OpenStreetMap**: Overpass spatial queries for stops/nodes.
3. **Nominatim**: Geocoding API for village/town resolution.
4. **Manual Resolver**: Admin override table for rural/unmapped stops.
5. **Google Geocoding**: Fallback of last resort (marked `isFallback: true`, never stored as primary source of truth).

---

## 7. Search Aliases & Transport Graph Pipeline

### Universal Search & Alias Resolution
Queries like `Majpur` or `Helan` are resolved via `AliasResolverService`:
`Majpur` -> `Majpur Village` -> `Nearest Transport Stop` -> `Journey Search`

### Transport Graph Architecture
`TransportGraphEngine` constructs multimodal journeys:
`Location` -> `Nearest Transport Nodes` -> `Transfers` -> `Routes` -> `Journey`

---

## 8. Provider Health & Statistics Dashboard

Every provider exposes live telemetry accessible via `GET /api/v1/provider-ingestion/dashboard/stats`:

- **Last Successful Sync / Last Failed Sync**
- **Pages Fetched / Records Fetched / Records Parsed**
- **Rejected Records & Average Sync Duration (ms)**
- **Content Hash & Duplicate %**
- **Coverage breakdown (State, Districts, Modes)**
