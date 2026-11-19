# Progress

_Last updated: 2026-11-19_

## Status: all phases written; backend (139 tests) and JS checks pass; deployed to one EC2 server (us-east-1, sslip.io names) with EAS builds of both apps.

## 2026-11-19 (late night) — Hyderabad as the service city; plain background

- **Hyderabad:** one setting in `packages/api-client/src/location.ts` (`SERVICE_CITY`, `SERVICE_CITY_CENTER`,
  `SERVICE_CITY_BOUNDS`). Admin maps open on Hyderabad, new schools and service areas start with city "Hyderabad"
  and a Hyderabad pin, address search is biased to Greater Hyderabad, and the parent address picker opens on
  Hyderabad with the city filled in. The demo seed uses Banjara Hills (500034); tests, fixtures, the Maestro flow and
  the load script use Hyderabad coordinates (shifted by one offset so distances between points are unchanged).
  Schools and service areas already saved on the live server are data and were not changed.
- **Background:** the school doodles are gone; screens use plain steel (ADR-0022 updated).

## 2026-11-19 (night) — admin panel redesign, rider screens, deployed, new EAS builds

- **Admin panel** on "Chalk & Turmeric" (ADR-0022): new tokens, Khand + Hind, light sidebar with chalk pill, flat
  cards and tables, Khand titles and figures, rim buttons, chalk-plate empty states, new brand mark. Dashboard: a
  chalkboard panel with today's pickups, on-time rate (a dash until something is delivered) and the pipeline as
  tiffin tiers. Sign-in hero on the chalkboard. Plans page: readable billing text, sized status filter, empty table
  state. Reports: charts show an empty state when the range has no deliveries instead of a blank box.
- **Admin fix:** after a page reload every page opened with "Please sign in to continue" because queries ran before
  Firebase restored the session; the token now waits for `authStateReady()`.
- **Rider app:** route stops drawn as tiffin tiers (current stop turmeric, done chalk, failed chilli) with bordered
  cards; earnings hides the empty chart until there is money in the range; profile shows "New / No ratings yet"
  instead of a bare dash.
- **Verified:** typecheck, lint and tests (15 turbo tasks), backend 139 tests. Admin checked against a local stack
  (Firebase Auth emulator, fresh `lunchbox_ui` database, demo seed) at 1440 px light and dark and at 390 px: login,
  dashboard, orders, schools, live tracking, plans, reports. Rider app checked signed in on the emulator against the
  live server (route empty state, earnings, profile) and the stop list on a temporary preview (deleted).
- **Deployed** with `scripts/deploy-from-pc.sh`: backend healthy, the live admin serves the new design. The backend
  image was unchanged (no backend code changed), so the container kept running.
- **EAS `apk` builds** of both apps finished (parent 603241b4…, partner a785cf60…).

## 2026-11-19 (evening) — "Chalk & Turmeric" redesign of both apps (ADR-0022)

- **Design system** (`packages/ui`): chalk-green brand, turmeric accent, charcoal text on steel; Khand for titles and
  numbers, Hind for reading (both with Devanagari). Buttons with a tiffin-rim lip, a chalk pill under the active tab,
  order progress as three tiffin tiers, flat bordered cards and list groups, chalk-tray summaries, empty states drawn
  as dashed trays with the tiffin on a chalk plate. Map style, toast tints and the tiffin drawing recoloured.
- **Parent Today:** the greeting fits on one line and shows the profile photo. A new account sees a three-step setup
  (child → address → plan, or "finish the payment" while a plan awaits payment) instead of an empty box; a set-up
  account with nothing today sees a short note and a link to the calendar.
- **Other screens:** notifications grouped on cards with a turmeric edge for unread; Leave days empty state links to
  "Add child"; Plans shows a slim "no active plan" note so the plans stay in view; partner "no shift" without the grey box.
