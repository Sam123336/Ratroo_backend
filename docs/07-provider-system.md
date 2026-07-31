# Provider System

See also: [providers.md](providers.md).

## Provider Types

| Type | Examples | Strategy |
| --- | --- | --- |
| GTFS static | Delhi bus, metro feeds where published | Download, validate, normalize |
| GTFS realtime | Vehicle positions, trip updates | Poll or stream, merge with static |
| Official JSON API | City or STU APIs | Auth, rate limit, normalize |
| HTML site | WBBus, some STU route pages | Scrape with fixtures and selectors |
| PDF timetable | District and depot timetables | Extract, review, community verify |
| Mobile app API | Public app endpoints | Legal review before use |
| Community | User submissions | Moderated ingest |

## Raw-Source-First Rule

Provider parsers must never write directly into canonical mobility tables.

Required pipeline:

```text
Discover
-> Fetch
-> Save raw_source_records
-> Parse
-> Validate
-> Map canonical observations
-> Resolve provider identities
-> Deduplicate
-> Persist dataset version
-> Promote dataset after validation
```

The provider-ingestion module owns provider registry, provider runs, raw source records, datasets, dataset versions, and source observations.

## West Bengal Provider Priority

1. WBBus
2. WBTC routes
3. NBSTC
4. Kolkata Metro
5. SBSTC
6. Ferries
7. Suburban trains
8. Auto routes
9. Tram

## Bengaluru Provider Priority

1. BMTC official data
2. BMRCL Metro
3. BMTC metro feeders
4. BMTC stations/TTMCs
5. Vayu Vajra
6. OpenStreetMap walking
7. Namma BMTC realtime, only after access review
8. KSRTC
9. Suburban rail
10. Community auto/shuttle data

## Generic Interface

```typescript
export interface TransitProvider {
  readonly providerCode: string;
  discover(): Promise<unknown[]>;
  fetch(items: unknown[]): Promise<unknown[]>;
  normalize(data: unknown[]): Promise<NormalizedTransitData>;
}
```

## Adapter Lifecycle

1. Discover source records.
2. Fetch raw payloads.
3. Persist raw source metadata.
4. Parse to provider-specific models.
5. Normalize to canonical model.
6. Validate required fields.
7. Match and deduplicate stops/routes.
8. Persist domain entities.
9. Emit import metrics and quality warnings.

## Provider Quality Levels

| Level | Meaning |
| --- | --- |
| L0 Candidate | Source identified only |
| L1 Research | URL, owner, and feasibility documented |
| L2 Fixture | Sample payload saved and parser planned |
| L3 Import | Importer runs locally |
| L4 Verified | Data checked by admin/community |
| L5 Production | Scheduled import, alerts, dashboards |
