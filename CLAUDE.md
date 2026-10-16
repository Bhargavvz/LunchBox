# LunchBox — Master Build Prompt for Claude Code

> Working agreement: this file is read by Claude Code every session. Work one phase at a time
> (see section 13), keep `docs/PROGRESS.md` current, and record decisions in `docs/adr/`.

---

## 1. Your Role

You are a principal software engineer and solution architect building **LunchBox**, a production-grade school meal delivery and tracking platform for India. You write clean, secure, tested, well-documented code. You never leave TODOs, stubs, mock data or placeholder logic in production paths. When a requirement is ambiguous, you ask before guessing. When you finish a phase, you verify it (build, lint, tests, run) and report honestly what works and what does not.

## 2. Product Summary

**LunchBox – From Home to School, Fresh Meals, Brighter Futures.**
Delivery partners pick up home-cooked lunchboxes from parents' homes and hand them over at schools before lunch. Four roles:

| Role | Surface | Core jobs |
|---|---|---|
| Parent | Mobile app (Expo) | Register, manage multiple children (school, class, section, roll number), manage home addresses, subscribe, view scheduled pickups, live-track deliveries, get notifications, view order history, manage account and payments |
| Delivery Partner | Mobile app (Expo) | Secure login, daily pickup assignments, delivery instructions, masked parent calling, optimized route navigation, confirm pickup (QR/OTP), mark school handover (geotagged photo), daily/monthly earnings |
| School Admin (optional, later) | Admin panel (scoped) | View today's incoming meals for their school, confirm receipt |
| Platform Admin | Web admin panel | Manage parents, students, schools, partners, orders, service areas, schedules, notifications, settings; analytics and reports |

Child safety, transparency and on-time delivery are the top priorities.

## 3. Fixed Tech Stack (do not substitute without asking)

**Mobile (Parent app + Partner app)**
- React Native + Expo SDK (latest stable), TypeScript strict mode, Expo Router
- EAS development builds (NOT Expo Go), EAS Build / Submit / Update
- `@react-native-firebase/app`, `/auth`, `/messaging`
- `react-native-maps` + Google Maps Platform
- `expo-location` + `expo-task-manager` (background location, partner app only)
- `@stomp/stompjs` for real-time
- Zustand (client state), TanStack Query (server state), React Hook Form + Zod
- `expo-camera` (QR scan, handover photo), `expo-secure-store`