- **Fixes:** the active tab pill lost its rounded corners on Android after switching tabs (now re-created on focus).
- **Icons and splash** redrawn in the new colours for both apps (`docs/brand/*`, `apps/*/assets/*`).
- **Verified:** typecheck, lint and tests pass for `ui`, parent, partner and admin (12 turbo tasks). On the emulator
  against the live server: sign-in, Today with the setup steps, Children, Calendar, Alerts, Account, Plans, Profile,
  Payments and Addresses; order cards in assigned, on-the-way, delivered and failed states on a temporary preview
  screen (deleted). Partner sign-in and "not active" screens checked.
- **Not verified:** the partner's signed-in screens (the test rider number is not registered as a partner on the live
  server); new EAS builds with the redesign have not been made yet.

## 2026-11-19 — parent profile & photo, plans screen, address lookup, admin live tracking, logo

- **Backend:** `V12` adds `users.photo_key` and `plans.features`. `PATCH /me` edits email (normalised, unique);
  `POST /me/photo/upload-url`, `PUT /me/photo`, `DELETE /me/photo` (signed upload to Firebase Storage under
  `profiles/`, ownership and JPEG/2 MB checks, `photoUrl` in `/me`, photo deleted with the account); `POST /me/phone`
  adopts a number only from the OTP-verified token. Payments carry the Razorpay `transactionId`. New push
  `order.assigned` (en/hi). `GET /admin/tracking/partners`: riders on shift today with phone, availability
  (online/busy/offline), last location and current delivery. Tests: `ParentProfileIT`, `DeliveryFlowIT` additions.
- **Parent app:** soft school doodles behind every screen (`SchoolDoodles`, via `ScreenBackdrop`); Edit profile
  (name, email, photo from camera/gallery compressed to 600 px JPEG, remove, phone change by OTP, permission
  handling); Plans & subscriptions (current plans with renew, plans with validity and features, secure-payment note,
  payment history with transaction IDs, PDF receipts); address picker fills street/city/PIN from the pin
  (reverse geocoding, no coordinates shown). New deps: expo-image-picker, expo-image-manipulator, expo-print,
  expo-sharing, expo-splash-screen.
- **Admin:** Live tracking page (map by availability, rider details with phone, ongoing deliveries with status
  filter, live updates); pin pickers replace latitude/longitude fields on school and rider forms; plan features.
- **Brand:** LunchBox logo (tiffin mark) in `docs/brand/`; app icons, adaptive icons and splash for both apps, admin
  favicon.
- **Not built (conflicts with ADR-0019):** a call button and a rider photo for parents.
- **Verified:** 139 backend tests, 15 JS tasks (type check, lint, tests), deployed (V12 applied, health UP, admin
  `/live/` served). EAS builds started; emulator checks below.

## 2026-11-15 (night) — deployed to AWS; EAS builds of both apps

- **Server:** EC2 m7i-flex.large in **us-east-1** (move to ap-south-1 before launch), Docker Compose with Caddy:
  `https://api.18-211-99-232.sslip.io` (health UP, WebSocket upgrade OK, actuator hidden, unsigned webhooks refused)
  and `https://admin.18-211-99-232.sslip.io`. Deployed from this PC with `scripts/deploy-from-pc.sh`; nightly
  `backup.sh` cron (first dump verified). Firebase: admin domain authorized, TOTP second factor enabled.
- **Apps:** EAS `apk` profile (production package names, server URLs, reCAPTCHA sign-in); `google-services.json` and
  the Maps key are EAS secrets; the partner app now has its own EAS project. EAS signing SHA-1/256 added to Firebase.
  Verified on the emulator: the parent APK signed in (test number), registered and reached home against the server;
  the partner APK signed in and got "not registered" (no rider created yet).
- **Not verified:** admin sign-in with TOTP (owner enrols the authenticator), school/plan/rider setup on the server,
  a delivery against the server, maps in the EAS builds (Maps key restrictions), Razorpay webhook.

## 2026-11-15 (evening) — real-number sign-in works

With the Play Integrity API enabled, sign-in still failed: Play Integrity does not recognise builds installed outside
Google Play. Development and preview builds now use Firebase's reCAPTCHA check
(`EXPO_PUBLIC_FIREBASE_FORCE_RECAPTCHA`, off for Play Store builds). Verified: the owner signed in on the emulator
with a real number (SMS code), and a new parent account was registered through the local backend.

