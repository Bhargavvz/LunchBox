# ADR-0014: Parent ratings of deliveries

**Status:** Proposed — please confirm the 7-day window

**Decision.** A parent may rate each delivered order once (1–5 stars, optional comment ≤ 500 chars) within 7 days of
delivery. The rating is stored on the order (`orders.rating_*`, V9). The orders module publishes `rating.submitted`
through the outbox; the dispatch module consumes it on `dispatch.ratings` and folds it into the partner's running
average under a row lock. The routing key sits outside `order.#` so the notifications consumer never sees it.

**Consequences.** Orders never reach into dispatch (module rule, enforced by `ArchitectureTest`). The partner average
is eventually consistent (seconds). Comments are personal data: included in the DPDP export, cleared on erasure;
stars are kept as anonymous service-quality history. Partners never see individual ratings or comments, only their
average (unchanged behaviour).
