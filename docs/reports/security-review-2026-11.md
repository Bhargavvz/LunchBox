# Security review — 20 November 2026

Scope: backend API, parent and rider apps, admin panel, server configuration. Baseline in `docs/security.md`
(OWASP ASVS L2). This review checks OWASP Top 10 (2021) and OWASP Mobile Top 10 (2024) against the code, including
everything added in this round.

## OWASP Top 10

| Risk | Status | Notes |
|---|---|---|
| A01 Broken access control | ✅ | Every endpoint has `@PreAuthorize`; parents' lookups filter by their own parent id and answer 404 for others' ids (new: calendar, quote, schedule, renew). Riders can decline only their own, not-yet-started orders. Admin writes need OPS/SUPER; plans, coupons, settings, demo data and account erasure need SUPER. `SecurityIT` and `AdminDataIT` cover role refusals |
| A02 Cryptographic failures | ✅ | HTTPS only (Caddy, HSTS); pickup OTPs encrypted at rest (`PiiCipher`); QR tokens HMAC-signed; photos in a private bucket via short-lived signed URLs; no secrets in the repo (env and EAS secrets) |
| A03 Injection | ✅ | JPA criteria / bound parameters everywhere, including the new log search and payment search; demo-data SQL uses bound parameters and fixed table names; CSV exports neutralise formula prefixes (`= + - @`) |
| A04 Insecure design | ✅ | Money in paise; coupon discounts priced into the Razorpay order and checked again on the webhook; one coupon per family; one trial per family; allocation never overwrites a concurrent change |
| A05 Security misconfiguration | ✅ | Actuator hidden behind Caddy; CSP, X-Frame-Options DENY, Referrer-Policy on the admin; unsigned webhooks refused (now also logged as a warning) |
| A06 Vulnerable components | 🔶 | Dependencies pinned; no automated audit in CI yet (add `pnpm audit` / OWASP dependency-check) |
| A07 Identification and authentication | ✅ | Firebase ID token on every request and STOMP CONNECT; staff need TOTP; new client-side OTP limits on top of Firebase's quotas |
| A08 Software and data integrity | ✅ | Razorpay webhook HMAC; idempotency keys on money and order creation; append-only order history and audit log (database triggers) |
| A09 Logging and monitoring | ✅ | Rebuilt log: who (name, role), what (plain summary), when, from where (IP, device), before/after, severity; system events for allocation, failures, no-shows, rejected webhooks |
| A10 SSRF | ✅ | The only outbound calls go to fixed provider hosts (Razorpay, Google, MSG91, Firebase) |

## OWASP Mobile Top 10

| Risk | Status | Notes |
|---|---|---|
| M1 Improper credential usage | ✅ | No API secrets in the apps; Firebase sessions in the SDK; app config only holds public keys (Maps key restricted to package + SHA-1 🔶 add Play signing SHA-1) |
| M2 Supply chain | 🔶 | Pinned versions; review new native modules before upgrades |
| M3 Insecure authentication/authorisation | ✅ | Server enforces everything; the apps hold no privileges |
| M4 Insufficient input/output validation | ✅ | Zod on forms, Jakarta Validation on every request body |
| M5 Insecure communication | ✅ | HTTPS/WSS only in release builds |
| M6 Inadequate privacy controls | ✅ | Riders never see phone numbers; parents see the rider's position only while their box is on the way and with consent; plans can turn live tracking off; data export and deletion in the app |
| M7 Insufficient binary protections | ✅ | R8 shrinking and obfuscation on release builds |
| M8 Security misconfiguration | ✅ | Background location, microphone, broad media access and overlays blocked where not needed; no debug flags in release |
| M9 Insecure data storage | ✅ | Tokens in the Firebase SDK / SecureStore; the offline action queue holds no secrets |
| M10 Insufficient cryptography | ✅ | Platform TLS; no custom crypto in the apps |

## Findings fixed in this round

1. **Coupon guessing** — a parent could try codes without limit. Fixed: 10 checks per 10 minutes per parent
   (`RateLimitPolicy.COUPON_CHECK`), tested.
2. **OTP abuse in the app** — unlimited resends and attempts in the UI. Fixed: growing cooldowns, 5 codes per 30 min,
   5 wrong codes, 10-minute expiry (Firebase's own quotas still apply).
3. **Account deletion requests outside the app** had no handling path. Fixed: super-admin erasure with the same
   cascade, audited, staff accounts refused.
4. **Photo permissions** — the parent app asked for media library access it does not need on Android. Fixed: the system
   photo picker without permission; broad media permissions blocked.

## Open items

- Add dependency scanning to CI (A06, M2).
- Set `NEXT_PUBLIC_SUPPORT_EMAIL` so the privacy page names a grievance contact (DPDP).
- Move the server to `ap-south-1` before launch (documented in ADR-0020).
- Firestore/Storage rules stay closed (photos only through signed URLs) — no client SDK access to review.
