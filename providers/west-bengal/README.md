# West Bengal Providers

This folder contains versioned provider adapters for West Bengal mobility ingestion.

## Ingestion Rule

Never write scraped/provider records directly into canonical tables.

Required flow:

```text
Discover
-> Fetch
-> Save raw source
-> Parse
-> Validate
-> Map canonical observations
-> Resolve provider identities
-> Deduplicate
-> Persist dataset version
-> Promote dataset after validation
```

## Priority Order

1. WBBus
2. WBTC routes
3. NBSTC
4. Kolkata Metro
5. SBSTC
6. Ferries
7. Suburban trains
8. Auto routes
9. Tram

## Providers

| Provider | Adapter | Modes | Notes |
| --- | --- | --- | --- |
| WBBus | `wbbus-provider` | BUS | Community/private source; preserve confidence |
| WBTC routes | `wbtc-routes-provider` | BUS | Route-pattern source |
| NBSTC | `nbstc-provider` | BUS | North Bengal priority |
| Kolkata Metro | `kolkata-metro-provider` | METRO | Version timetables/fares/alerts by effective date |
| SBSTC | `sbstc-provider` | BUS | Do not bypass access restrictions |
| WB Ferry | `wb-ferry-provider` | FERRY | Treat old notices as observations |
| Eastern Railway suburban | `eastern-railway-suburban-provider` | SUBURBAN_RAIL | Old PDFs are topology only |
| Kolkata auto notifications | `kolkata-auto-notifications-provider` | SHARED_AUTO | Requires operation verification |
| Kolkata Tram | `kolkata-tram-provider` | TRAM | Historical/reference until active status is verified |

## Access Policy

Do not bypass authentication, CAPTCHA, robots restrictions, or technical access controls. If automated access is unclear or prohibited, mark the provider run as `BLOCKED_REQUIRES_PERMISSION`.

