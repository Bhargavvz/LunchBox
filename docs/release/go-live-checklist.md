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

Create each in **test/sandbox mode first**. Never paste keys into chat: put them in the server's `.env`, GitHub
secrets or EAS secrets as noted, and tell Claude only that they are there.

| # | What | Where it goes | Blocks |
|---|---|---|---|
| 1 | **AWS account** (ap-south-1) with a billing alert, an **EC2 m7i-flex.large** (free plan) with an Elastic IP, and a domain with `api.` and `admin.` A records; photos use the existing Firebase Storage bucket | The server's `/opt/lunchbox/.env` (see `runbooks/aws-setup.md`) | Everything server-side |
| 2 | **GitHub**: push this branch; add secrets `EXPO_TOKEN`, `NVD_API_KEY` | Repo → Settings → Secrets | CI and deploys |
| 3 | **Firebase**: a `prod` (and `staging`) project; enable Phone sign-in; upgrade to **Identity Platform** and enable TOTP MFA; register both Android apps (and iOS later); download `google-services.json` per app; create a backend service-account key | EAS file secrets (`GOOGLE_SERVICES_JSON`), server `.env` (service account), GitHub vars `FIREBASE_*` | Any real sign-in |
| 4 | **Google Maps Platform**: Android, iOS and web keys, each restricted (SHA-1 / bundle ID / admin domain) | `.env`/EAS secrets, GitHub var `GOOGLE_MAPS_WEB_KEY` | Live maps |
| 5 | **Expo / EAS** account, two projects, an access token | `EXPO_TOKEN` | App builds |
| 6 | **Razorpay** (Orders, ADR-0018) + **RazorpayX** (Payouts): KYC-approved business account, test keys, webhook secrets, plans created ⏳ | Server `.env` (RazorpayX optional: `RAZORPAYX_MODE=off` pays riders by hand) | Taking money, paying riders |
| 7 | **MSG91**: auth key + **DLT-registered** sender ID and 5 templates ⏳ (DLT approval takes days) | Server `.env` (optional: `MSG91_MODE=off`) | SMS fallback |
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
| Server | Install Docker, swap and the `deploy/` files on the server (`runbooks/aws-setup.md` step 5) | `docker compose ps` all healthy |
| Secrets | Fill `/opt/lunchbox/.env`; generate fresh `LUNCHBOX_PII_KEY` and `LUNCHBOX_QR_SIGNING_KEY` | Backend boots in the `prod` profile (it refuses fakes) |
| CI/CD | Get `ci.yml` green; run `deploy.yml` | Health check `UP` over HTTPS |
| Apps | `eas build --profile preview` for both apps against the server; internal testers install | Full flow on real phones |
| Load test | k6 scripts in `load/` against the server, outside delivery hours | p95 latency and error-rate targets in `docs/runbooks/load-testing.md` |
| Launch | Razorpay live keys, backups cron, EBS snapshot policy, photo lifecycle rule, first super admin | Smoke test, one real ₹1 plan payment, one restored backup |
| Stores | `eas build --profile production`, `eas submit` to Play **internal testing** first ⏳ | Play review |

## 4. Not done in code yet

- Mobile **iOS** builds (needs the Apple account).
- Testing on **real devices**: background location with the screen off, camera/QR, push taps, offline
  queue, Hindi. The emulator covers most of this; background location and push need a phone.
- A **security review** against `docs/security.md` and the child-safety checklist in `NEXT.md` Part 10.
- A **pilot** with one school before opening more service areas.

## Realistic timeline

- **Today:** the server on AWS and internal test builds, once items 1–5 exist.
- **This week:** payments in test mode end to end, load test, backups.
- **1–3 weeks:** Razorpay activation, MSG91 DLT approval and Play Store review are external approvals
  that set the real launch date.
