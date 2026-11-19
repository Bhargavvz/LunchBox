# Google Play submission checklist

Status as of 20 November 2026. ✅ done and checked · 🔶 done, needs the owner's action or a device check · ⬜ open.

## Build and signing

| Item | Status | Evidence / what is needed |
|---|---|---|
| Target the latest required API level | ✅ | `targetSdkVersion` / `compileSdkVersion` 36 (Android 16) in both `app.config.ts`; min SDK 24 |
| Signed release bundle (AAB) | ✅ | EAS profile `playstore` (`buildType: app-bundle`, production package names, live server URLs); EAS manages the upload key |
| R8 / ProGuard | ✅ | `enableProguardInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds`; Razorpay keep rules in the parent app |
| Versioning | ✅ | `version` 1.0.0; `versionCode` auto-incremented by EAS (`appVersionSource: remote`, `autoIncrement`) |
| No debug code in release | ✅ | Fake payments, test-number sign-in and the auth emulator are off unless `__DEV__` or explicit env vars; `console.*` only in dev paths |
| Play App Signing SHA-1/SHA-256 added to Firebase | 🔶 | After the first upload, copy the **app signing** certificate fingerprints from Play Console → Setup → App integrity into Firebase (Project settings → both Android apps). Phone sign-in fails on Play-installed builds until this is done |
| Play Integrity API enabled for the Firebase project | 🔶 | Required for phone sign-in without reCAPTCHA (`EXPO_PUBLIC_FIREBASE_FORCE_RECAPTCHA=false` in `playstore`) |
| Maps key restricted to package + Play signing SHA-1 | 🔶 | Add the Play signing SHA-1 to the Android Maps key restriction |

## Permissions (minimal, each justified)

| App | Permission | Why |
|---|---|---|
| Parent | Location (while in use) | Place the home pin when adding an address ("use my location"); never in the background (blocked) |
| Parent | Camera | Take a profile photo (optional) |
| Parent | Notifications | Pickup and delivery updates |
| Rider | Location (fine, background) + foreground service (location) | Share position only while a delivery route is active; shown as an ongoing notification |
| Rider | Camera | Scan pickup QR codes and photograph the handover at the school gate |
| Rider | Notifications | New routes and changes |
| Both | Blocked | Microphone, broad photo/video/audio media access (the system photo picker needs none), storage, overlays |

- 🔶 **Background location declaration** (rider app): Play Console → App content → Location permissions. Purpose:
  "Riders share their location only during an active delivery route so parents can follow their child's lunchbox and
  operations can keep deliveries on time." Attach a short video: Start shift → Start route → the ongoing notification →
  End shift.
- 🔶 **Foreground service declaration** (Android 14+): type `location`, same purpose and video.

## Policies and content

| Item | Status | Evidence / what is needed |
|---|---|---|
| Privacy policy URL | ✅ | `https://admin.18-211-99-232.sslip.io/privacy/` (public, no sign-in). Set `NEXT_PUBLIC_SUPPORT_EMAIL` in `deploy/.env` to show a grievance address 🔶 |
| Account deletion in the app | ✅ | Parent app: Account → Delete account (erases profile, children, addresses, sign-in) |
| Account deletion web link | ✅ | `https://admin.18-211-99-232.sslip.io/delete-account/`; ops can delete on request (Parents → Delete account, super admin) |
| Data safety form | 🔶 | Answers in [data-safety.md](data-safety.md) — enter them in Play Console |
| Target audience | 🔶 | Parents and riders, 18+. The parent app is used by guardians about their children; declare it is not directed at children |
| Content rating questionnaire | 🔶 | No violence, gambling or user-generated public content; delivery photos are private |
| Ads | ✅ | No ads |
| Financial features | 🔶 | Parent app takes payments through Razorpay (no lending, no wallets) |

## Store listing assets

| Item | Status | Evidence / what is needed |
|---|---|---|
| App icon 512×512 | ✅ | `docs/brand/` (tiffin mark, recoloured for Chalk & Turmeric) |
| Feature graphic 1024×500 | ✅ | `docs/brand/feature-graphic-parent.png`, `docs/brand/feature-graphic-partner.png` |
| Phone screenshots (2–8) | 🔶 | Take them from the `playstore` build on a phone (Today, Calendar, live tracking, Plans; rider route and stop) |
| Short and full description | ✅ | `docs/release/listing.md` |

## Quality

| Item | Status | Evidence / what is needed |
|---|---|---|
| Automated tests | ✅ | Backend 180+ tests (unit, integration with Postgres/Redis/RabbitMQ), apps and packages Jest suites; see `docs/reports/test-report-2026-11.md` |
| Crash-free on emulator | 🔶 | APKs from this release installed and opened on the Android 16 emulator; real-device runs on 2–3 phones (Android 11, 13, 15) still to do |
| Screen sizes | 🔶 | Layouts checked at 360–412 dp widths on the emulator; tablets are not supported (`supportsTablet: false`) |
| Crash reporting | ⬜ | Sentry DSN not set for production builds yet |
| Hindi review by a native speaker | ⬜ | Strings are complete for every new screen |
