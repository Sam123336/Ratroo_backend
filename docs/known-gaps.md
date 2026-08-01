# Known Gaps

Last updated: 2026-08-01 17:35 IST

## Critical

| Gap | Region | Status | Notes |
| --- | --- | --- | --- |
| Full BMTC import is not complete | Bengaluru | Open | Current active dataset is a 50-route-pattern smoke import with 9,875 stops and no trips/stop_times. |
| Production BullMQ runtime is not configured | Shared | BLOCKED_REQUIRES_CONFIG | Worker builds and ran locally with temporary Redis; production/staging `REDIS_URL` still needs to be configured. |
| Migrations are missing | Shared | Open | Schema currently depends on `DB_SYNCHRONIZE=true` during local verification. |
| Walking routing is placeholder | Shared | Open | Journey responses use approximate walking transfer legs, not OSM/GraphHopper/Valhalla routes. |
| West Bengal full dataset missing | West Bengal | Open | WBBUS 500-item import is active; full 1,280-item sync remains. |
| Stale provider runs after interrupted worker/API requests | Shared | Open | Some interrupted WBBUS 500 attempts remained in `FETCHING`; add heartbeat/timeout cleanup and retry-order guards. |
| Older retry can supersede newer larger dataset | Shared | Open | A smaller stale retry briefly superseded the larger WBBUS 500 dataset; local active pointer was repaired. |

## Provider Gaps

| Provider | Status |
| --- | --- |
| WBTC | Adapter missing |
| NBSTC | Adapter missing |
| SBSTC | Adapter missing; booking protections must not be bypassed |
| KOLKATA_METRO | Adapter missing |
| EASTERN_RAILWAY_SUBURBAN | Adapter missing; current timetable source must be verified |
| WB_FERRY | Adapter missing |
| KOLKATA_AUTO | Notification ingestion missing |
| KOLKATA_TRAM | Status-aware ingestion missing |
| KSRTC_KARNATAKA | Adapter missing |

## Data Quality Gaps

- BMRCL station coordinates are missing from the current official/fallback parser output.
- BMRCL timings, fares, and alerts are not imported.
- BMTC trip and stop-time tables are empty for the active dataset.
- Full provider coverage levels are not calculated from promoted data.
- No manual conflict review workflow has been verified.
- WBBUS 500-item run exposed invalid detail pages with fewer than two stops; these are now quarantined in code.
- WBBUS stop identity is currently too coarse for larger imports because normalized stop names can collapse unrelated stops.

## Security Gaps

- Public search/journey rate limiting is not verified.
- DTO validation is incomplete on public query endpoints.
- Production CORS allowlist is not verified.
- Worker `npm install` reported 5 vulnerabilities, including 1 high.
- Backup/restore procedure is not documented.
