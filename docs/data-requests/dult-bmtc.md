# Data request — DULT / BMTC static timetables

Draft of the request that unblocks Bengaluru timetables. Kept in the repo
because `providers/karnataka/bengaluru/README.md` requires publisher, licence
and permission to be **verified and recorded** before a feed reaches canonical
tables — this is the paper trail for that.

**Send to:** Directorate of Urban Land Transport (DULT), Government of
Karnataka — `dult-bmtc` open data / commissioner's office. Copy BMTC's IT or
Traffic & Commercial wing if a named contact is known.

**Why DULT and not BMTC directly:** DULT runs Bengaluru's open mobility data
work and is the more likely of the two to have a GTFS export already prepared.
BMTC is the data owner, so it goes in copy rather than being skipped.

---

## Subject

Request for BMTC static timetable data (GTFS) — Ratroo public transport app

## Body

Dear Sir/Madam,

I am writing to request access to BMTC's static timetable data for use in
Ratroo, a public transport app for Indian cities and districts.

**What Ratroo does.** It answers three questions for a rider: what services run
near me, how do I get from here to there, and when does the next one leave. It
covers West Bengal today — 2,727 bus routes, 9 ferry routes and 8 rail routes
across roughly 7,900 stops, built entirely from operator-published timetables.
Bengaluru is the next city we would like to serve properly.

**What we have already.** Using openly published sources we hold 5,610 BMTC bus
stops and 50 routes, with their locations and stop sequences.

**What is missing.** We hold no departure times for any BMTC route. Our app
does not estimate or infer times it cannot source, so a rider opening a
Bengaluru stop today is shown the routes that call there together with a
message saying the times are not published to us. We would rather show a real
timetable.

**The request.** Any of the following would let us do that:

1. A GTFS static feed for BMTC services — specifically `stops.txt`,
   `routes.txt`, `trips.txt`, `stop_times.txt` and `calendar.txt`.
2. If no GTFS export exists, the equivalent in any format you already produce —
   route-wise trip timings, including service classes (Ordinary, Vajra, Vayu
   Vajra, metro feeder) and fare stages if available.
3. Alternatively, written confirmation of the terms on which the Namma BMTC
   mobile APIs may be used by a third-party application, together with any rate
   limits or attribution you require.

**How we would use it.** We would attribute BMTC as the source on every screen
that shows its data, honour whatever licence you attach, respect any published
rate limits, and refresh only as often as the data changes. We do not bypass
authentication, rate limiting or access controls of any kind, which is why we
are asking rather than scraping. If you would prefer we not use a particular
dataset, we will not.

We are happy to sign a data sharing agreement, or to provide anything further
about the application that would help you assess the request.

Thank you for your time.

Yours faithfully,

[Full name]
[Role], Ratroo
[Email] · [Phone]
[Website, if any]

---

## Notes for whoever sends this

- **Attach nothing.** A first approach with a PDF deck gets filed. Text only.
- **Do not mention the staging host.** `bmtcmobileapistaging.amnex.com` is a
  vendor environment; naming it invites the answer "that is not for public
  use" and closes option 3. Ask about the Namma BMTC APIs generically.
- **Ask under the RTI Act if there is no reply in ~30 days.** Timetables of a
  public transport undertaking are public information, and an RTI request to
  BMTC's PIO is the normal, non-adversarial escalation.
- **Record the outcome here** — licence, contact, date, any conditions — and add
  the row to the provider table before the feed is ingested.

## Status

| | |
|---|---|
| Drafted | 16 Aug 2026 |
| Sent | — |
| Reply | — |
| Outcome | — |
