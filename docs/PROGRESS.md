# Progress

_Last updated: 2026-11-15_

## Status: all phases written; backend (127 tests) and JS checks pass; both apps run natively on the Android emulator against the local stack. Not deployed.

## 2026-11-15 (afternoon) — both apps running natively on the Android emulator; prepaid billing

**Native Android.** Both apps build (`expo run:android` / Gradle) and run on the emulator against the local stack:
real phone sign-in through the Firebase Auth emulator, Today, Children, live tracking on a real Google Map, the
pickup ticket; rider sign-in, route, stop screen with box mark, Navigate (opens Google Maps), masked call, arrival,
background location task. See `runbooks/android-emulator.md` for the Windows path-length workaround.

**Fixed on the way (native-only bugs).** Missing iOS Firebase file broke the Expo config; Hermes has no
`Intl.PluralRules` (added `intl-pluralrules`); zustand's ESM build uses `import.meta` (now CommonJS on all
platforms); push registration threw without Play services; OTP boxes collapsed; shared button rows shrank labels;
map markers rendered blank; content ran under the status bar; the status pill overflowed stop cards;
`expo-system-ui` added for window-level dark mode.

**Prepaid billing (ADR-0018).** Razorpay Subscriptions is not enabled on the account, so plans are paid per period
through Razorpay Orders, with renew, lapse and reminders. Verified in Razorpay test mode up to the native checkout.

**Verified.** 127 backend tests, all JS type-check/lint/tests (26), native builds of both apps.
**Not verified:** finishing a Razorpay test payment inside the checkout (adb typing into its web view is unreliable;
do it by hand), slide-to-confirm pickup and the handover photo on the emulator (memory pressure made input unreliable).

At the owner's request the full codebase was written in one pass, without running builds, linters or tests. Treat
everything below as "implemented, unverified" until the verification checklist passes.

| Phase | Scope | Code | Verified |
|---|---|---|---|
| 0 Foundations | Monorepo (pnpm + Turborepo), docker-compose, Spring Boot skeleton, Expo apps, Next.js admin, shared config, CI, README, architecture + ADRs | ✅ | ❌ |
| 1 Data & Auth | Flyway V1–V8, Firebase token verification + claims, RBAC + ownership, users/parents/children/schools/addresses/service areas APIs, OpenAPI → TS client, audit log | ✅ | ❌ |
| 2 Subscriptions & Orders | Razorpay subscriptions + webhooks, order generation job, holidays/leave days, state machine, outbox | ✅ | ❌ |
| 3 Dispatch & Partner app | Partner onboarding + KYC (IDfy), greedy assignment, OR-Tools routing, partner app, OTP/QR pickup, geofenced photo handover, S3 uploads, offline queue | ✅ | ❌ |
| 4 Tracking & Notifications | STOMP relay, Redis GEO, parent live map with marker interpolation, geofencing, FCM + MSG91 fallback, Exotel masking | ✅ | ❌ |
| 5 Admin panel | Dashboard + live map, management screens, polygon editor, reports from replica, settings, audit viewer | ✅ | ❌ |
| 6 Earnings & Payouts | Append-only ledger, RazorpayX payouts + webhooks, partner earnings screens | ✅ | ❌ |
| 7 Hardening | Security mapping, k6 scripts, Grafana/Prometheus/CloudWatch, Terraform dev/staging/prod, runbooks, EAS config, store checklist | ✅ | ❌ |

## 2026-11-15 — "Ink & Mango" redesign, box marks, and fixes found by running the stack

**Design (ADR-0016).** New palette (royal ink, mango, leaf, sindoor on notebook paper) and Devanagari-capable type
(Baloo 2 + Mukta) in `packages/ui`; no all-caps labels; borderless cards; readable disabled buttons; docked tab bar
with an ink tab-mark; restyled tiffin art, wordmark, map style and toasts. New `BoxMark` and `SlideToConfirm`
components with tests.

**Feature: box marks (ADR-0017).** Backend `BoxCode` + `boxCode` on child, order and pickup-stop responses, and a new
`DropStopDetails.boxes` list. Parent: mark on Today, Children, the child form ("Write ZB96 on the lid") and tracking.
Partner: mark on route and stop screens, slide-to-confirm pickup, and a box-by-box checklist that unlocks
slide-to-hand-over at the school gate. Sign-in now shows how a lunchbox travels (three steps).

**Bugs fixed.**
- React Native 0.81.4 vs 0.81.5 across packages installed two copies of React Native (Jest could not start; native
  builds would have hit "native modules" errors). All on 0.81.5 now; Jest also transforms `jest-expo`'s copy.
- Local S3 had no credentials, so every pre-signed upload (KYC, handover photos) returned 500. Static LocalStack keys
  in the `local` profile only, plus an optional `S3_PRESIGN_ENDPOINT` for the Android emulator.
