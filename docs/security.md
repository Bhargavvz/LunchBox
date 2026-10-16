# Security, privacy and child safety

Baseline: OWASP ASVS Level 2. This document maps each requirement to its implementation.

## Authentication

| Actor | Method | Enforcement |
|---|---|---|
| Parent, partner | Firebase phone OTP | `Authenticator` verifies the ID token on every request (`FirebaseAuthenticationFilter`) and STOMP CONNECT (`StompAuthInterceptor`) |
| Partner first sign-in | Phone must match a pre-provisioned, **KYC-approved** partner | `RegistrationService.me` + `PartnerService.checkMayActivate` |
| Staff | Firebase email/password + **TOTP second factor** | `Authenticator.enforceStaffSession`: rejects tokens without `sign_in_second_factor` and sessions older than 12 h; admin UI also signs out after 30 min idle |

Suspension takes effect within 30 s (principal cache TTL) and refresh tokens are revoked.

## Authorisation and ownership

- `@PreAuthorize` with role expressions (`Roles`), plus a URL rule that blocks unregistered users from all of
  `/api/v1/**` except `/api/v1/auth/**`.
- Ownership in services: parents resolve `parentId` from their user id and every lookup filters by it
  (`requireOwned`, `requireOwnedByParent`), returning 404 rather than 403 so ids cannot be probed.
- Partners: `requireOwnOrderToday` — the order must be assigned to them **and** scheduled today.
- School admins: only their `school_id`.
- STOMP: subscriptions to `/topic/orders.{id}` require order ownership **and** live-tracking consent;
  `/topic/admin.*` is staff-only; only partners may send locations.

## Data minimisation for partners (child safety)

`PickupStopDetails` exposes only: parent first name, masked phone (`+91 98XXXXXX10`), address, landmark,
instructions, child first name and class. No email, full phone, surname, roll number or allergy notes. Calls go
through Exotel masking (`MaskedCallService`), only on the delivery day while the order is live, rate-limited.

## Verification

- Pickup: 6-digit OTP (encrypted at rest, 5 attempts then lock-out, attempts persisted in their own transaction) or
  a signed QR `LB1.<order>.<exp>.<nonce>.<HMAC-SHA256>` with a 120 s TTL.
- Handover: photo uploaded straight to a private bucket via pre-signed PUT; the server checks the object exists, its
  size, that the key belongs to this partner and day, and that GPS is inside the school polygon (or radius).
  Out-of-geofence attempts are recorded and alerted as anomalies.

## Data protection

| Control | Implementation |
|---|---|
| TLS everywhere | ALB TLS 1.2/1.3 policy, HSTS; RDS `rds.force_ssl`; Redis in-transit encryption; AMQPS/STOMP-TLS to Amazon MQ |
| Encryption at rest | KMS CMK for RDS, Redis, MQ, S3 (SSE-KMS, bucket keys), Secrets Manager |
| Application-level PII encryption | AES-256-GCM (`PiiCipher`) for address lines/instructions, allergy notes, bank account numbers, KYC document numbers, OTPs |
| Private objects | S3 public-access block, deny non-TLS, short-lived pre-signed URLs (5 min) |
| Secrets | Secrets Manager → ECS task secrets; EAS secrets for mobile; GitHub OIDC for deploys (no static keys) |
| Input validation | Jakarta Validation on every DTO and parameter; RFC 7807 errors that never leak internals |
| Abuse controls | Redis token buckets (auth/public/per-user/pickup-verify/calls/location); WAF managed rules + rate rule |
| Webhooks | Razorpay/RazorpayX HMAC-SHA256 over the raw body, constant-time compare, de-duplicated inbox |
| Idempotency | `Idempotency-Key` on money/order-creating POSTs and partner actions |
| Audit | `audit_logs` (append-only trigger), who/what/when/IP/request id/before/after without raw PII |

## DPDP Act 2023

| Obligation | Implementation |
|---|---|
| Notice & consent | `consents` table, versioned (`policyVersion`), purpose-specific: `ACCOUNT_AND_SERVICE`, `CHILD_DATA_PROCESSING`, `LIVE_TRACKING`, `MARKETING` |
| Verifiable parental consent | Children cannot be added until `CHILD_DATA_PROCESSING` is granted by the OTP-verified parent account |
| Withdrawal | `POST /api/v1/me/consents` with `granted=false`; live tracking stops immediately (STOMP subscription refused, snapshot hides location) |
| Right to access | `GET /api/v1/me/export` aggregates every module's `PersonalDataContributor` |
| Right to erasure | `DELETE /api/v1/me`: cancels subscriptions, anonymises parent/children/addresses, deletes notifications and device tokens, deletes the Firebase user; payment records retained (statutory) |
| Purpose limitation / retention | <a id="retention"></a>Location pings: 90 days (partition drop). Handover photos: 90 days (S3 lifecycle). Notifications: 180 days. OTP ciphertext scrubbed after 2 days. Webhook inbox: 400 days. Audit logs: 3 years |

## Supply chain

CI runs OWASP Dependency-Check (fails on CVSS ≥ 7), `pnpm audit`, Trivy (filesystem, IaC, secrets, and the built
image), with results uploaded to GitHub code scanning. ECR scans on push and tags are immutable.