## 2026-11-15 (afternoon test) — both apps end to end on the real Firebase project

Tested on the emulator against `lunchboxappv1` and the local backend: parent sign-in (test number), registration,
consent; admin setup through `seed-local-demo.mjs --firebase` (signs in as the test admin in
`backend/config/local-test-admin.env`, git-ignored); rider sign-in (second test number), shift start, auto-assign,
route map, geofenced arrival, parent live tracking with ETA, OTP check. Bugs found and fixed:
- **Start shift never asked for location permission** (raw "Not authorized to use location services"). It now asks,
  shows a bilingual explanation and an *Open settings* button when refused for good.
- **Two route planners at once** (auto-assign + shift start) hit the one-route-per-day constraint and the rider got
  a 409. Planning now takes a per-partner, per-day Postgres advisory lock; regression test in `DeliveryFlowIT`
  (fails without the lock).
- **Route totals showed 0 km / 0 min** when OR-Tools could not serve the stops and the fallback filled them in;
  merged plans now report the fallback's totals (`RoutePlanMergeTest`).
- **Parent map markers were blank or clipped** on Android: markers froze before the map drew, and the 60 dp
  animated scooter marker was cut to a quarter. Markers now freeze after `onMapReady`, the scooter is a 44 dp plain
  marker moved by a JS ease-out glide.
- **Expired pickup codes were still shown to parents** after the school's delivery deadline; the API now answers
  `code_expired` and the app shows the message (`DeliveryFlowIT`).
Not done live: pickup and handover after the deadline (the code correctly expires at 12:15); `DeliveryFlowIT` covers
pickup → handover → delivered.

## 2026-11-15 (after midnight) — sign-in fixed; partner route map; m7i-flex.large

- **Sign-in cause found:** the Google Play Integrity API is disabled on `lunchboxappv1` (Google's API says so). The
  fingerprints on all four Android apps are correct. Until it is enabled, development builds can set
  `EXPO_PUBLIC_FIREBASE_TEST_NUMBERS_ONLY=true` so the console's test numbers sign in on an emulator (ignored in
  release builds). Verified: the parent app signed in with the test number against the real project, registered,
  gave consent and reached the home screen through the local backend.
- **Partner route map:** the route screen now shows today's stops on a map (numbered pickups, school drop, own
  position, dashed line through the remaining stops; tap a stop to open it) and **Navigate route** opens Google Maps
  turn-by-turn through the next 10 stops in order. `navigateRoute` unit-tested.
- **Server:** `m7i-flex.large` (8 GB) is the documented size; memory settings moved into `.env`.
- **Not verified:** the partner map on the emulator (needs a second test number for a rider and a weekday route).

## 2026-11-15 (late night) — photos in Firebase Storage; AWS free plan