- Shell scripts were checked out with CRLF on Windows, so LocalStack never created its buckets. Added `.gitattributes`.
- The web previews could not reach the backend or the auth emulator when `.env` used the emulator alias `10.0.2.2`.
- Rider stop cards overflowed the screen width; pickup windows wrapped onto two lines (new `istTimeRange`).

**Verified.** `pnpm typecheck`, `pnpm lint`, `pnpm test` (26 JS tests) and `./gradlew test` all pass. Signed in to
both apps in the browser previews against the local backend with seeded data (`scripts/seed-local-demo.mjs`), and
checked sign-in, Today, pickup code, Children (light and dark), route and stop screens.
**Admin console** restyled on the same tokens (light and dark checked against live data; `pnpm build` passes).
**Not verified:** a native Android build, the slide gesture on a touch screen (the accessibility path is unit-tested)
and the handover camera flow. What production still needs is in `release/go-live-checklist.md`.

## 2026-11-15 — first local run

- `pnpm install` succeeds; backend `compileJava compileTestJava` is **BUILD SUCCESSFUL**.
- `docker compose up -d` brings up all five services healthy; the backend starts with the `local` profile and
  `/actuator/health` reports `UP`.
- Admin sign-in works end to end against the Firebase Auth emulator (`scripts/seed-emulator-admin.ps1` creates a
  verified local admin) and the dashboard loads live data from the backend.
- The parent app renders on Expo web (sign-in screen). Not yet run: backend tests, `pnpm typecheck/lint/test`,
  native Android build (steps in `runbooks/android-emulator.md`).
- Project skills added under `.claude/skills/`: `frontend-design`, `webapp-testing` (anthropics/skills) and
  `expo-design-system`, `expo-native-ui`, `expo-animation`, `expo-router`, `expo-data-fetching`, `expo-dev-client`,
  `expo-upgrade` (expo/skills).

## 2026-10-25 — gap-closing pass (also unverified: nothing was compiled or run, at the owner's request)

| Item | What was added |
|---|---|
| Partner ratings | `POST /api/v1/orders/{orderId}/rating` (V9 migration, `OrderRatingService`, `rating.submitted` event → `RatingEventsConsumer` in dispatch, partner row lock); `RateDelivery` card in the parent order screen (en + hi); comments in DPDP export, cleared on erasure. ADR-0014 |
| Push deep links | Parent: tap opens `/orders/{id}` (or the inbox for broadcasts) and marks the notification read; foreground pushes refresh the inbox/orders. Partner: tap opens today's route and refetches it |
| Module boundary tests | `ArchitectureTest` (ArchUnit): no cross-module repository/entity use, controllers never touch repositories/entities, `common` depends on no feature |
| Google Route Optimization API | `GoogleRouteOptimizer` + `FailoverRouteOptimizer` (→ OR-Tools), selected by `ROUTING_PROVIDER` in `RoutingConfig`; default stays OR-Tools. ADR-0006 addendum |
| Service tests | `AssignmentServiceTest`, `LeaveServiceTest`, `PickupWindowsTest`, `SubscriptionWebhookHandlerTest`, `RazorpayWebhookServiceTest`, `PayoutServiceTest`, `OrderRatingServiceTest`, `GoogleRouteOptimizerTest`; parent `RateDelivery` and `push` Jest tests |
| Bug fix | A late `payout.processed` webhook no longer flips a FAILED/REVERSED payout to PROCESSED (and no longer sends a "payout sent" push for money that bounced) |

Things to look at first when you run the suite:
- `ArchitectureTest` relies on nested enums (`DeliveryPartner.VehicleType`, `RouteStop.Type`) not counting as
  dependencies on their `@Entity` outer class; a static scan of imports and fully-qualified names found no other
  cross-module entity/repository use.
- The OpenAPI snapshot changes (new endpoint, `OrderResponse.ratingStars/ratingComment/canRate`); regenerate
  `docs/api/openapi.json` and the TS client together.
- Measure coverage on the domain packages before adding `jacocoTestCoverageVerification` to CI.

## 2026-10-25 — UI redesign on the Tiffin design system (unverified: nothing was compiled or run)

| Surface | What changed |
|---|---|
| `packages/ui` | Tiffin tokens, light/dark theme, Fraunces + Figtree type scale, components (buttons, cards, list groups, segmented control, OTP input, stats), status pills/journey rail/timeline, tiffin illustrations and wordmark, toast, custom tab bar, haptics, warm map style. ADR-0015 |
| Parent app | Every screen rewritten: Today with ticket-style pickup code, full-bleed live tracking sheet, children, calendar month grid, subscribe flow with honest per-lunch pricing, history, payments, invoice, account, sign-in and registration. All `testID`s kept |
| Partner app | Field-ready redesign: shift card, numbered stop rail, OTP/QR pickup, framed handover camera, SOS issue screen, earnings chart (dataviz rules), sync status, persisted language |
| Admin | Leaf sidebar with grouped nav and live open-issue badge, ⌘K command palette, IST clock, light/dark/system theme, dashboard with order-pipeline bar, split-screen sign-in, restyled reports, SOS-first issues, school receipts, shared table style |

