# Yatroo Project Bible

This directory is the living engineering handbook for Yatroo: a national, multi-modal public transport platform for India.

The numbered documents are product and system planning artifacts. The existing implementation docs (`architecture.md`, `database.md`, `providers.md`, `planner.md`, `api.md`, and `adr/`) remain the lower-level technical references.

## Reading Order

| Doc | Purpose |
| --- | --- |
| [00-v1-frozen-scope.md](00-v1-frozen-scope.md) | Frozen V1 product scope, launch regions, provider set, and success criteria |
| [01-vision.md](01-vision.md) | Product vision, users, principles, and success metrics |
| [02-roadmap.md](02-roadmap.md) | Version roadmap from MVP through national scale |
| [03-architecture.md](03-architecture.md) | Platform architecture and service boundaries |
| [04-folder-structure.md](04-folder-structure.md) | Target repository layout |
| [05-database.md](05-database.md) | Data model, schemas, and growth strategy |
| [06-domain-model.md](06-domain-model.md) | Domain language and bounded contexts |
| [07-provider-system.md](07-provider-system.md) | Provider adapter architecture |
| [08-journey-engine.md](08-journey-engine.md) | Routing, transfers, walking, and ranking |
| [09-api.md](09-api.md) | Public and internal API plan |
| [10-admin-dashboard.md](10-admin-dashboard.md) | Operations dashboard requirements |
| [11-flutter.md](11-flutter.md) | Mobile app architecture and flows |
| [12-worker.md](12-worker.md) | Queue, import, sync, and data quality jobs |
| [13-community.md](13-community.md) | Community verification system |
| [14-ai.md](14-ai.md) | AI planner architecture |
| [15-rollout-plan.md](15-rollout-plan.md) | State, district, and city rollout method |
| [16-provider-list.md](16-provider-list.md) | Provider priority matrix |
| [17-state-data-sources.md](17-state-data-sources.md) | State-wise source catalog |
| [18-business-model.md](18-business-model.md) | Monetization, partnerships, and operating model |
| [19-future.md](19-future.md) | Long-term capabilities and open questions |
| [adr/0009-use-sequelize.md](adr/0009-use-sequelize.md) | Sequelize and feature-driven NestJS module decision |

## Source Status

The state data catalog is a research backlog, not a legally approved ingestion manifest. Before production scraping or importing a source, confirm:

- Current official URL
- API or GTFS availability
- Terms of use and licensing
- Rate limits and robots policy
- Data freshness and coverage
- Whether attribution is required
