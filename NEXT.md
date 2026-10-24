# What to do next

_Written 2026-10-25, on branch `feat/close-known-gaps` (not pushed)._

**Where things stand.** Every phase (0–7) and the full UI redesign are written and committed. **Nothing has been
installed, compiled, run or tested yet**, so expect a round of compile and test fixes. Work through this file top
to bottom. Each part unblocks the next. Tick the boxes as you go.

When a command fails, paste the **full error output** to Claude and ask it to fix it. That is the fastest loop.

---

## Part 0 — Prepare your machine (once)

| Tool | Version | Check with | Needed for |
|---|---|---|---|
| Node.js | 20.18 or newer | `node -v` | everything JavaScript |
| pnpm | 9.12 (via corepack) | `pnpm -v` | the monorepo |
| JDK | 21 (Temurin recommended) | `java -version` | backend |
| Gradle | 8.x, only to create the wrapper | `gradle -v` | `gradle wrapper`, used once |
| Docker Desktop | recent | `docker compose version` | Postgres, Redis, RabbitMQ, LocalStack, Firebase emulator |
| Git | any | `git --version` | — |
| EAS CLI | latest | `eas --version` | mobile dev builds (cloud, light on RAM) |

- [ ] Install anything missing, then run `corepack enable` once.
- [ ] **RAM plan.** Run one heavy thing at a time. Rough sizes:

  | Process | RAM |
  |---|---|
  | Gradle build | 2–3 GB |
  | Docker stack | ~2 GB |
  | Backend | ~1 GB |
  | Next.js dev server | ~1–1.5 GB |
  | Expo bundler | ~1 GB |
  | Android emulator | 2–4 GB |

  Close the browser tabs and apps you don't need. Use a real phone instead of an emulator.

---

## Part 1 — See the new admin website (lightest step, no backend)

```powershell
pnpm install
pnpm --filter @lunchbox/admin exec playwright install chromium
pnpm --filter @lunchbox/admin e2e -- --ui
```

- [ ] `pnpm install` finishes. If it fails on a version, send Claude the error.
- [ ] In the Playwright window, run `login.spec.ts` and `orders.spec.ts`. They fake the backend and Firebase, so you
  can watch the sign-in page, dashboard and orders screens with sample data.
- [ ] Optionally run `pnpm dev:admin` and open http://localhost:3000/login/. The page renders, but signing in needs
  Part 4.

**Done when** both Playwright specs pass, or you have sent their failures to Claude.

---

## Part 2 — Make the backend compile (biggest risk)

```powershell
cd backend
gradle wrapper                 # creates gradlew; the wrapper JAR is not committed
./gradlew compileJava compileTestJava
```

- [ ] The compile succeeds. Expect errors first. The likely spots are:
  - MapStruct mappers (e.g. `SchoolMapper`)
  - the Hibernate 6 ID-generator API (`UuidV7Generator`)
  - the OR-Tools Java API (`OrToolsRouteOptimizer`)
  - Spring 6.2 exception-handler signatures
- [ ] Commit the generated `gradlew`, `gradlew.bat` and `gradle/wrapper/*` so CI can build.

**Done when** `compileJava compileTestJava` prints `BUILD SUCCESSFUL`.

---

## Part 3 — Backend tests and the API client

```powershell
docker compose up -d                      # from the repo root
cd backend
./gradlew test
./gradlew test --tests com.lunchbox.OpenApiSnapshotIT -DupdateSnapshot=true
cd ..
pnpm generate:api                         # writes packages/api-client/src/generated/schema.ts
pnpm typecheck
pnpm lint
pnpm test
```

- [ ] `./gradlew test` passes. The integration tests (`DeliveryFlowIT`, `SecurityIT`) start the whole app with
  Testcontainers. Any mismatch between the entities and the Flyway migrations shows up here.
- [ ] `ArchitectureTest` passes (module boundaries).
- [ ] The OpenAPI snapshot is written to `docs/api/openapi.json`. Commit it.
- [ ] `pnpm generate:api` succeeds. The JavaScript type-check **cannot pass before this**: every app imports the
  generated types.
- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` all pass. This covers the parent and partner Jest tests, the `packages/ui` tests and the api-client tests.
- [ ] `pnpm --filter @lunchbox/admin build` passes. This is the static export into `apps/admin/out`.

**Done when** everything above is green. This is the first time the project is actually verified.

---

## Part 4 — Run the whole thing locally (backend + admin)

The `local` profile replaces every third party with a sandbox fake and uses the Firebase Auth emulator, so **no real
accounts are needed for this part**. Admin two-factor is switched off locally (`require-admin-mfa: false`).

1. [ ] Start the infrastructure: `docker compose up -d`. This runs Postgres + PostGIS, Redis, RabbitMQ, LocalStack S3,
   and the Firebase emulator on ports 9099 (auth) and 4000 (UI).
2. [ ] Open http://localhost:4000 → **Authentication** → **Add user** and create, for example,
   `you@lunchbox.test` with a password.
3. [ ] Start the backend with that email as the first super admin:
   ```powershell
   $env:BOOTSTRAP_SUPER_ADMIN_EMAIL = "you@lunchbox.test"
   pnpm dev:backend
   ```
   Check http://localhost:8080/actuator/health. The API docs are at http://localhost:8080/swagger-ui.html.
4. [ ] Start the admin (`apps/admin/.env.local` comes from `.env.example`; it already points to the emulator):
   ```powershell
   Copy-Item apps/admin/.env.example apps/admin/.env.local
   pnpm dev:admin
   ```
5. [ ] Sign in at http://localhost:3000/login/ and click through every page:
   - dashboard, orders, partners, issues
   - parents, schools (draw a geofence), service areas (draw a polygon)
   - plans, payouts, reports, audit log, settings, staff
   - the ⌘K / Ctrl+K command palette
   - dark mode (user menu → Appearance)
6. [ ] Create the data the apps need: one service area, one school with its geofence, and one plan. Then create a
   partner (Partners → Create).
7. [ ] Remove `BOOTSTRAP_SUPER_ADMIN_EMAIL` after the first run.

Without a Google Maps key, the maps show a "set `NEXT_PUBLIC_GOOGLE_MAPS_KEY`" placeholder. That is expected until
Part 5.

---

## Part 5 — Accounts and keys to create (no RAM needed — do this while waiting)

Start with the first three, because the mobile apps need them. Use test or sandbox mode everywhere.

| # | Service | What to create | Where it goes |
|---|---|---|---|
| 1 | **Firebase** | A project per environment (dev / staging / prod). Enable **Phone** sign-in. Add **test phone numbers** (Authentication → Sign-in method → Phone → *Phone numbers for testing*). Upgrade to **Identity Platform** and enable **TOTP MFA** for admins. Register the Android apps (parent + partner package names from `app.config.ts`) and download `google-services.json` for each; do the same for iOS (`GoogleService-Info.plist`). Create a service-account key for the backend. | Mobile: the paths in `apps/*/.env` (`GOOGLE_SERVICES_JSON`), stored as **EAS file secrets**, never committed. Admin: `NEXT_PUBLIC_FIREBASE_*`. Backend: `GOOGLE_CLOUD_PROJECT` + service-account credentials |
| 2 | **Google Maps Platform** | API keys: Android (restricted to the app SHA-1s), iOS (bundle IDs), web (restricted to the admin domain). Enable Maps SDK for Android/iOS and Maps JavaScript API. | `GOOGLE_MAPS_ANDROID_KEY`, `GOOGLE_MAPS_IOS_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY` |
| 3 | **Expo / EAS** | An Expo account; `eas login`; create the two projects; an access token for CI. | GitHub secret `EXPO_TOKEN` |
| 4 | **Razorpay** | Test-mode key id + secret, and a webhook secret. Create the subscription plans in the dashboard. | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_MODE` |
| 5 | **RazorpayX** | Test key, account number, webhook secret. | `RAZORPAYX_*` |
| 6 | **MSG91** | Auth key and **DLT-approved** template ids for the five SMS templates. DLT approval takes days, so start early. | `MSG91_AUTH_KEY`, `MSG91_TPL_*` |
| 7 | **Exotel** | SID, API key/token and an ExoPhone caller id (for masked calls). | `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_CALLER_ID` |
| 8 | **IDfy** | Sandbox account id + API key (partner KYC). | `IDFY_ACCOUNT_ID`, `IDFY_API_KEY` |
| 9 | **AWS** | An account in ap-south-1, a Route 53 hosted zone for your domain, and permission to run Terraform. | See Part 9 |
| 10 | **Sentry** (optional) | A project per app. | `SENTRY_DSN` |
| 11 | **Google Route Optimization API** (optional, off by default) | A GCP project with the API enabled + a service account. | `ROUTING_PROVIDER`, `GOOGLE_ROUTES_*` |

Each provider has a `*_MODE` switch: `fake` or `live`. `live` calls the real API, with whatever keys you give it, test or production.

- Keep `fake` locally.
- In staging, set `live` with **test-mode keys**, one provider at a time, once its keys work.
- The MSG91 template variables are `MSG91_TPL_ORDER_PICKED_UP`, `_ORDER_DELIVERED`, `_ORDER_DELIVERY_FAILED`, `_PARTNER_ARRIVING` and `_PICKUP_FAILED`.

---

## Part 6 — Mobile apps (parent + partner)

The apps use native Firebase, so they **do not run in Expo Go**. You need a development build installed once per app.

1. [ ] Put `google-services.json` in `apps/parent` and `apps/partner` (or point the `.env` path at it), and fill in
   the Maps keys:
   ```powershell
   Copy-Item apps/parent/.env.example apps/parent/.env
   Copy-Item apps/partner/.env.example apps/partner/.env
   ```
2. [ ] Align native package versions with the installed Expo SDK:
   ```powershell
   cd apps/parent;  npx expo install --fix
   cd ../partner;   npx expo install --fix
   ```
   Commit any `package.json` changes it makes.
3. [ ] Build the development clients **in the cloud** (no local Android Studio, low RAM):
   ```powershell
   cd apps/parent;  pnpm build:dev -- --platform android
   cd ../partner;   pnpm build:dev -- --platform android
   ```
   Install each APK from the link EAS gives you.
4. [ ] Point the apps at your PC: in each `.env`, replace `10.0.2.2` (the Android-emulator alias) with your PC's LAN IP
   (`ipconfig`) when you use a real phone on the same Wi-Fi. Then start the bundler from the repo root:
   ```powershell
   pnpm dev:parent      # or: pnpm dev:partner
   ```
5. [ ] **Sign-in caveat.** Unlike the admin, the mobile apps do **not** connect to the Firebase emulator. They sign in
   against your real Firebase project, using the test phone numbers from Part 5 (no SMS is sent). The backend must
   then verify tokens from that same project, so set `GOOGLE_CLOUD_PROJECT` and **unset**
   `FIREBASE_AUTH_EMULATOR_HOST` when you test the apps. If you want emulator support in the apps too, ask Claude to
   add it.
6. [ ] Run through the real flow end to end:
   - **Parent:** register → consent → add child (school/class/section) → add address (inside a service area) →
     subscribe (fake payments are on in dev builds) → see Today's pickup code.
   - **Admin:** approve the partner's KYC → generate orders for tomorrow → auto-assign.
   - **Partner:** sign in → start shift → start route → confirm pickup (OTP or QR scan) → handover photo inside the
     school geofence.
   - **Parent:** live tracking, notifications, rate the delivery, history and invoice.
   - **Partner:** earnings; raise an issue/SOS → it appears at the top of Issues & SOS in the admin.
7. [ ] Test the device-only features on a real phone:
   - background location with the screen off
   - camera/QR scanning
   - push notifications (tap opens the right screen)
   - the offline queue: airplane mode during pickup, then reconnect
   - Hindi language
   - dark mode
8. [ ] Run the Maestro flows on the dev builds (`apps/parent/.maestro`, `apps/partner/.maestro`).
9. [ ] Repeat the builds for iOS when you have an Apple Developer account (`--platform ios`).

---

## Part 7 — Decisions only you can make

Reply to Claude with yes / no / your change for each. Claude will update the code, the tests and the ADRs.

1. [ ] **Reassign after setting off.** Should `PARTNER_EN_ROUTE → REASSIGNED` be allowed, for example after an accident before pickup?
   The brief allows reassignment only from `ASSIGNED`.
2. [ ] **Channel names.** Live-tracking topics are `/topic/orders.<id>` (the RabbitMQ convention), not `/topic/orders/<id>`. OK?
3. [ ] **What partners see.** Partners see the child's **first name and class** only. Is that enough?
4. [ ] **Refunds.** Cancelling a subscription is immediate with **no pro-rated refund**. Is that the policy?
5. [ ] **Cut-off.** Orders for day D are generated after the cut-off on D-1, by default **21:00 IST**. Leave changes close then. Is the time right?
6. [ ] **Partner pay rates.** The values in `V8__seed_settings.sql` are stand-ins. Give the real per-pickup/per-km rates, or set
   them later in Admin → Settings.
7. [ ] **Ratings window.** Parents can rate a delivery **once, up to 7 days** after it (ADR-0014). OK?
8. [ ] **Invoices.** They are simple receipts with **no GST breakdown**. Check the tax treatment with your accountant.
9. [ ] **Aadhaar.** Aadhaar checks for partners are a **manual review** (IDfy's Aadhaar flow needs an OTP from the holder). OK
   for launch?
10. [ ] **Approve the ADRs** still marked *Proposed*:
    - ADR-0013: extra libraries
    - ADR-0014: ratings
    - ADR-0015: the Tiffin colours and fonts

---

## Part 8 — Git, GitHub and CI

1. [ ] Create the GitHub repository if it doesn't exist and push the branch:
   ```powershell
   git push -u origin feat/close-known-gaps
   ```
2. [ ] Open a pull request into `main` (Claude can do this with `gh`).
3. [ ] Add GitHub secrets: `EXPO_TOKEN` and `NVD_API_KEY` (for the dependency vulnerability scan; free from nvd.nist.gov).
4. [ ] Add GitHub **variables** for deploys:
   - AWS and storage: `AWS_DEPLOY_ROLE_ARN` (comes from Part 9), `ADMIN_BUCKET`, `ADMIN_DISTRIBUTION_ID`
   - API endpoints: `API_URL`, `WS_URL`
   - Firebase: `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`
   - Maps: `GOOGLE_MAPS_WEB_KEY`
5. [ ] Get `ci.yml` green on the pull request, then merge.
6. [ ] Once coverage has been measured, turn on the ≥ 80 % domain-coverage gate (`jacocoTestCoverageVerification`) in CI.

---

## Part 9 — Deploy to staging (AWS)

Follow `docs/runbooks/deploy.md`. In short:

1. [ ] `cd infra/terraform/bootstrap && terraform init && terraform apply -var github_repository=<owner>/<repo>`.
   This creates the state bucket and the GitHub OIDC deploy role.
2. [ ] `cd infra/terraform/envs/staging`, fill in the variables (domain, hosted zone, certificates), then
   `terraform init && terraform apply`.
3. [ ] Put the secrets into **AWS Secrets Manager**:
   - provider keys: Razorpay, RazorpayX, MSG91, Exotel, IDfy, Firebase service account
   - two new random 32-byte keys: `LUNCHBOX_PII_KEY` and `LUNCHBOX_QR_SIGNING_KEY`
   - database and RabbitMQ passwords

   **Never reuse the local all-zero keys.**
4. [ ] Run `deploy.yml` for staging. Set `BOOTSTRAP_SUPER_ADMIN_EMAIL` once to create the first admin, then remove it.
5. [ ] Point the Razorpay/RazorpayX webhooks at the staging API.
6. [ ] Build the staging apps: `pnpm build:preview` in each app. They use the `staging` channel for EAS Update.
7. [ ] Load test with k6 (`docs/runbooks/load-testing.md`), using Firebase test phone numbers.
8. [ ] Check that the dashboards and alarms receive data (Grafana/Prometheus, CloudWatch, Sentry).

---

## Part 10 — Before launch

- [ ] Security review against `docs/security.md`:
  - admin MFA enforced in staging/prod
  - WAF rules
  - S3 buckets private, with pre-signed URLs only
  - audit log populated for every admin write
- [ ] Child-safety review:
  - partners never see the parent's full name, phone or the child's photo
  - masked calls work
  - handover needs the geofence + photo
- [ ] DPDP: consent capture, data export and account deletion tested end to end. Publish the privacy policy and terms.
- [ ] Production Terraform (`envs/prod`): RDS Multi-AZ + read replica, backups, alarms.
- [ ] Switch providers to `live` one at a time. Run one real ₹1 subscription and one real payout.
- [ ] Store submission: follow `docs/release/store-checklist.md`. This covers the Play Console data-safety form,
  justifying background location, screenshots (the new UI is ready for them), and the Apple review notes.
- [ ] Incident runbook (`docs/runbooks/incident-response.md`): name who is on call for SOS alerts during delivery
  hours.
- [ ] Pilot with one school and a handful of families before opening more service areas.

---

## After launch — product backlog

Interfaces for these already exist (`docs/post-mvp.md`):
- Hungarian batch matching
- DBSCAN clustering of pickups
- Kalman filter + snap-to-road for smoother tracking
- ML ETA
- demand forecasting
- anomaly detection

Other follow-ups:
- request/response contract tests against the OpenAPI spec
- a school-admin mobile view
- GST invoices
- a guided Aadhaar OTP flow

---

## What Claude can do for you right now (no RAM needed)

- Review the code for likely compile errors before you run Part 2, so that step goes faster.
- Apply your answers to Part 7.
- Add Firebase Auth emulator support to the mobile apps, so the whole flow runs locally without a real Firebase project.
- Push the branch and open the pull request (Part 8).
