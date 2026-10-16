# Progress

_Last updated: 2026-10-16_

## Status: code written for all phases (0–7), **not yet compiled, run or tested**

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

- **Coverage**: unit tests exist for the state machine, QR tokens, OTP verification, routing optimisers, crypto/geo
  utilities, throttle and format helpers, plus the end-to-end `DeliveryFlowIT`. The ≥ 80 % domain-coverage gate
  (`jacocoTestCoverageVerification`) is configured but not enforced in CI yet; add service tests for assignment,
  subscriptions webhooks, payouts and leave/cut-off rules, then enable it.
- **Contract tests**: `OpenApiSnapshotIT` guards drift; request/response validation against the spec is not yet
  added.
- **Partner ratings**: `PartnerService.recordRating` exists but there is no parent endpoint/UI to rate a delivery.
- **Push deep links**: tapping a push opens the app but does not navigate to the order yet.
- **Module boundary tests** (ArchUnit) are not written.
- **Child photo** (optional in the brief) is not implemented — partners never see children's photos by design.
- **Google Route Optimization API** provider is designed (`RouteOptimizer`) but not implemented.
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
