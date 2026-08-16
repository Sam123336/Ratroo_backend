# Fixtures — BMTC official v1

**These are schema-derived, not captured.** They were written from the
published OpenAPI 3.1 description at https://nimmbus.netlify.app, because the
upstream host could not be called when the adapter was written.

That distinction matters for two reasons:

1. They prove the **mapper** is correct against the documented contract. They
   prove nothing about whether the live API matches its own documentation.
2. Under `providers/karnataka/bengaluru/README.md`, nothing reaches canonical
   tables until publisher, licence, freshness and permission are verified.
   Fixtures written from a spec do not change that.

**Replace them with real captures** on the first authorised run: save each raw
response verbatim, keep the URL and fetch time, and re-run the tests. If a
real response disagrees with one of these, the real one wins and the fixture
is overwritten — never the other way round.

## Coverage

| file | endpoint | exercises |
|---|---|---|
| `service-types.json` | `/GetAllServiceTypes` | class mapping incl. the Vayu Vajra/Vajra ordering trap |
| `route-list.json` | `/GetAllRouteList` | directional pairs sharing a `routeparentid` |
| `route-details-2101.json` | `/SearchByRouteDetails_v4` | stop ordering, unlocated `0,0` stops |
| `timetable-2101.json` | `/GetTimetableByRouteid_v3` | per-stop times, and the times-absent case |
