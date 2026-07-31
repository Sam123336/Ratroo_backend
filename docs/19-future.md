# Future

## Long-Term Capabilities

- National multi-modal journey planning
- GTFS and GTFS-RT import/export where licensing allows
- Real-time crowd signals
- Fare calculation and pass suggestions
- Accessibility routing
- Safety-aware late-night routing
- Local-language voice planning
- Offline district packs
- Agency dashboards and data quality reports
- Open coverage map for civic contributors

## Open Questions

- Which providers permit redistribution versus internal route computation only?
- How should community data be licensed?
- What confidence threshold is required before public launch in a district?
- Should city bus systems and state road transport corporations share one provider family or separate adapters?
- Which routing algorithm should power v1: direct/transfer search, CSA, RAPTOR, or a hybrid?
- How much raw source data should be retained for audit while respecting provider terms?

## Engineering Bets

- Keep provider adapters isolated.
- Keep the canonical model boring and stable.
- Build coverage tracking early.
- Treat admin tooling as core infrastructure.
- Add AI only after structured journey planning is reliable.

