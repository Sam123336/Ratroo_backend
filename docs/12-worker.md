# Worker Architecture

## Purpose

Workers perform slow, unreliable, provider-facing work outside the API request path.

## Queues

| Queue | Purpose |
| --- | --- |
| `mobility-import` | Full and incremental provider imports |
| `source-discovery` | Find new source pages or feed files |
| `data-quality` | Duplicate detection and validation |
| `transfer-build` | Precompute walking transfer graph |
| `coverage-refresh` | Recalculate state/district/city coverage |
| `community-review` | Promote approved corrections |

## Worker Flow

```text
Discovery Worker
↓
Fetch Worker
↓
Parse Worker
↓
Validation Worker
↓
Mapping Worker
↓
Promotion Worker
↓
Coverage Worker
↓
Journey Graph Worker
```

## Import Job Flow

1. Create import run.
2. Discover fetch targets.
3. Fetch with retries and rate limits.
4. Store source record metadata.
5. Parse and normalize.
6. Validate canonical records.
7. Stage canonical records.
8. Promote transactionally.
9. Recalculate coverage and quality metrics.
10. Mark import run complete or failed.

## Failure Policy

- Provider fetch failures retry with backoff.
- Parser failures save the source payload reference and parser version.
- Partial imports are allowed only if entity relationships remain valid.
- Repeated failures raise provider health alerts.

## Temporary API Scheduler

The worker app now contains a BullMQ processor for provider sync jobs. Local Redis is defined in `docker/docker-compose.yml` and should use:

```env
REDIS_URL=redis://localhost:6379
```

Important current limitation: the worker currently triggers provider imports through the protected API endpoint. This is acceptable for small/bounded verification jobs, but the WBBUS 500-item run showed that long worker-to-API HTTP calls can disconnect while the API import continues. Full provider imports should move the importer execution into the worker process or use a short API enqueue call plus durable run monitoring.

Until Redis is configured, the API can run a controlled provider sync scheduler. See [20-provider-sync-cron.md](20-provider-sync-cron.md).

This scheduler is disabled by default and should only run implemented providers such as `WBBUS` and `BMRCL_METRO`.
