# Post-MVP algorithms

Interfaces are defined in `backend/src/main/java/com/lunchbox/tracking/postmvp/PostMvpInterfaces.java`; none are wired
in yet.

| Capability | Interface | MVP behaviour today | Plan |
|---|---|---|---|
| Batch matching | `BatchMatcher` | Greedy nearest-available with school affinity (`AssignmentService`) | Hungarian algorithm on a partner × order cost matrix per school cluster when one greedy pass leaves capacity unused |
| Home clustering | `HomeClusterer` | — | DBSCAN on homes per school (eps ≈ 600 m) to design partner zones and pre-assign shifts |
| GPS smoothing | `LocationSmoother` | Plausibility filter (age, accuracy, impossible speed) | Constant-velocity Kalman filter + snap-to-road (Roads API) before broadcast |
| ETA | `EtaModel` | `EtaEstimator`: Haversine × 1.35 / average speed | Gradient-boosted model on `location_pings` + route history (time of day, school, weather) |
| Demand forecasting | `DemandForecaster` | — | Per-school next-day volume from subscriptions, leave patterns and the school calendar, to plan shifts |
| Anomaly detection | — | Impossible-speed and outside-geofence counters + alerts | Per-partner baselines; flag repeated handovers far from schools or long unexplained stops |
