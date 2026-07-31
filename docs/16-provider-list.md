# Provider Priority Matrix

Expansion is frozen to West Bengal and Karnataka, with Bengaluru completed first. BMRCL Metro and WBBus are the first proven adapters, not the whole project scope.

## West Bengal

| Order | Provider | Mode | Adapter | Priority | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | WBBus | Bus | `wbbus-provider` | P0 | Implemented; run at 25, 100, then full import |
| 2 | WBTC | Bus | `wbtc-provider` | P0 | Kolkata and suburban government buses |
| 3 | NBSTC | Bus | `nbstc-provider` | P0 | North Bengal routes, schedules, depots |
| 4 | SBSTC | Bus | `sbstc-provider` | P0 | South Bengal routes, schedules, fares |
| 5 | Kolkata Metro | Metro | `kolkata-metro-provider` | P0 | Lines, stations, station order, fares, alerts |
| 6 | Eastern Railway suburban | Suburban rail | `eastern-railway-suburban-provider` | P1 | Current services only; old PDFs are historical observations |
| 7 | West Bengal ferry | Ferry | `wb-ferry-provider` | P1 | Ferry terminals, crossings, notices, timings, fares |
| 8 | Kolkata auto | Shared auto | `kolkata-auto-provider` | P2 | Notifications prove route publication, not current operation |
| 9 | Kolkata tram | Tram | `kolkata-tram-provider` | P2 | Preserve active, suspended, and historical status separately |

## Bengaluru

| Order | Provider | Mode | Adapter | Priority | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | BMRCL Metro | Metro | `bmrcl-metro-provider` | P0 | Implemented; run and stabilize live import |
| 2 | BMTC official | Bus | `bmtc-official-provider` | P0 | Regular, feeder, airport, night, premium via `serviceClass` |
| 3 | KSRTC Karnataka | Intercity bus | `ksrtc-karnataka-provider` | P1 | Bengaluru connections after BMTC/BMRCL are stable |
| 4 | OSM road network Bengaluru | Walking/cycling/road | `osm-road-network-bengaluru-provider` | P1 | Routing graph, not timetable provider |
| 5 | Bengaluru auto | Auto | `bengaluru-auto-provider` | P2 | Community/operator verified only |
| 6 | Bengaluru shuttle | Shuttle | `bengaluru-shuttle-provider` | P2 | Community/operator verified only |

## Karnataka After Bengaluru

| Provider | Mode | Adapter | Priority | Notes |
| --- | --- | --- | --- | --- |
| NWKRTC | Intercity bus | `nwkrtc` | P2 | Do not delay Bengaluru launch |
| KKRTC | Intercity bus | `kkrtc` | P2 | Do not delay Bengaluru launch |
| Mysuru urban services | Bus | `mysuru-urban` | P2 | Start after Bengaluru public experience |
| Hubballi-Dharwad services | Bus | `hubballi-dharwad` | P2 | Start after Bengaluru public experience |
| Mangaluru private buses | Bus | `mangaluru-private-bus` | P2 | Start after Bengaluru public experience |
