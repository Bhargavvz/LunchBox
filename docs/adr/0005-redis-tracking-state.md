# ADR-0005: Redis for hot tracking state, batched persistence

**Status:** Accepted

**Decision.** The location hot path touches only Redis: a GEO set of positions, a hash with the latest fix, a set of
orders whose parents may watch each partner, and a list buffer. Every 60 s each instance drains the buffer
(`LPOP` with a count, atomic) into daily partitions of `location_pings`.

**Consequences.** Ingest stays well inside the 3 s budget at 10,000 concurrent deliveries and Postgres only sees bulk
inserts. Up to 60 s of raw pings can be lost if Redis fails; latest positions recover with the next fix. Acceptable
for tracking; never used for money.
