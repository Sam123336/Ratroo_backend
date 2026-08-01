# Data Quality

Last updated: 2026-08-01 17:35 IST

## Current Metrics

| Provider | Routes/lines | Nodes | Trips | Stop times | Coordinate coverage | Schedule coverage | Fare coverage | Active-status coverage |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| BMRCL_METRO | 3 lines | 83 stations | 0 | 0 | Low | Not imported | Not imported | Basic |
| BMTC_OFFICIAL | 50 route patterns | 9,875 stops | 0 | 0 | High for stops | Not imported in active smoke dataset | Not imported | Basic |
| WBBUS | 368 route patterns | 105 stops | 368 | 5,014 | Low/unknown | Partial | Not imported | Unknown |

## Quality Rules

- Do not claim complete BMTC coverage until all route patterns are promoted.
- Do not claim timetable-aware BMTC planning until trips and stop times are promoted or frequency data is modeled.
- Do not expose BMRCL coordinates as complete until coordinates are sourced from an official or trusted spatial source.
- Do not expose historical tram/rail data as active without current evidence.
- Preserve every public record's provider, source observation, raw source, content hash, confidence, and verification status.

## Latest Verification

2026-08-01 16:25 IST:

- BMRCL canonical idempotency verified.
- BMRCL active version stable after unchanged rerun.
- BMTC active dataset remains a UI smoke import, not full coverage.

2026-08-01 16:30 IST:

- Worker build verified.
- Full BMTC import remains blocked by missing Redis queue configuration.

2026-08-01 16:35 IST:

- WBBUS 25-item sync completed.
- Public West Bengal bus routes and stops endpoints returned promoted data.
- WBBUS warnings show many stops without usable UP/DOWN times; schedule quality remains partial.

2026-08-01 16:47 IST:

- Shared bus trip promotion was batched to remove the 100-item promotion bottleneck.
- WBBUS 100-item sync completed and promoted dataset version `019fbd09-6a04-7088-af1e-9e6ee2a18ef2`.
- Active WBBUS DB counts: 200 routes, 316 stops, 200 trips, 2,722 stop times.
- Public West Bengal bus endpoints returned route, stop, and Bankura search results.

2026-08-01 16:56 IST:

- Temporary local Redis verified BullMQ worker runtime.
- Worker job completed BMRCL idempotent sync without changing the active dataset.
- Worker job completed WBBUS 100-item sync and promoted active dataset version `019fbd11-f130-7331-ada5-a3cc2c2be0dd`.

2026-08-01 17:15 IST:

- WBBUS 500-item scale test discovered invalid detail pages with fewer than two valid stops.
- WBBUS importer now checkpoints failed fetches, updates fetch progress every 25 processed detail pages, and quarantines invalid detail records before canonical validation.
- Clean WBBUS 500-item rerun remains the next verification step.

2026-08-01 17:35 IST:

- WBBUS 500-item run completed with 500 fetched, 363 valid parsed records, and 137 rejected invalid records.
- Active WBBUS dataset version `019fbd30-4ea8-7c01-8b7d-a1bcf9b7b92a` has 368 routes, 105 stops, 368 trips, and 5,014 stop times.
- Stop count is lower than expected at this scale because the current WBBUS node identity is normalized stop name only; resolver/identity work is required before full launch claims.
