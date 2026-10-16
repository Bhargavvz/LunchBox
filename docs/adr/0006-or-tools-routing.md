# ADR-0006: OR-Tools PDPTW behind RouteOptimizer, with a heuristic fallback

**Status:** Accepted

**Decision.** Each partner's day is solved as a pickup-and-delivery problem with time windows and capacity using
Google OR-Tools (parallel cheapest insertion + guided local search, 2–5 s limit). Travel time is Haversine × 1.35
circuity at the configured urban speed. `SchoolClusterRouteOptimizer` is a deterministic fallback when the native
library fails or OR-Tools drops orders.

**Consequences.** No external routing dependency or per-call cost. Straight-line estimates under-represent real
roads; the Google Route Optimization API can be added as another `RouteOptimizer` when its accuracy justifies the
cost.
