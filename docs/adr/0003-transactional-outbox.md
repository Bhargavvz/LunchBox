# ADR-0003: Transactional outbox for domain events

**Status:** Accepted

**Decision.** A business change and its event are written in one Postgres transaction (`outbox_events`).
`OutboxRelay` (ShedLock-guarded, `FOR UPDATE SKIP LOCKED`) publishes to the `lunchbox.events` topic exchange with
publisher confirms and marks rows published. Consumers are idempotent through `processed_events (consumer, event_id)`.

**Consequences.** No lost or phantom notifications or earnings; at-least-once delivery with consumer
de-duplication; events typically delivered within about a second. Published rows are purged after 14 days.
