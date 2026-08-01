# Launch Readiness

Last updated: 2026-08-01 17:35 IST

## Current status

### West Bengal

| Provider | Status | Active dataset | Evidence | Blocker |
| --- | --- | --- | --- | --- |
| WBBUS | Implemented and active scaled import | `019fbd30-4ea8-7c01-8b7d-a1bcf9b7b92a` | 500-item run completed; 368 routes, 105 stops, 368 trips, 5,014 stop times; 137 invalid records quarantined | Full 1,280-item sync and stop identity quality remain |
| WBTC | Registry only | None | No adapter/service found | Adapter not implemented |
| NBSTC | Registry only | None | No adapter/service found | Adapter not implemented |
| SBSTC | Registry only | None | No adapter/service found | Adapter not implemented; protected booking flows must not be bypassed |
| KOLKATA_METRO | Registry only | None | No adapter/service found | Adapter not implemented |
| EASTERN_RAILWAY_SUBURBAN | Registry only | None | No adapter/service found | Adapter not implemented; current source verification needed |
| WB_FERRY | Registry only | None | No adapter/service found | Adapter not implemented |
| KOLKATA_AUTO | Registry only | None | No adapter/service found | Official notifications only; active operation must be verified |
| KOLKATA_TRAM | Registry only | None | No adapter/service found | Active/suspended/historical status model needed |

Coverage level: 5 for the WBBUS 500-item dataset. West Bengal remains below launch threshold until full WBBUS coverage, stop identity quality, and transfer journeys are verified.

Journey capabilities:

- Statewide search: not launch-ready.
- Direct bus journeys: partially available from WBBUS query tables; journey endpoint is not implemented for West Bengal yet.
- Bus transfer journeys: not launch-ready.
- Bus-to-metro journeys: not launch-ready.
- Walking first/last mile: placeholder only.

Critical blockers:

- WBBUS must be expanded from the verified 500-item import to the full directory.
- WBTC, NBSTC, SBSTC, Kolkata Metro, rail, ferry, auto, and tram adapters are missing.
- West Bengal readiness/search/nearby/journey endpoints are incomplete.

### Bengaluru/Karnataka

| Provider | Status | Active dataset | Evidence | Blocker |
| --- | --- | --- | --- | --- |
| BMRCL_METRO | Active and idempotent | `019fbcf5-ba6c-7778-b5cf-0c5977f73a17` | Rerun returned `SKIPPED_UNCHANGED`; 3 lines, 83 stations | Coordinates/timings/fares/alerts incomplete |
| BMTC_OFFICIAL | Active smoke import | `019fbcb2-2b6f-755a-a386-6de637abfaf2` | 50 route patterns, 9,875 stops, 1,600 route-stop rows | Full route-pattern/trip/stop-time import must run via worker |
| KSRTC_KARNATAKA | Registry only | None | No adapter/service found | Adapter not implemented |
| OSM_ROAD_NETWORK_BENGALURU | Registry/planned | None | No walking adapter found | Real walking routing not implemented |

Coverage level: 4 for Bengaluru bus/metro journey MVP, below launch threshold because walking is approximate and BMTC is not full.

Journey capabilities:

- Search: verified for Bengaluru.
- Nearby: verified where BMTC coordinates exist.
- Direct metro: verified, e.g. Majestic to MG Road.
- Direct bus: verified, e.g. Anekal to Kempegowda Bus Station.
- Bus-to-metro: verified with placeholder walking transfer, e.g. Anekal to MG Road.
- Metro-to-bus: implemented by Journey Engine MVP, still needs fixture/runtime test coverage.
- Walking first/last mile: placeholder only, not launch-ready.

Critical blockers:

- Full BMTC import must run asynchronously through a real worker/queue path.
- Redis/BullMQ is not configured in environment.
- WalkingRoutingPort and OSM-backed routing are not implemented.

### Shared platform

