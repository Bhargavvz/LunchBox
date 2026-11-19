# ADR-0023: Rider allocation as a min-cost assignment with batching, fairness and reliability

**Status:** Accepted (owner asked for an optimal, explainable, configurable rider allocation engine). Replaces the
greedy nearest-rider rule in `AssignmentService`.

**Context.** Orders were taken in pickup order and each went to the nearest eligible rider, with the distance halved
for a rider already serving the school. Greedy choices made early cannot be undone: the nearest rider for the first
order may be the only rider who could reach a later one, so orders were left without a rider while capacity existed.
Work piled onto the riders who happened to be close; ratings, no-shows, zones, shift times and same-day reachability
were ignored; and nobody could see why an order went to a rider.

**Options considered.**
- *Greedy nearest rider* (status quo): fast, but order-dependent and unfair; no global view.
- *Hungarian algorithm* (assignment problem): optimal for one-to-one matching, but riders carry 8–16 boxes; capacity
  needs one column per seat (O(n³) on orders + seats, ~2 s for 3,000 boxes) and it cannot express a cost that grows
  with a rider's load.
- *Min-cost flow*: source → order → rider → sink, with one unit arc per seat. Optimal, handles capacity natively, and
  a convex per-seat cost expresses fair shares exactly. OR-Tools is already a dependency.
- *Full VRP with time windows for allocation*: the most exact, but slow for a whole city and duplicates route planning,
  which already runs per rider (ADR in `RouteOptimizer`).

**Decision.** `AllocationEngine` (pure, no database) solves each day in three steps.

1. **Eligibility.** A rider may take an order only if the home is inside their service radius and their optional
   service area (zone), their shift covers the pickup window and the school deadline, and they have not declined the
   order. On same-day runs offline riders (started shift, no location for `offlineAfterMinutes`) are skipped and a
   rider must reach the home before the pickup window closes. Each order keeps its nearest `candidatesPerOrder`
   riders, priced with road distances when a Google Routes key is set (`GOOGLE_ROUTES_API_KEY`, cached 30 days in
   Redis), otherwise straight line × `roadDetourFactor`.
2. **Optimal assignment.** OR-Tools `MinCostFlow`. Costs are km of riding: distance, rating (unrated = 4 stars),
   reliability (attended ÷ scheduled shifts over 30 days, minus 0.05 per decline; new riders 0.9), and seat costs
   `workloadKm × (2k − 1) / capacity` so the k-th box costs more than the (k−1)-th. Every order also has an arc to
   "unassigned" with `unassignedPenaltyKm` (× `priorityMultiplier` for plans with priority delivery), so the flow is
   always feasible and orders that cannot be served are reported with the most specific reason.
3. **Batching.** A charge of `newSchoolKm` per school a rider adds is a fixed cost the flow cannot express exactly; a
   local search (single moves, whole-school moves between riders, swaps) improves the exact objective.

The weights live in the `allocation.weights` setting (validated, edited on Settings and Rider allocation). Each run
and decision is stored (`allocation_runs`, `allocation_decisions`) with the cost breakdown and the runner-up, shown to
ops per order. Quiet re-runs that change nothing are not stored. Concurrency is unchanged: a Redis lock per order and
the partial unique index on active assignments; a run never overwrites an order changed during it (logged as
CONFLICT).

Fallbacks: riders can decline an order before setting off (it is never offered to them again and the day is
re-allocated); riders silent for `offlineAfterMinutes` lose orders they have not set off for, and ops get an alert for
boxes already on the way (a collected lunchbox cannot change hands; the state machine is unchanged); orders left
without a rider raise one ops alert per hour per count.

**Evidence.** `AllocationEngineTest` (optimum beats greedy, batching, fairness, capacity, every unassigned reason,
priority, determinism), `AssignmentServiceTest`, `DeliveryFlowIT` (three concurrent runs assign once; the decision log
explains it) and `AllocationSimulationTest`, which writes `docs/reports/allocation-simulation.md`: on four simulated
Hyderabad days the engine serves more boxes than greedy (e.g. 571 vs 518 of 600), spreads work more evenly, and solves
3,000 boxes for 250 riders in about 0.3 s.

**Consequences.** Allocation quality depends on the weights; defaults are documented and tunable without a release.
Road distances cost Google Routes API calls on first use (bounded by `candidatesPerOrder` and the cache). Hungarian
batch matching and DBSCAN clustering remain post-MVP options behind the same inputs.
