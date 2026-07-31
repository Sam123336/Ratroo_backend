# BMRCL Metro Provider v1

Sources:

- https://www.bmrc.co.in/
- https://www.bmrc.co.in/metro-timings/
- https://www.bmrc.co.in/tickets/
- https://www.bmrc.co.in/fare-rules/

Adapter key: `bmrcl-metro-provider`

Priority: P0

## Package Structure

```text
network/
  lines.parser.ts
  stations.parser.ts
  interchanges.parser.ts
timetable/
  metro-timetable.parser.ts
fares/
  fare-rules.parser.ts
  ticket-products.parser.ts
alerts/
  service-alerts.parser.ts
fixtures/
tests/
```

Every metro record should include `operationalStatus`, `effectiveFrom`, `effectiveUntil`, and `lastObservedAt` where available.

## First Static Dataset Milestone

```text
Discover BMRCL static pages
-> Fetch
-> Save raw source
-> Parse lines/stations/interchanges
-> Validate status and source provenance
-> Map canonical agencies/nodes/route patterns/source observations
-> Stage
-> Promote
-> Query Bengaluru metro stations and lines
```

Do not begin with live train timing. Start with static network, stations, interchanges, operating hours, first/last train references, and fare structure.
