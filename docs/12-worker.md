# Worker Architecture

## Purpose

Workers perform slow, unreliable, provider-facing work outside the API request path.

## Queues

| Queue | Purpose |
| --- | --- |
| `transit-import` | Full and incremental provider imports |
| `source-discovery` | Find new source pages or feed files |
| `data-quality` | Duplicate detection and validation |
| `transfer-build` | Precompute walking transfer graph |
| `coverage-refresh` | Recalculate state/district/city coverage |
| `community-review` | Promote approved corrections |

## Import Job Flow

1. Create import run.
2. Discover fetch targets.
3. Fetch with retries and rate limits.
4. Store source record metadata.
5. Parse and normalize.
6. Validate canonical records.
7. Persist with idempotent upserts.
8. Recalculate quality metrics.
9. Mark import run complete or failed.

## Failure Policy

- Provider fetch failures retry with backoff.
- Parser failures save the source payload reference and parser version.
- Partial imports are allowed only if entity relationships remain valid.
- Repeated failures raise provider health alerts.

