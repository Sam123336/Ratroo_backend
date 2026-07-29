# ADR-0007: Use Cases Over Services — Application Layer Orchestration

**Status:** Accepted  
**Date:** 2026-07-30

## Context

In a typical NestJS application, business logic lives in injectable services that are directly called by controllers. This leads to services that grow without bound, mixing concerns like validation, orchestration, logging, error handling, and persistence all in one class. The hexagonal architecture calls for a clear separation between orchestration (application layer) and business rules (domain layer). Services in the traditional NestJS sense do not fit neatly into this model.

## Decision

The application layer is organized around **use cases** — single-purpose classes that each represent one operation the system can perform. Each use case:

1. **Has exactly one public method** — typically `execute()` or `invoke()`.
2. **Depends on repository interfaces only** — never on infrastructure, controllers, or framework-specific concerns.
3. **Orchestrates domain logic** — calls repositories, applies domain rules, and returns result DTOs or domain entities.
4. **Is injectable** — NestJS `@Injectable()` decorator for DI, but the class itself imports zero NestJS core modules (no `@InjectRepository`, no `HttpService`, etc.).
5. **Has a clear input/output** — defined as simple TypeScript interfaces or a dedicated DTO class.

### Structure

```typescript
// apps/api/src/modules/transit/application/use-cases/FindNearbyStopsUseCase.ts
import { Injectable } from '@nestjs/common';
import { StopRepository } from '../../domain/repositories/StopRepository';
import { Stop } from '../../domain/entities/Stop';

export interface FindNearbyStopsInput {
  lat: number;
  lng: number;
  radius?: number; // meters, default 500
}

@Injectable()
export class FindNearbyStopsUseCase {
  constructor(
    private readonly stopRepository: StopRepository,
  ) {}

  async execute(input: FindNearbyStopsInput): Promise<Stop[]> {
    // Input validation
    if (input.lat < -90 || input.lat > 90) {
      throw new Error('Invalid latitude');
    }
    // Orchestration — delegate to repository
    return this.stopRepository.findNearby({
      lat: input.lat,
      lng: input.lng,
      radius: input.radius ?? 500,
    });
  }
}
```

### Rules

1. **No large service classes** — If a class has more than 3 methods or covers more than one operation, split into individual use cases.
2. **Use cases are not reusable across contexts** — Each use case belongs to exactly one bounded context.
3. **Cross-cutting concerns** (logging, metrics, caching) are implemented as NestJS decorators or AOP interceptors, not inside use cases.
4. **Error handling** — Use cases throw domain-specific exceptions (e.g., `StopNotFoundError`) defined in the domain layer. Controllers catch and translate to HTTP responses.
5. **Validation** — Input validation is the use case's responsibility, but structural validation (e.g., class-validator decorators on DTOs) can happen at the controller level.

## Consequences

- **Positive:** Use cases are small, focused, and easy to test — no mocking of a large service with 15 dependencies.
- **Positive:** The business operation is explicit in the codebase — `FindNearbyStopsUseCase` is instantly understandable, unlike a `StopService.findNearby()` buried in a 500-line file.
- **Positive:** Adding a new feature means adding a new use case class — no modification to existing services, reducing regression risk.
- **Positive:** Use cases map directly to user stories and API endpoints — traceability from requirements to code is straightforward.
- **Negative:** More files — a system with 50 operations has 50 use case classes plus their DTOs and test files.
- **Negative:** Use cases that share logic (e.g., input validation patterns) must either duplicate code or extract shared helpers — there is no natural place for "common service logic."
- **Negative:** Developers accustomed to CRUD services find the granularity uncomfortable — creating a new file for every operation feels heavy initially.