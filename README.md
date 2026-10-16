# LunchBox

**From Home to School, Fresh Meals, Brighter Futures.**

LunchBox picks up home-cooked lunchboxes from parents' homes and hands them over at schools before lunch, with
live tracking, verified pickups (OTP / signed QR) and geofenced photo handovers.

| Surface | Path | Stack |
|---|---|---|
| Backend API | `backend/` | Spring Boot 3.5, Java 21 (virtual threads), PostgreSQL 16 + PostGIS, Redis, RabbitMQ (STOMP relay) |
| Parent app | `apps/parent/` | Expo SDK 54, Expo Router, TanStack Query, Zustand, react-native-maps |
| Partner app | `apps/partner/` | Expo SDK 54, background location, offline action queue, expo-camera |
| Admin console | `apps/admin/` | Next.js 15 (static export), Tailwind, shadcn/ui, TanStack Table, Recharts |
| API client | `packages/api-client/` | Generated from the backend OpenAPI spec (`openapi-typescript` + `openapi-fetch`) |
| Shared UI | `packages/ui/` | React Native components + design tokens |
| Infrastructure | `infra/terraform/` | AWS ap-south-1: ECS Fargate, RDS, ElastiCache, Amazon MQ, S3, CloudFront, WAF |

Read [`docs/architecture.md`](docs/architecture.md) first, then [`docs/PROGRESS.md`](docs/PROGRESS.md) for what is
done and what still needs verification.

## Prerequisites

- Docker Desktop (Compose v2)
- JDK 21 and Gradle 8.10+ (`gradle wrapper` creates `./gradlew`; the wrapper JAR is not committed)
- Node 20.18+ and pnpm 9 (`corepack enable`)
- For mobile: Android Studio / Xcode and an [EAS](https://expo.dev) account — the apps use native modules
  (Firebase, maps, background location), so they run in **development builds, not Expo Go**

## Local setup (one command per step)

```bash
pnpm install                  # JS workspaces
pnpm dev:infra                # Postgres+PostGIS, Redis, RabbitMQ+STOMP, LocalStack S3, Firebase Auth emulator
cd backend && gradle wrapper && cd ..
pnpm dev:backend              # Spring Boot on :8080 with the `local` profile (all third parties are fakes)
pnpm generate:api             # regenerate packages/api-client from http://localhost:8080/v3/api-docs
pnpm dev:admin                # admin console on :3000
```

Swagger UI: http://localhost:8080/swagger-ui.html · RabbitMQ: http://localhost:15672 (lunchbox/lunchbox) ·
Firebase emulator UI: http://localhost:4000.

**First admin user:** set `BOOTSTRAP_SUPER_ADMIN_EMAIL=you@example.com` for the backend, create the same email in the
Firebase Auth emulator UI, then sign in to the admin console. Locally `require-admin-mfa` is off; in staging/prod
staff are taken through TOTP enrolment on first sign-in.

**Mobile development builds:**

```bash
cd apps/parent
cp .env.example .env          # set Google Maps keys; Firebase config files come from your Firebase project
eas build --profile development --platform android
pnpm start                    # Metro for the dev client
```

The parent app has `EXPO_PUBLIC_FAKE_PAYMENTS=true` in the development profile, which completes subscriptions
through the backend's local-only payment simulator instead of Razorpay checkout.

## Tests

```bash
cd backend && ./gradlew test                  # unit + Testcontainers integration tests (needs Docker)
pnpm test                                     # Jest (api-client, ui, parent, partner)
pnpm --filter @lunchbox/admin e2e             # Playwright (API and Firebase mocked at the network layer)
maestro test apps/parent/.maestro             # mobile E2E on a device/emulator with a dev build
k6 run load/orders-api.js                     # load tests (see docs/runbooks/load-testing.md)
```

## Keeping the API contract in sync

The OpenAPI document is the contract. After changing a controller or DTO:

```bash
cd backend && ./gradlew test --tests com.lunchbox.OpenApiSnapshotIT -DupdateSnapshot=true
cd .. && OPENAPI_SOURCE=docs/api/openapi.json pnpm generate:api && pnpm typecheck
```

CI fails if `docs/api/openapi.json` is stale.

## Deployment

Terraform lives in `infra/terraform` (`bootstrap/` once per account, then `envs/<env>`). GitHub Actions builds the
backend image with Jib, scans it with Trivy, rolls it out to ECS, and publishes the admin static site to S3 +
CloudFront. See [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md).
