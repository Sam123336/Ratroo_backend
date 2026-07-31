# BMTC Official Provider v1

Sources:

- https://mybmtc.karnataka.gov.in/english
- https://mybmtc.karnataka.gov.in/33/bus-stations/en
- https://mybmtc.karnataka.gov.in/new-page/Metro%20Feeder%20Route%20details/en
- https://mybmtc.karnataka.gov.in/info-3/Daily%2BWeekly%2BMonthly%2BPasses/en

Adapter key: `bmtc-official-provider`

Priority: P0

## Package Structure

```text
client/
discovery/
parser/
mapper/
validator/
fixtures/
tests/
```

## Initial Scope

1. BMTC stations and TTMC facilities
2. Metro feeder routes
3. Route/timetable PDFs
4. Pass and fare products
5. Service announcements

Facility records must be staged first. Do not automatically treat every station address as a route stop.

