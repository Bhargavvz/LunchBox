# ADR-0001: Modular monolith, package-by-feature

**Status:** Accepted

**Context.** One small team, one release train, strong consistency needs across orders, dispatch and money.
Microservices would add network hops to the latency budget and distributed-transaction problems.

**Decision.** A single Spring Boot deployable organised by feature module (`orders`, `dispatch`, …). Each module
exposes interfaces and records as its public API; entities and repositories are package-private. Cross-module side
effects use in-process events (same transaction) or the transactional outbox (asynchronous).

**Consequences.** Simple deploys and local development. Module boundaries are enforced by visibility and review (an
ArchUnit test is a follow-up). Extracting `tracking` later is straightforward because it already depends on the rest
only through `DispatchTracking`, `OrderQueries` and RabbitMQ events.
