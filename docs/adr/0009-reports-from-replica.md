# ADR-0009: Reports read the replica directly with SQL

**Status:** Accepted

**Decision.** The `reports` module holds its own read-only connection pool to the RDS read replica and queries
across module tables with plain SQL. This is the single, deliberate exception to "modules do not read each other's
tables".

**Consequences.** Analytics never load the primary and aggregations stay simple. Report queries must be updated when
an owning module changes its schema.