| Area | Status | Evidence | Blocker |
| --- | --- | --- | --- |
| API build | Passing | `npm run build` in `apps/api` | None for current code |
| Worker | Runtime verified locally | `apps/worker npm run build` passes; temporary local Redis processed BMRCL and WBBUS jobs | Production Redis deployment required |
| Queue | Operational locally | BullMQ queue/worker executed provider sync jobs through protected API | Full-size provider import not verified through queue |
| Migrations | Missing | No migration files or migration scripts found | Must add Sequelize/Umzug migrations |
| DB sync | Development-only | API still started with `DB_SYNCHRONIZE=true` for verification | Production must not depend on sync |
| PostGIS | Enabled | Live DB query returned `postgis_enabled: true` | Need migration to reproduce extension |
| Security | Partial | Internal sync requires `x-internal-api-key` | Public rate limits, DTO validation, CORS allowlist, production error sanitization incomplete |
| Observability | Partial | Provider runs and dashboard endpoints exist | Run reports need duration, raw/staged/promoted breakdown, freshness, warnings |
| API | Partial | Bengaluru routes present; West Bengal bus endpoints exist via generic bus controller | Pagination/readiness endpoints incomplete |
| Performance | Partial | BMTC/BMRCL/WBBUS staging and bus trip promotion use batch paths | Full WBBUS and full BMTC timetable imports not verified |

### Latest verification

Command:

```bash
cd apps/api
npm run build
DB_SYNCHRONIZE=true npm run start:dev
POST /internal/providers/BMRCL/sync
POST /internal/providers/BMRCL/sync
POST /internal/providers/WBBUS/sync?maxItems=25&maxPages=5
POST /internal/providers/WBBUS/sync?maxItems=100&maxPages=20
GET /v1/regions/bengaluru/network-summary
GET /v1/regions/west-bengal/bus/routes
GET /v1/regions/west-bengal/bus/stops
cd ../worker
npm install
npm run build
npm run start
```

Result:

- Build passed.
- First post-fix BMRCL run promoted canonical-hash dataset `019fbcf5-ba6c-7778-b5cf-0c5977f73a17`.
- Second BMRCL run returned `SKIPPED_UNCHANGED`.
- Active BMRCL dataset version remained `019fbcf5-ba6c-7778-b5cf-0c5977f73a17`.
- Public summary still returns 3 lines and 83 stations.
- Worker dependencies installed.
- Worker build passed.
- Worker startup failed safely without `REDIS_URL`, then passed with temporary local Redis at `redis://localhost:6379`.
- `npm install` reported 5 vulnerabilities, including 1 high.
- WBBUS 25-item sync completed and promoted active dataset `019fbcfe-e839-70fd-9b7e-7cf4f6389127`.
- West Bengal bus routes/stops public endpoints returned data.
- Shared bus trip promotion was changed from per-trip writes to batched upsert/mapping writes.
- WBBUS 100-item sync completed and promoted active dataset `019fbd09-6a04-7088-af1e-9e6ee2a18ef2`.
- Active WBBUS DB counts: 200 routes, 316 stops, 200 trips, 2,722 stop times.
- Public West Bengal bus endpoints returned 200 routes, 200 paginated stops, and 32 Bankura route search results.
- Added Redis to `docker/docker-compose.yml`.
- Worker queue job `1` completed BMRCL with `SKIPPED_UNCHANGED`.
- Worker queue job `2` completed WBBUS 100-item import and promoted active dataset `019fbd11-f130-7331-ada5-a3cc2c2be0dd`.
- WBBUS 500-item run `019fbd26-ba3f-7155-8c4a-9e097fc8deed` completed: 500 fetched, 363 valid parsed, 137 invalid records quarantined.
- Active WBBUS dataset repaired to larger verified version `019fbd30-4ea8-7c01-8b7d-a1bcf9b7b92a` after an older smaller retry superseded it.
- Active WBBUS DB counts after repair: 368 routes, 105 stops, 368 trips, 5,014 stop times.
- Public West Bengal bus endpoints returned 200 paginated routes, 105 stops, and 56 Bankura route search results.

Timestamp: 2026-08-01 17:35 IST

### Next highest-priority blocker

Exact task: Fix stale overlapping provider retries and improve WBBUS stop identity before attempting full 1,280-item sync.

Reason: WBBUS has now passed a 500-item import, but stale retry jobs can still supersede newer larger datasets, and normalized stop names collapse the 500-item stop set too aggressively.

Acceptance criteria:

- Provider runs have heartbeat/timeout cleanup.
- Older or smaller retry completions cannot supersede newer larger successful dataset versions.
- WBBUS stop identity includes route/location context or resolver evidence, not only normalized stop name.
- Full WBBUS sync is run only after retry ordering and stop identity are corrected.

### 500-item test finding

At 500-item scale, WBBUS produced pages with fewer than two valid stops. Earlier behavior failed the entire import during validation. The importer now checkpoints failed fetches, reports fetch progress every 25 processed detail pages, and filters invalid detail records before canonical validation. A clean 500-item run completed, but stale overlapping retry completion and over-aggressive stop identity remain launch blockers.
