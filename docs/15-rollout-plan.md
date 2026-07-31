# Rollout Plan

## Rollout Unit

Coverage should be tracked at four levels:

1. State or union territory
2. District
3. City, town, or block
4. Provider

## Readiness Levels

| Level | Name | Criteria |
| --- | --- | --- |
| R0 | Not started | No source research |
| R1 | Researched | Candidate sources documented |
| R2 | Prototype | Parser/importer has fixture data |
| R3 | Internal | API can serve routes/stops internally |
| R4 | Public beta | User-facing coverage with warnings |
| R5 | Stable | Scheduled imports and community review |

## Frozen Launch Scope

Expansion is frozen to exactly two launch regions:

1. West Bengal
2. Karnataka, with Bengaluru completed first

Do not add Kerala, Odisha, Delhi NCR, events, AI planning, or additional state launch regions until West Bengal and Bengaluru work reliably end to end.

## Current Implementation Order

1. Run and stabilize BMRCL live import.
2. Run WBBus at 25 items.
3. Run WBBus at 100 items.
4. Run full WBBus import.
5. Move provider sync execution fully to BullMQ.
6. Add provider-run and validation-report APIs.
7. Implement WBTC.
8. Implement BMTC official routes and timetables.
9. Implement NBSTC.
10. Implement SBSTC.
11. Implement Kolkata Metro.
12. Implement KSRTC Bengaluru connections.
13. Implement West Bengal ferry.
14. Implement Eastern Railway suburban services.
15. Implement Kolkata auto notifications.
16. Implement tram historical/current-status provider.
17. Add walking and transfer routing.
18. Complete cross-provider identity resolution.

## District Rollout Checklist

- Identify agencies and private providers.
- Confirm official sites and route pages.
- Check GTFS/API availability.
- Collect sample payloads or timetables.
- Build provider adapter or manual import path.
- Validate stop locations.
- Validate route sequences.
- Enable community correction flow.
- Mark public confidence level.
