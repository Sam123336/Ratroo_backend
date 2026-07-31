# WBBus Provider v1

Source:

- https://wbbus.in/
- https://wbbus.in/allbus

Adapter key: `wbbus-provider`

Access: HTML + pagination

Priority: P0

## Pipeline

```text
discovery -> client -> raw_source_records -> parser -> validation -> mapper -> dataset_versions
```

WBBus is treated as a community/private source. It can contribute useful route, stop, trip, vehicle, and timing observations, but it should not automatically override official sources.

## Files

```text
wbbus.discovery.ts
wbbus.client.ts
wbbus.parser.ts
wbbus.validator.ts
wbbus.mapper.ts
wbbus.provider.ts
wbbus.types.ts
fixtures/
tests/
```

The mapper does not deduplicate against other providers. Identity resolution belongs to provider mapping and promotion workflows.
