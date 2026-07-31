# Bengaluru Providers

This folder contains versioned provider adapters for Bengaluru mobility ingestion.

## Ingestion Rule

Never write scraped/provider records directly into canonical tables.

Required flow:

```text
Discover
-> Fetch
-> Save raw
-> Parse
-> Validate
-> Map canonical observations
-> Stage
-> Resolve provider identity
-> Resolve interchanges
-> Promote dataset version
-> Build coverage/read model
```

## Priority Order

1. BMTC official data
2. BMRCL Metro
3. BMTC metro feeders
4. BMTC stations/TTMCs
5. Vayu Vajra
6. OpenStreetMap walking
7. Namma BMTC realtime, only after access review
8. KSRTC
9. Suburban rail
10. Community auto/shuttle data

## Providers

| Provider | Adapter | Modes | Status |
| --- | --- | --- | --- |
| BMTC official | `bmtc-official-provider` | BUS | Active development |
| Namma BMTC AVLS | `namma-bmtc-avls-provider` | BUS, realtime | Access review required |
| BMRCL Metro | `bmrcl-metro-provider` | METRO | Active development |
| BMTC airport | `bmtc-airport-provider` | BUS | Research |
| BMTC metro feeder | `bmtc-metro-feeder-provider` | BUS | Active development |
| BMTC facilities | `bmtc-facilities-provider` | BUS facilities | Active development |
| DULT TransitGIS | `dult-transitgis-provider` | GIS layers | Research required |
| KSRTC | `ksrtc-karnataka-provider` | INTERCITY_BUS | Planned |
| KRIDE suburban rail | `kride-suburban-rail-provider` | SUBURBAN_RAIL | Research required |
| Indian Railways | `indian-railways-bengaluru-provider` | RAILWAY_STATION | Research |
| Community mobility | `bengaluru-community-mobility-provider` | AUTO, SHUTTLE | Planned |
| OSM network | `osm-bengaluru-network-provider` | WALKING, CYCLING | Planned |

## First Multimodal Milestone

```text
Current location
-> Walk
-> Nearest BMTC stop
-> BMTC bus / feeder
-> Metro station
-> Namma Metro
-> Destination station
-> Walk
-> Final destination
```

Success requires BMTC facilities, feeder routes, BMRCL lines/stations/timetables/fares, interchange resolution, source observations, and walking legs through a routing engine.

## Access Policy

Do not bypass authentication, CAPTCHA, session controls, proprietary API restrictions, or rate limits. Mark Namma BMTC AVLS as `RESEARCH_REQUIRES_ACCESS_REVIEW` until its public-data terms are confirmed.

Unofficial BMTC GTFS datasets are fixtures/research only unless publisher, license, freshness, and permissions are verified.

