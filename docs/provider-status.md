# Provider Status

Last updated: 2026-08-01 21:00 IST

## West Bengal

| Provider | Implementation | Runtime status | Launch status |
| --- | --- | --- | --- |
| WBBUS | Real adapter exists | Active 500-item dataset; 368 routes, 105 stops, 368 trips, 5,014 stop times; 137 invalid records quarantined | Not launch-ready until stale retry ordering, stop identity, full sync, and journey planning |
| WBTC | Real official route-table adapter exists | Active, idempotent; 127 routes, 796 stops, 127 trips, 1,900 stop times | Good enough for client UI route browsing; needs timetable/departure enrichment |
| NBSTC | Real official route-table adapter exists | Active, idempotent; 100 routes, 37 stops, 100 trips, 297 stop times | Good enough for client UI route browsing; needs coordinates and richer intermediate stops |
| SBSTC | Real adapter with official-page timeout fallback exists | Active, idempotent; 52 route snapshot, 30 stops, 52 trips, 104 stop times; local live fetch timed out | Usable seed for client UI; replace fallback with full live discovery when SBSTC host is stable |
| KOLKATA_METRO | Real static metro adapter exists | Active, idempotent; 5 lines, 55 stations, 58 line-station links | Good enough for client UI line/station browsing; needs coordinates and official machine-readable source enrichment |
| EASTERN_RAILWAY_SUBURBAN | Static official-source-backed adapter exists with maintained seed snapshot | Active, idempotent; 8 routes, 25 stations, 8 trips, 39 stop times | Usable seed for client UI route browsing; needs full GTFS/timetable-grade source before launch routing |
| WB_FERRY | Static official-source-backed adapter exists with maintained ferry route snapshot | Active, idempotent; 9 routes, 18 terminals, 9 trips, 22 stop times | Usable seed for client UI route browsing; needs timings, fares, and terminal coordinates |
| KOLKATA_AUTO | Registry only | Not run | Deferred until official notifications are modeled |
| KOLKATA_TRAM | Static official-source-backed adapter exists with maintained route snapshot | Active, idempotent; 6 routes, 20 stops, 6 trips, 27 stop times | Usable seed for client UI route browsing; needs active/historical status and operating schedule verification |

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