- **Firebase Storage (ADR-0021):** `FirebaseStorageService` signs V4 upload/download URLs for the existing bucket
  `lunchboxappv1.firebasestorage.app` (asia-south2); rules stay closed. Prod uses it by default
  (`STORAGE_PROVIDER=firebase`, `STORAGE_BUCKET`); LocalStack S3 stays for local work. Protobuf pinned to 4.29.3
  (OR-Tools' 4.26 broke the Cloud Storage client).
- **Server on the AWS free plan:** EC2 `t3.small` (2 GB) with an Elastic IP and daily EBS snapshots; compose memory
  limits tuned for 2 GB + swap; the server needs no AWS keys. `aws-setup.md` rewritten.
- **Phone sign-in on the rebuilt apps** fails with `app-not-authorized … play_integrity_token`. The signing
  fingerprints match the console, so the Play Integrity API (or the reCAPTCHA fallback on the emulator) is the
  suspect; steps in `real-firebase.md`.
- **Verified:** signed upload, metadata check, signed download, delete and a refused unsigned read against the real
  bucket; compose file renders. **Not verified:** the stack on a real 2 GB server; real OTP sign-in.

## 2026-11-15 (night) — one server instead of Terraform/ECS (ADR-0020)

- **Removed:** `infra/terraform`, the Terraform CI job and the ECS/S3/CloudFront deploy.
- **Added:** `deploy/` (production compose: backend, PostGIS, Redis, RabbitMQ, Caddy with automatic HTTPS and the
  admin site; `.env.example`; nightly `backup.sh`), and a manual **Deploy** workflow (Jib → GHCR, Trivy, admin
  build, SSH roll-out with a health check). `runbooks/aws-setup.md` and `deploy.md` rewritten for one Lightsail
  server (~₹2,000–4,500/month).
- **New `off` mode** for RazorpayX and MSG91, allowed in prod: no automatic payouts (riders paid by hand), no SMS
  fallback. Fakes are still refused in prod (`IntegrationModeGuardTest`).
- **Verified:** 135 backend tests pass; `caddy validate` on the Caddyfile; both apps rebuilt against `lunchboxappv1`,
  installed on the emulator, and the parent app reaches the sign-in screen.
  **Not verified:** the Deploy workflow and the compose stack on a real server (no server yet); a real OTP sign-in.

## 2026-11-15 (evening) — calling and KYC removed; real Firebase ready; AWS guide

- **Removed (ADR-0019):** Exotel masked calling (both call buttons, endpoints, `masked_calls`) and IDfy/document KYC
  (documents, provider, bucket, partner photo). Riders now need a single operations approval
  (`POST /admin/partners/{id}/approval`, *Approve rider* in the admin). `V11` migrates existing data.
- **Fixed:** prepaid plans had no webhook backstop; `payment.captured` for an open plan order now activates it.
- **Real Firebase:** `scripts/use-auth.ps1` and `scripts/dev-backend.ps1` switch apps, admin and backend between
  the emulator and `lunchboxappv1`. The backend was started against the real project (key loaded, push live,
  separate `lunchbox_firebase` database, all 11 migrations). Phone sign-in, a test number, email sign-in, Identity
  Platform and SHA-1s are in place; admin TOTP is still off.
- **AWS:** `runbooks/aws-setup.md`, step by step, with pilot sizes.
- **Verified:** backend unit + integration tests, JS type-check/lint/tests, admin build.
  **Not verified:** a real SMS OTP on a device (needs the native apps rebuilt against the real project).

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
| 3 Dispatch & Partner app | Partner onboarding + approval (KYC removed, ADR-0019), greedy assignment, OR-Tools routing, partner app, OTP/QR pickup, geofenced photo handover, photo uploads (Firebase Storage, ADR-0021), offline queue | ✅ | ❌ |
| 4 Tracking & Notifications | STOMP relay, Redis GEO, parent live map with marker interpolation, geofencing, FCM + MSG91 fallback (masked calls removed, ADR-0019) | ✅ | ❌ |
| 5 Admin panel | Dashboard + live map, management screens, polygon editor, reports from replica, settings, audit viewer | ✅ | ❌ |
| 6 Earnings & Payouts | Append-only ledger, RazorpayX payouts + webhooks, partner earnings screens | ✅ | ❌ |
| 7 Hardening | Security mapping, k6 scripts, Grafana/Prometheus, single-server production compose (ADR-0020), runbooks, EAS config, store checklist | ✅ | ❌ |

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
7. Deploy to the single server (needs an AWS account, a domain, Firebase and Razorpay test keys — see
   `runbooks/aws-setup.md`), then run the k6 scripts (`runbooks/load-testing.md`).

## What needs your credentials or devices

| Item | Needed from you |
|---|---|
| Firebase | Projects per environment, Identity Platform with TOTP MFA, service-account JSON, `google-services.json` / `GoogleService-Info.plist` |
| Google Maps | Android, iOS and web API keys (restricted) |
| Razorpay / RazorpayX | Test-mode keys, webhook secrets, RazorpayX account number |
| MSG91 | Auth key and DLT-approved template ids for the five SMS templates |
| AWS | Free-plan account, one EC2 m7i-flex.large, a domain (photos in Firebase Storage) |
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
- **Rider checks** happen offline before an operator approves a rider (ADR-0019).

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
