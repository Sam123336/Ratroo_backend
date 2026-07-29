# ADR-0003: Hexagonal Architecture (Ports & Adapters) with Domain-Driven Design

**Status:** Accepted  
**Date:** 2026-07-30

## Context

The transit platform is a long-lived system that will evolve across multiple providers, database technologies, and API consumers. A monolithic architecture where business logic depends directly on NestJS decorators, TypeORM entities, or HTTP concerns would make the system brittle: changing the ORM would require rewriting domain logic, and adding a new transport (e.g., gRPC, GraphQL) would require changes across layers.

## Decision

We follow a **Hexagonal Architecture (Ports & Adapters)** combined with **Domain-Driven Design** tactical patterns. The core principle is that **domain logic has zero framework dependencies** — it depends only on pure TypeScript interfaces defined in the domain layer.

### Layer Structure

```
┌─────────────────────────────────────────┐
│           Presentation (Adapters)        │
│  Controllers, DTOs, Swagger             │
│  Depends on: Application layer           │
├─────────────────────────────────────────┤
│           Application (Use Cases)        │
│  FindNearbyStopsUseCase, etc.           │
│  Depends on: Domain (interfaces only)   │
├─────────────────────────────────────────┤
│           Domain (Core / Ports)          │
│  Entities, Repository interfaces,       │
│  Value Objects, Domain Services         │
│  Depends on: Nothing (pure TS)          │
├─────────────────────────────────────────┤
│        Infrastructure (Adapters)         │
│  TypeORM entities, Postgres repos,      │
│  Mappers, Provider clients              │
│  Depends on: Domain (implements ports)  │
└─────────────────────────────────────────┘
```

### Dependency Rule

Dependencies point **inward**: Infrastructure → Application → Domain. Domain never imports from Infrastructure.

### Key Rules

1. **Domain entities have zero imports** from NestJS, TypeORM, Express, or any framework. They are plain classes/interfaces.
2. **Repository interfaces live in the domain layer** — they are contracts, not implementations.
3. **Use cases are the application layer** — they orchestrate domain logic but never touch infrastructure directly.
4. **Controllers are thin** — they parse HTTP input, call a use case, and format the response. No business logic.
5. **Mappers convert between layers** — domain ↔ ORM entities, domain ↔ DTOs, provider formats ↔ canonical model.

## Consequences

- **Positive:** ORM or database changes (e.g., moving from TypeORM to Drizzle) require zero changes in domain or application layers — only infrastructure/mappers change.
- **Positive:** Adding a new transport (e.g., GraphQL, WebSocket) only requires a new presentation adapter — use cases remain unchanged.
- **Positive:** Unit testing domain logic does not require database, HTTP, or NestJS test harnesses — pure function tests with mocks for repository interfaces.
- **Positive:** Framework upgrades (NestJS 10 → 11) are low-risk because domain code imports zero framework packages.
- **Negative:** More files and indirection compared to a traditional NestJS module with decorator-heavy entities and services injected directly.
- **Negative:** Requires mappers between every layer, which adds boilerplate. A field added to a domain entity requires changes in the ORM entity, mapper, and possibly DTO.
- **Negative:** Steeper onboarding — developers must understand hexagonal terminology and the dependency direction rules.