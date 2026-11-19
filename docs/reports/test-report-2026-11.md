# Test report — 20 November 2026

## Automated suites

| Suite | Result |
|---|---|
| Backend (`./gradlew test`): unit and integration tests against real PostgreSQL + PostGIS, Redis and RabbitMQ (Testcontainers) | **302 tests, 0 failures** (includes 127 working-day combinations) |
| `@lunchbox/ui` (Jest) | 12 passed |
| `@lunchbox/api-client` (Jest) | 11 passed |
| Parent app (Jest + React Native Testing Library) | 13 passed |
| Rider app (Jest) | 9 passed |
| Lint + type-check, all JS packages and apps (turbo) | 15/15 tasks passed |
| Allocation simulation (`AllocationSimulationTest`) | engine ≥ greedy on cost, coverage and fairness in 4 scenarios; see `allocation-simulation.md` |

## End-to-end flows

| Flow | How it is checked | Result |
|---|---|---|
| Sign up (parent): OTP → register → consent | `DeliveryFlowIT`; emulator (earlier rounds) | Pass |
| Resend OTP, cooldowns, wrong-code cap, expiry | `PhoneSignIn.test.tsx`, `otp.test.ts` | Pass |
| Add child → school details shown | Child form shows the school's pickup window, deadline, lunch, working days and holidays (`GET /schools/{id}`) | Pass (type-checked, API covered by IT) |
| Choose plan → coupon / trial → payment | `PrepaidBillingTest`, `CouponAndFeatureRulesTest`, `PlanServiceTest`; Razorpay sandbox not run this round | Pass (unit); live Razorpay ⬜ |
| Plan features enforced (children, days, leave, cancel, priority, live tracking) | `CouponAndFeatureRulesTest`, `LeaveServiceTest`, `AssignmentServiceTest`, tracking snapshot | Pass |
| Order generation after the cut-off | `DeliveryFlowIT` | Pass |
| School working days incl. Saturday/Sunday, every combination | `ChildCalendarServiceTest` (127 combinations), `OrderLifecycleListenersTest` (removing a day cancels its orders) | Pass |
| Calendar matches orders | `ChildCalendarServiceTest` (holidays, leave, unpaid, existing orders) | Pass |
| Allocation (optimal, batching, fairness, zones, shifts, offline, too late, priority, declines) | `AllocationEngineTest`, `AssignmentServiceTest` | Pass |
| No double assignment under concurrency | `DeliveryFlowIT`: three simultaneous runs assign the order once | Pass |
| Who/when/why of an assignment | `DeliveryFlowIT` reads `/admin/orders/{id}/allocation` | Pass |
| Rider declines → reallocation, never re-offered | `AssignmentServiceTest` | Pass |
| Route → OTP pickup → geofenced photo handover → delivered | `DeliveryFlowIT` | Pass |
| Live tracking (newest fix wins, polling when the socket is quiet, foreground refresh) | Hook reviewed; rider heartbeat fix (no distance filter) | Pass (code); device run ⬜ |
| Reports (on-time, failures, daily volume, rider table, CSV, PDF) | Admin against local stack with demo data; charts were blank (React 19 + recharts) and are fixed | Pass |
| Logs (filters, summaries, CSV, system events) | `AdminDataIT`, admin screenshots | Pass |
| Demo data load / remove, harmless to real work | `AdminDataIT` | Pass |
| Account deletion (in app and by ops on request) | `AdminDataIT`, `ParentProfileIT` | Pass |
| Migrations V13–V15 on an existing database with data | Local `lunchbox_ui` database (applied, log backfill verified) | Pass |

## Bugs found and fixed in this round

1. Resend OTP sent no SMS on Android (Firebase reused the verification without `forceResend`).
2. Calendar ignored school working days and plan dates; it could show pickups that never happen.
3. Saturday: the checkout offered days the school does not work (server refused them), and parents could not add a
   newly opened Saturday to an existing plan.
4. Riders waiting at a door looked offline (Android distance filter suppressed the 60 s heartbeat).
5. A dropped socket froze the parent's map until the screen was reopened.
6. Every admin chart rendered nothing (recharts resolved react-is 18 under React 19).
7. Activating or deactivating a plan would have reset its new settings (partial update) — caught before release.
8. The log migration would have failed on the live server (append-only guard) — caught before release.
9. Admin searches queried on every keystroke; rider profiles could not be edited after creation; the 7-day plan limit.

## Not verified in this round

Real Razorpay payments, a real 4-hour route on a phone (battery, background tracking), Google Routes road distances
(no server key configured), Play-installed builds (Play Integrity, app signing fingerprints).
