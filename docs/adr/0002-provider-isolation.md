# ADR-0002: Provider Isolation — Self-Contained Provider Modules

**Status:** Accepted  
**Date:** 2026-07-30

## Context

The platform ingests transit data from multiple Indian transit authorities (WBBus, BMTC, WBTC, and future sources like Delhi Metro, Indian Railways, and standard GTFS feeds). Each provider has a unique API format, data quality level, update frequency, and authentication mechanism. Historically, transit platforms tightly couple parsing and storage logic, making it difficult to add or modify a provider without breaking existing integrations. We need an architecture where a change to one provider — whether a format change, a new API endpoint, or a deprecation — cannot affect any other provider.

## Decision

Each transit data provider is implemented as a **completely self-contained module** within `apps/api/src/providers/<provider-key>/`. The module owns everything related to that provider:

1. **Client** — HTTP client, HTML scraper, or FTP downloader configured for that provider's specific authentication, rate limits, and endpoints.
2. **Parser** — Converts the provider's raw response format (HTML, JSON, GTFS CSV) into the canonical model interfaces defined in `apps/api/src/canonical-model/`.
3. **Mapper** — Transforms canonical model interfaces to domain entities.
4. **Config** — Provider-specific configuration (base URL, API keys, rate limits, timezone mapping).
5. **Tests/Fixtures** — Test cases with sample responses specific to this provider.

### Isolation Rules

1. **No shared mutable state between providers** — Providers do not share clients, caches, or connection pools. Each provider creates its own.
2. **No shared parsing logic** — Even if two providers return similar JSON schemas, each has its own parser. Extracting shared utilities is allowed only if the utility is purely mechanical (e.g., a date format converter) and lives in `providers/_shared/`.
3. **Provider A cannot import from Provider B** — The only shared dependency across providers is the canonical model and domain entities.
4. **Provider registration is explicit** — A provider must be registered in `providers/index.ts` to be used. Unregistered providers are not loaded.
5. **Removing a provider** involves deleting the directory and removing the entry from `providers/index.ts` — no other code changes.

### When to Create a Shared Utility

If three or more providers have identical parsing logic for a specific sub-problem (e.g., parsing Indian timezones or converting 12-hour AM/PM to 24-hour time), extract a utility into `providers/_shared/`. The utility must:
- Be stateless
- Have its own test suite
- Be imported explicitly by each provider (not auto-loaded)

## Consequences

- **Positive:** Adding a new provider is a contained task — create a new directory, implement the contract, register it. No risk of regression in existing providers.
- **Positive:** A provider can be individually tested, disabled, or removed without touching any other code.
- **Positive:** Each provider can run on its own schedule — BMTC might be scraped daily while GTFS feeds are refreshed hourly, controlled by each provider's module.
- **Positive:** Provider-specific bugs are isolated — a parser error in WBTC does not block WBBus data ingestion.
- **Negative:** Some code duplication across providers — two providers with similar formats (e.g., both using the same GTFS-RT standard) will each have a parser that looks nearly identical.
- **Negative:** More files — each provider adds ~5-8 files. With 10 providers, that's 50–80 files just in the providers directory.
- **Negative:** Provider-specific configuration (API keys, rate limits) must be managed for each provider individually, increasing deployment overhead.