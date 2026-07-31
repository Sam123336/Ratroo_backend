# API Plan

See also: [api.md](api.md).

## Public APIs

| Endpoint | Purpose | Status |
| --- | --- | --- |
| `GET /v1/health` | Health check | Current |
| `GET /v1/stops/nearby` | Nearby stops | Current |
| `GET /v1/stops/:id` | Stop details | Current |
| `GET /v1/routes` | Route list | Current |
| `GET /v1/routes/:id` | Route details | Current |
| `GET /v1/stops/search` | Text stop search | Planned |
| `POST /v1/journey/plan` | Journey planning | Planned |
| `GET /v1/coverage` | Coverage map | Planned |
| `POST /v1/community/corrections` | Submit correction | Planned |
| `GET /v1/regions/bengaluru/metro/lines` | Promoted Bengaluru metro lines | Current |
| `GET /v1/regions/bengaluru/metro/stations` | Promoted Bengaluru metro stations | Current |
| `GET /v1/regions/west-bengal/bus/routes` | Promoted West Bengal WBBus routes | Current |
| `GET /v1/regions/west-bengal/bus/stops` | Promoted West Bengal WBBus stops | Current |

## Internal APIs

| Endpoint | Purpose |
| --- | --- |
| `POST /internal/providers/:code/sync` | Trigger provider import |
| `POST /internal/dataset-versions/:id/promote` | Promote staged dataset version |
| `GET /internal/imports` | Import history |
| `GET /internal/providers` | Provider registry and health |
| `GET /internal/coverage/gaps` | Coverage backlog |
| `POST /internal/community/:id/moderate` | Moderate correction |

## Response Rules

- Include source confidence where journey data is inferred.
- Include provider attribution where required.
- Keep public IDs stable.
- Never expose raw scraped payloads through public APIs.
- Return partial results with warnings rather than empty success when coverage is incomplete.
- Internal mutation APIs require `x-internal-api-key`.
