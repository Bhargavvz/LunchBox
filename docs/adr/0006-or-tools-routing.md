# ADR-0006: OR-Tools PDPTW behind RouteOptimizer, with a heuristic fallback

**Status:** Accepted

**Decision.** Each partner's day is solved as a pickup-and-delivery problem with time windows and capacity using
Google OR-Tools (parallel cheapest insertion + guided local search, 2–5 s limit). Travel time is Haversine × 1.35
circuity at the configured urban speed. `SchoolClusterRouteOptimizer` is a deterministic fallback when the native
library fails or OR-Tools drops orders.

**Consequences.** No external routing dependency or per-call cost. Straight-line estimates under-represent real
roads; the Google Route Optimization API can be added as another `RouteOptimizer` when its accuracy justifies the
cost.

## Addendum (2026-10-25): Google Route Optimization API provider

`GoogleRouteOptimizer` implements `RouteOptimizer` against `optimizeTours`: one shipment per lunchbox (home pickup
window → school delivery window, demand 1), one open-ended vehicle with the partner's capacity, road traffic on.
It is **opt-in** (`ROUTING_PROVIDER=google`, default `or-tools`) and wrapped in `FailoverRouteOptimizer`, so any API
error, timeout or quota problem falls back to OR-Tools, and OR-Tools still falls back to the heuristic.
Authentication uses a service account (`GOOGLE_ROUTES_CREDENTIALS_JSON`) or Application Default Credentials.
The Google auth library is already on the classpath through the Firebase Admin SDK, so no dependency was added.
Enable it per environment only after comparing late-delivery rates against OR-Tools on real routes; it is billed per
shipment.
