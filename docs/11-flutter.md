# Flutter App

## App Goals

- Search origin and destination quickly.
- Show nearby stops without requiring exact addresses.
- Explain practical journeys with transfers and walking legs.
- Work gracefully in low-data-confidence regions.
- Make community corrections simple.

## Primary Flows

| Flow | Screens |
| --- | --- |
| Nearby stops | Home, map/list, stop detail |
| Route lookup | Search, route list, route detail, stop sequence |
| Journey plan | Origin/destination input, results, journey detail |
| Correction | Entity detail, correction form, confirmation |
| Saved commute | Saved route, alerts, recent journeys |

## Architecture

```text
lib/
  app/
  features/
    search/
    stops/
    routes/
    journey/
    community/
    coverage/
  core/
    api/
    location/
    storage/
    analytics/
    theme/
```

## UX Rules

- Always show confidence when data is incomplete.
- Distinguish route availability from live arrival availability.
- Prefer map plus list for nearby stops.
- Keep offline recent searches and saved routes.
- Support English first, then local-language expansion by state.

