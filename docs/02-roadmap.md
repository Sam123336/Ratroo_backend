# Roadmap

## v0.1 Current Foundation

- NestJS API service
- PostgreSQL and PostGIS data model
- Transit bounded context
- WBBus provider exploration
- Nearby stops and route endpoints
- Worker app scaffold
- Architecture Decision Records

## v0.2 Kolkata Working Slice

- Stabilize WBBus importer
- Persist agencies, stops, routes, trips, and stop times
- Add deterministic provider import logs
- Add data freshness and source record tables
- Add basic stop search
- Add route detail with ordered stops
- Add local seed and fixture tests

## v0.3 Journey MVP

- Add journey bounded context
- Implement direct route matching
- Implement one-transfer route search
- Add walking radius search using PostGIS distance first
- Return confidence labels for incomplete schedules
- Add `/v1/journey/plan`

## v1.0 West Bengal Public MVP

- Kolkata and nearby district bus coverage
- WBBus plus selected government/private sources
- Admin dashboard for provider health
- Flutter app with search, route detail, nearby stops, and journey plan
- Community correction intake
- Manual moderation workflow

## v2.0 Multi-State Expansion

- Add Delhi, Karnataka, Odisha, Maharashtra, Tamil Nadu, Kerala, Telangana, and Uttar Pradesh priority lanes
- Add GTFS ingestion
- Add metro data where official feeds exist
- Add district rollout dashboard
- Add provider certification status

## v3.0 Multi-Modal Planning

- Bus, metro, suburban rail, ferry, walking, bike, and first/last-mile legs
- RAPTOR or CSA-based timetable planner
- Transfer graph precomputation
- Real-time updates where available
- Fare estimation

## v4.0 AI Planner

- Conversational journey planning
- Landmark-aware origin and destination resolution
- Disruption-aware suggestions
- Accessibility and safety preferences
- Local language route explanations

## v5.0 National Mobility Platform

- All Indian states and union territories represented in the coverage system
- Public developer APIs
- Partner dashboards for agencies and cities
- Open-data export where licensing allows
- Community operations network

