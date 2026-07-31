# Provider Priority Matrix

## Tier 1

| Provider | Geography | Mode | Adapter | Priority | Notes |
| --- | --- | --- | --- | --- | --- |
| WBBus | West Bengal / Kolkata | Bus | `wbbus` | P0 | Current implementation focus |
| WBTC | West Bengal / Kolkata | Bus | `wbtc` | P0 | Government bus source research needed |
| Delhi Open Transit Data | Delhi | Bus / Metro | `delhi-otd` | P0 | GTFS-style data available through Delhi OTD |
| BMTC | Bengaluru | Bus | `bmtc` | P0 | High-demand city; official/live data needs verification |
| Odisha OPTICS | Odisha | Bus | `optics-odisha` | P0 | State-level priority named in plan |
| MP Transport | Madhya Pradesh | Bus | `mp-transport` | P1 | State road transport and city sources |

## Tier 2

| Provider | Geography | Mode | Adapter | Priority | Notes |
| --- | --- | --- | --- | --- | --- |
| KSRTC Karnataka | Karnataka | Intercity bus | `ksrtc-karnataka` | P1 | Coordinate with BMTC/NWKRTC/KKRTC coverage |
| Kerala RTC | Kerala | Bus | `kerala-rtc` | P1 | Statewide strategy required |
| MSRTC | Maharashtra | Bus | `msrtc` | P1 | Large statewide network |
| MTC Chennai | Tamil Nadu / Chennai | Bus | `mtc-chennai` | P1 | Pair with Chennai Metro |
| TSRTC | Telangana | Bus | `tsrtc` | P1 | Hyderabad plus statewide routes |
| UPSRTC | Uttar Pradesh | Bus | `upsrtc` | P1 | Large route network |

## Tier 3

| Provider | Geography | Mode | Adapter | Priority | Notes |
| --- | --- | --- | --- | --- | --- |
| Metro feeds | Multi-state | Metro | `gtfs-metro-*` | P2 | Prefer GTFS where available |
| Ferry sources | Kerala, Goa, Assam, islands | Ferry | `ferry-*` | P2 | Often fragmented |
| Private bus portals | Multi-state | Bus | `private-bus-*` | P3 | Legal review before scraping |
| Community-only districts | Multi-state | Bus | `community-*` | P3 | Requires moderation capacity |

