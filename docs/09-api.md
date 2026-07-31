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

## Internal APIs

| Endpoint | Purpose |
| --- | --- |
| `POST /internal/imports/:provider/run` | Trigger provider import |
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