E2E selectors were preserved, with one exception: `login.spec.ts` now expects the grammatical `1 open issue`.
Look at these first:
- Font loading on a cold start (`useFonts` gates the splash).
- The Recharts CSS-variable fills in Safari.
- The inline theme script under the production CSP (`script-src 'unsafe-inline'` is already allowed).

## Verification checklist (run in this order)

1. `cd backend && gradle wrapper` (the wrapper JAR is not committed), then `./gradlew compileJava compileTestJava`.
   Fix compile errors first — likely spots: MapStruct mappers (`SchoolMapper`), Hibernate 6 generator API
   (`UuidV7Generator`), OR-Tools Java API (`OrToolsRouteOptimizer`), Spring 6.2 exception-handler signatures.
2. `docker compose up -d`, then `./gradlew test`. Integration tests boot the whole app against Testcontainers with
   `ddl-auto=validate`, so entity ↔ migration mismatches surface here (`DeliveryFlowIT`, `SecurityIT`).
3. `./gradlew test --tests com.lunchbox.OpenApiSnapshotIT -DupdateSnapshot=true` and commit `docs/api/openapi.json`.
   The JS packages do not type-check until this exists (CI generates the client from it).
4. `pnpm install`, then in `apps/parent` and `apps/partner` run `npx expo install --fix` to align native package
   versions with the installed Expo SDK, then `pnpm generate:api && pnpm typecheck && pnpm lint && pnpm test`.
5. `pnpm --filter @lunchbox/admin build` and `pnpm --filter @lunchbox/admin e2e`.
6. Build Android development clients with EAS and run the Maestro flows.
7. Deploy to staging with Terraform (needs AWS, Route 53, ACM, Firebase and provider sandbox credentials — see
   `runbooks/deploy.md`), then run the k6 scripts (`runbooks/load-testing.md`).

## What needs your credentials or devices

| Item | Needed from you |
|---|---|
| Firebase | Projects per environment, Identity Platform with TOTP MFA, service-account JSON, `google-services.json` / `GoogleService-Info.plist` |
| Google Maps | Android, iOS and web API keys (restricted) |
| Razorpay / RazorpayX | Test-mode keys, webhook secrets, RazorpayX account number |
| MSG91 | Auth key and DLT-approved template ids for the five SMS templates |
| Exotel | SID, API key/token, ExoPhone caller id |
| IDfy | Account id and API key (sandbox) |
| AWS | Account, hosted zone, ACM certificates, `terraform apply` |
| Devices | Android + iOS devices/emulators for dev builds, background-location and camera testing |

## Known gaps and follow-ups

- **Coverage**: unit tests now also cover assignment, subscription/payment webhooks, payouts, leave/cut-off rules and
  ratings. The ≥ 80 % domain-coverage gate (`jacocoTestCoverageVerification`) is configured but not enforced in CI
  until the numbers have been measured.
- **Contract tests**: `OpenApiSnapshotIT` guards drift; request/response validation against the spec is not yet
  added.
- **Child photo** (optional in the brief) is not implemented — partners never see children's photos by design.
- **Google Route Optimization API** is implemented but untested against the live API (needs a GCP project with the
  API enabled and a service account); it is off by default.
- **Invoices** are simple receipts (no GST breakdown) — confirm tax treatment with finance.
- **Aadhaar** verification is manual review (IDfy Aadhaar needs a holder-driven OTP flow).

## Open questions for the product owner

1. Should `PARTNER_EN_ROUTE → REASSIGNED` be allowed (partner accident before pickup)? The brief allows reassignment
   only from `ASSIGNED`.
2. STOMP destinations use `/topic/orders.<id>` (RabbitMQ convention) instead of `/topic/orders/<id>` — OK?
3. Partners see the child's first name and class (the brief allows "name + class"); confirm first name only is enough.
4. Cancelling a subscription is immediate with no pro-rated refund — confirm the refund policy.
5. Cut-off: orders for day D are generated after the cut-off on D-1 (default 21:00 IST); leave changes for D are
   closed after that. Confirm the default cut-off time.
6. Partner pay rates in `V8__seed_settings.sql` are placeholders to be set by ops.
7. Ratings can be given up to 7 days after delivery, once per order — confirm the window (ADR-0014).
