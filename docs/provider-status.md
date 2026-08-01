# Provider Status

Last updated: 2026-08-01 17:35 IST

## West Bengal

| Provider | Implementation | Runtime status | Launch status |
| --- | --- | --- | --- |
| WBBUS | Real adapter exists | Active 500-item dataset; 368 routes, 105 stops, 368 trips, 5,014 stop times; 137 invalid records quarantined | Not launch-ready until stale retry ordering, stop identity, full sync, and journey planning |
| WBTC | Registry only | Not run | Not launch-ready |
| NBSTC | Registry only | Not run | Not launch-ready |
| SBSTC | Registry only | Not run | Not launch-ready |
| KOLKATA_METRO | Registry only | Not run | Not launch-ready |
| EASTERN_RAILWAY_SUBURBAN | Registry only | Not run | Not launch-ready |
| WB_FERRY | Registry only | Not run | Not launch-ready |
| KOLKATA_AUTO | Registry only | Not run | Deferred until official notifications are modeled |
| KOLKATA_TRAM | Registry only | Not run | Deferred until active/historical statuses are verified |

## Bengaluru/Karnataka

| Provider | Implementation | Runtime status | Launch status |
| --- | --- | --- | --- |
| BMRCL_METRO | Real adapter exists | Active, idempotent, worker-verified; 3 lines, 83 stations | Partially launch-ready |
| BMTC_OFFICIAL | Real GTFS adapter exists | Active smoke import; 50 patterns, 9,875 stops | Not launch-ready until full worker import |
| KSRTC_KARNATAKA | Registry only | Not run | Not launch-ready |
| OSM_ROAD_NETWORK_BENGALURU | Registry only | Not run | Not launch-ready |

## Blocker Labels

- `BLOCKED_REQUIRES_PERMISSION`: Provider needs explicit access or legal approval.
- `BLOCKED_SOURCE_UNAVAILABLE`: Source is not available or no current machine-readable/public source was found.
- `BLOCKED_AUTH_REQUIRED`: Source requires login, CAPTCHA, or protected booking flow.
- `BLOCKED_DATA_QUALITY`: Source exists but is not trustworthy enough for active service.
- `DEFERRED_NON_CRITICAL`: Not required for the next launch threshold.
