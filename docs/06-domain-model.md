# Domain Model

## Core Language

| Term | Meaning |
| --- | --- |
| Agency | Organization operating transit service |
| Provider | Data source adapter, not always the same as agency |
| Stop | Boarding/alighting point or station node |
| Route | Public-facing service pattern |
| Trip | A scheduled or observed vehicle journey on a route |
| Stop Time | Arrival/departure at a stop within a trip |
| Transfer | Walking or in-station connection between stops |
| Journey | User-facing plan from origin to destination |
| Coverage | Readiness of data for a geography |

## Provider vs Agency

A provider is where data comes from. An agency is who operates transport.

Examples:

- WBBus may provide data for Kolkata bus routes.
- A GTFS feed may contain several agencies.
- A state transport portal may expose routes from one corporation.
- A private aggregator may expose multiple operators.

## Hierarchy

```text
Country
  State or Union Territory
    District
      City / Town / Block
        Stop / Station
          Platform / Bay
```

## Canonical Transit Model

Provider adapters normalize source data into canonical records:

- `CanonicalAgency`
- `CanonicalStop`
- `CanonicalRoute`
- `CanonicalTrip`
- `CanonicalStopTime`

The canonical model is the contract between ingestion and domain persistence.

