# Community Verification

## Purpose

Community verification fills gaps where official data is absent, stale, or incomplete.

## Submission Types

| Type | Examples |
| --- | --- |
| Stop correction | Name, location, landmark, platform |
| Route correction | Missing stop, wrong stop order, route renamed |
| Timing correction | First bus, last bus, frequency, observed delay |
| Closure alert | Road closure, temporary route change |
| Photo evidence | Stop board, timetable board, depot notice |

## Trust Model

- New users can submit corrections but not auto-apply them.
- Verified users gain reputation by accepted corrections.
- Sensitive changes require moderator approval.
- Conflicting submissions create review tasks.
- Official imports override community data unless official data is stale or marked low-confidence.

## Moderation States

```text
submitted -> triaged -> verified -> applied
                     -> rejected
                     -> needs_more_evidence
```

## Abuse Controls

- Rate limits per user and geography
- Duplicate detection
- Evidence requirement for route-altering changes
- Admin audit log
- Rollback support

