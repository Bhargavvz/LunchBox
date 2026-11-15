# Go-live checklist

_Written 2026-11-15; updated the same day. Done so far: Firebase project `lunchboxappv1` with all four Android
apps and a web app (configs installed locally, see `docs/runbooks/real-firebase.md`); Google Maps key; Razorpay
test keys (valid; Subscriptions is not enabled on the account, so billing is prepaid through Orders, ADR-0018);
Firebase service-account key (on the owner's PC); both apps built and running on the Android emulator. AWS is
deferred._

_Where things stand: the backend, admin and both apps build, pass their tests and run end to end
locally against sandbox fakes. Nothing is deployed yet._

Production needs three kinds of things: **accounts and keys only the owner can create**, **decisions only the owner
can make**, and **work Claude does once those exist**. Some steps take days no matter how fast we work (marked ⏳).

## 1. Accounts and keys (owner)

Create each in **test/sandbox mode first**. Never paste keys into chat: put them in AWS Secrets Manager, GitHub
secrets or EAS secrets as noted, and tell Claude only that they are there.

| # | What | Where it goes | Blocks |
|---|---|---|---|
| 1 | **AWS account** (ap-south-1) with billing alerts, an admin IAM user for Terraform, and a domain in **Route 53** (e.g. `lunchbox.in`) | Local `aws configure`, then Terraform | Everything server-side |
| 2 | **GitHub**: push this branch; add secrets `EXPO_TOKEN`, `NVD_API_KEY` | Repo → Settings → Secrets | CI and deploys |
| 3 | **Firebase**: a `prod` (and `staging`) project; enable Phone sign-in; upgrade to **Identity Platform** and enable TOTP MFA; register both Android apps (and iOS later); download `google-services.json` per app; create a backend service-account key | EAS file secrets (`GOOGLE_SERVICES_JSON`), Secrets Manager (service account), GitHub vars `FIREBASE_*` | Any real sign-in |
| 4 | **Google Maps Platform**: Android, iOS and web keys, each restricted (SHA-1 / bundle ID / admin domain) | `.env`/EAS secrets, GitHub var `GOOGLE_MAPS_WEB_KEY` | Live maps |
| 5 | **Expo / EAS** account, two projects, an access token | `EXPO_TOKEN` | App builds |
| 6 | **Razorpay** (Subscriptions) + **RazorpayX** (Payouts): KYC-approved business account, test keys, webhook secrets, plans created ⏳ | Secrets Manager | Taking money, paying riders |
| 7 | **MSG91**: auth key + **DLT-registered** sender ID and 5 templates ⏳ (DLT approval takes days) | Secrets Manager | SMS fallback |
| 8 | **Exotel**: SID, API key/token, an ExoPhone ⏳ (KYC) | Secrets Manager | Masked calls |
| 9 | **IDfy**: account ID + API key | Secrets Manager | Rider KYC checks |
| 10 | **Google Play Console** ($25, identity verification ⏳) and, later, **Apple Developer** ($99/yr) | EAS Submit | Store releases |
| 11 | **Sentry** project per app (optional, recommended) | `SENTRY_DSN` | Crash reports |
| 12 | Public **privacy policy and terms** pages (DPDP), a support email and phone | Store listings, app links | Store approval |

## 2. Decisions (owner)

Reply yes / no / your change for each; Claude updates code, tests and ADRs.

1. Approve ADR-0016 (Ink & Mango palette and fonts) and ADR-0017 (box marks).
2. The open questions in `NEXT.md` Part 7: reassignment after setting off, partner visibility, refunds, the 21:00
   cut-off, **real per-pickup / per-km rider pay rates**, ratings window, GST on invoices, manual Aadhaar review.
3. Plan prices (₹ per month / quarter) and which schools and service area to pilot with.
4. Production sizing: start small (`db.t4g.medium`, 2 backend tasks) and scale, or size for launch traffic now.

## 3. Work Claude does once 1 and 2 exist

| Step | What happens | Verified by |
|---|---|---|
| Staging infra | `terraform apply` for bootstrap and `envs/staging` (VPC, RDS + PostGIS, ElastiCache, Amazon MQ, ECS, ALB, CloudFront, WAF) | `terraform plan` clean; health check `UP` |
| Secrets | Wire every key into Secrets Manager; generate fresh `LUNCHBOX_PII_KEY` and `LUNCHBOX_QR_SIGNING_KEY` | Backend boots with `*_MODE=live` one provider at a time |
| CI/CD | Get `ci.yml` green; run `deploy.yml` for staging | Green pipeline |
| Apps | `eas build --profile preview` for both apps against staging; internal testers install | Full flow on real phones |
| Load test | k6 scripts in `load/` against staging | p95 latency and error-rate targets in `docs/runbooks/load-testing.md` |
| Prod | Same Terraform for `envs/prod` (Multi-AZ, read replica, backups, alarms); deploy; first super admin | Smoke test, one real ₹1 subscription and one ₹1 payout |
| Stores | `eas build --profile production`, `eas submit` to Play **internal testing** first ⏳ | Play review |

## 4. Not done in code yet

- Mobile **iOS** builds (needs the Apple account).
- Testing on **real devices**: background location with the screen off, camera/QR, push taps, offline
  queue, Hindi. The emulator covers most of this; background location and push need a phone.
- A **security review** against `docs/security.md` and the child-safety checklist in `NEXT.md` Part 10.
- A **pilot** with one school before opening more service areas.

## Realistic timeline

- **Today:** staging on AWS and internal test builds, once items 1–5 exist.
- **This week:** live payments and SMS in test mode, load test, production infra.
- **1–3 weeks:** Razorpay activation, MSG91 DLT approval, Exotel KYC and Play Store review are external approvals
  that set the real launch date.