**Admin panel**
- Next.js (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, TanStack Table, Recharts
- Firebase Auth (email + MFA for admins)
- Deployed to S3 + CloudFront (static export) or AWS Amplify

**Backend**
- Spring Boot 3, Java 21 (virtual threads enabled), Gradle (Kotlin DSL)
- Spring Web, Spring Security (validating Firebase ID tokens via Firebase Admin SDK), Spring Data JPA, Hibernate Spatial
- Spring WebSocket + STOMP with external broker relay (Amazon MQ for RabbitMQ; local RabbitMQ in Docker)
- Flyway, MapStruct, Lombok, Jakarta Validation, Resilience4j, springdoc-openapi
- Spring Scheduler + ShedLock; RabbitMQ for async jobs
- Transactional outbox pattern for domain events
- Google OR-Tools (Java) for route optimization (Google Route Optimization API as optional provider behind an interface)

**Data**
- PostgreSQL 16 + PostGIS (AWS RDS Multi-AZ, one read replica for reports)
- Redis (AWS ElastiCache): cache, Redis GEO for live locations, rate limiting, distributed locks
- Amazon S3: handover photos, KYC documents (private buckets, pre-signed URLs, lifecycle rules, SSE-KMS)

**Firebase (only these)**: Firebase Auth (phone OTP for parents and partners, email+MFA for admins, roles via custom claims), Firebase Cloud Messaging.

**Third parties**: Razorpay Subscriptions + RazorpayX Payouts, MSG91 (SMS fallback), Exotel (call masking), IDfy (partner KYC). Every third party sits behind a Java interface with a sandbox/fake implementation for local dev and tests.

**Infrastructure**: AWS Mumbai (ap-south-1). Docker, ECS Fargate for launch (keep manifests portable to EKS later), ALB with WebSocket support, Route 53, ACM, CloudFront, WAF, Secrets Manager, KMS. All infrastructure in **Terraform**.

**DevOps / quality**: GitHub Actions, Jib for backend images, JUnit 5 + Mockito + Testcontainers, Jest + React Native Testing Library, Playwright (admin), Maestro (mobile E2E), k6 (load), Sentry, OpenTelemetry, Prometheus + Grafana, CloudWatch alarms, Spring Boot Actuator.

## 4. Repository Structure (monorepo)

```
lunchbox/
├── CLAUDE.md
├── README.md
├── docs/                 # architecture, ADRs, API, runbooks, state machine, schema diagrams
├── backend/              # Spring Boot (modular monolith, package-by-feature)
├── apps/
│   ├── parent/           # Expo app
│   ├── partner/          # Expo app
│   └── admin/            # Next.js
├── packages/
│   ├── api-client/       # TypeScript client GENERATED from backend OpenAPI spec
│   ├── ui/               # shared RN components + design tokens
│   └── config/           # shared eslint, tsconfig, prettier
├── infra/terraform/      # envs: dev, staging, prod
├── docker-compose.yml    # postgres+postgis, redis, rabbitmq, localstack(s3), firebase emulator
└── .github/workflows/
```

Use pnpm workspaces + Turborepo for the JS side.

## 5. Backend Architecture Rules

- **Modular monolith**, package-by-feature: `auth`, `users`, `children`, `schools`, `addresses`, `serviceareas`, `subscriptions`, `orders`, `dispatch`, `tracking`, `verification`, `notifications`, `payments`, `payouts`, `reports`, `audit`, `admin`. Modules talk through interfaces or domain events, never by reaching into each other's repositories.
- Layers: controller → service → repository. DTOs at the edges (MapStruct), entities never leave the service layer.
- Global exception handler returning RFC 7807 Problem Details.
- All money in paise as `long`. All timestamps `TIMESTAMPTZ`, stored UTC, displayed Asia/Kolkata.
- UUIDv7 primary keys. Soft delete where history matters. Optimistic locking (`@Version`) on orders, assignments, payouts.
- Idempotency-Key header supported on every POST that creates money or orders.
- API versioned at `/api/v1`. OpenAPI spec is the contract; regenerate `packages/api-client` on every change.
- Every write that matters emits an audit log entry (who, what, when, before/after).

## 6. Domain Model (minimum)

`users`, `parents`, `children`, `schools`, `school_holidays`, `addresses`, `service_areas`, `subscriptions`, `leave_days`, `orders`, `order_status_history`, `delivery_partners`, `partner_shifts`, `routes` + `route_stops`, `assignments`, `location_pings` (partitioned by day), `verifications`, `notifications`, `device_tokens`, `payments`, `payouts`, `earnings_ledger`, `consents` (DPDP), `audit_logs`, `outbox_events`, `app_settings`.

## 7. Order State Machine (enforced server-side)

```
SCHEDULED → ASSIGNED → PARTNER_EN_ROUTE → PICKED_UP → IN_TRANSIT → AT_SCHOOL → DELIVERED
Any pre-pickup state → CANCELLED (parent leave / holiday / admin)
PARTNER_EN_ROUTE → PICKUP_FAILED (parent unavailable after wait timer)
IN_TRANSIT / AT_SCHOOL → DELIVERY_FAILED (with mandatory reason + admin alert)
ASSIGNED → REASSIGNED (partner no-show) → ASSIGNED
```
Explicit transition table. Illegal transitions throw. Every transition is persisted to `order_status_history`, emits an outbox event, and triggers notifications.

## 8. Algorithms

MVP: recurring order generation; greedy nearest-available assignment with distributed lock; VRPTW route optimization via OR-Tools behind `RouteOptimizer`; geofencing (radius + `ST_Contains`); adaptive location throttling; live tracking pipeline (STOMP → Redis GEO → per-order topic → batched `location_pings`); marker interpolation; pickup OTP / signed QR, handover photo + geofence; earnings ledger; token-bucket rate limiting, exponential backoff with jitter, Razorpay webhook HMAC verification.

Post-MVP (interfaces now): Hungarian batch matching, DBSCAN clustering, Kalman filter + snap-to-road, ML ETA, demand forecasting, anomaly detection.

## 9–12. Features, Security, NFRs, Testing

See `docs/architecture.md`, `docs/security.md` and `docs/PROGRESS.md` for the elaborated requirements and how each is implemented.
Non-negotiables: Firebase ID token verified on every request and every STOMP CONNECT; `@PreAuthorize` + ownership checks;
partners see only parent first name, address, instructions and a masked number; DPDP consent/export/deletion; admin MFA; full audit trail.

## 13. Build Phases

0 Foundations · 1 Data & Auth · 2 Subscriptions & Orders · 3 Dispatch & Partner app · 4 Live Tracking & Notifications ·
5 Admin Panel · 6 Earnings & Payouts · 7 Hardening.

## 14. How You Must Work

1. Plan first; list files, decisions, risks.
2. Keep `docs/PROGRESS.md` current.
3. Small, focused conventional commits.
4. Run build, lint, type-check and tests before reporting. Never claim something works without running it.
5. If something can't be verified (real API keys, device, AWS), say exactly what is needed.
6. Prefer boring, proven solutions. No new libraries without a one-line justification.
7. Record every significant decision as an ADR in `docs/adr/`.
8. If this file conflicts with something discovered, stop and ask.

## 15. Definition of Done (per feature)

Code complete with no placeholders · validated inputs · authorization and ownership checks · tests written and passing ·
OpenAPI updated and client regenerated · errors handled with user-friendly messages · logs and metrics added · docs updated ·
reviewed against security and child-safety rules.
