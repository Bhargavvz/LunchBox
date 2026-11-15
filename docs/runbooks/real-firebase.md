# Real phone OTP: switching from the Firebase emulator to the real project (`lunchboxappv1`)

Local development signs in through the Firebase Auth emulator (`demo-lunchbox`, codes from
`docker compose logs firebase`). Two scripts switch everything to the real project, where OTPs arrive by SMS (or
instantly for the test numbers set in the console) and push notifications are real.

## State of the Firebase project (checked 2026-11-15)
| Setting | State |
|---|---|
| Phone sign-in | **On**, 1 test number configured |
| Email/Password sign-in (staff) | **On** |
| Identity Platform | **Upgraded** |
| Admin TOTP two-factor | **Off**: turn on before staging/production (Authentication → Settings → Multi-factor → TOTP) |
| SHA-1 on all four Android apps | **Added** (debug key `5E:8F:16:06…`) |
| Authorized domains | `localhost` and the firebaseapp/web.app domains; add the admin domain when it exists |

Recommended, also in Project settings → Your apps: add the debug **SHA-256**
`FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C` to each app, and enable
the **Play Integrity API** in Google Cloud for the project. Phone sign-in then verifies the app silently on real
phones; without it Firebase shows a short reCAPTCHA page first (the emulator always shows it).
For EAS and Play Store builds, add the SHA-1/SHA-256 shown by `eas credentials` and the Play Console *App signing
key* respectively.

## Keep the service-account key safe
Move the key out of Downloads into a folder only you use, e.g. `C:\Users\<you>\.secrets\lunchbox-firebase-admin.json`.
Never commit it or paste it anywhere. The backend reads it to verify sign-ins, set roles and send push notifications.

## Switch (PowerShell, from the repository root)
```powershell
./scripts/use-auth.ps1 -Target firebase      # apps and admin point at the real project
./scripts/dev-backend.ps1 -Auth firebase     # backend: real token checks, live push, database "lunchbox_firebase"
```
Then rebuild each native app once (the Firebase config is compiled in):
```powershell
cd apps/parent;  npx expo prebuild --platform android --no-install
```
and install it as in `android-emulator.md` (same for `apps/partner`).

- Real mode uses its own local database, because accounts created through the emulator are tied to emulator user
  ids. Run `node scripts/seed-local-demo.mjs` only against the emulator; in real mode create the school, plan and
  rider in the admin.
- First admin: pass `-BootstrapAdminEmail you@example.com` to `dev-backend.ps1` once, add that email under
  Authentication → Users → Add user, then sign in at http://localhost:3000/login/. `require-admin-mfa` is off in the
  `local` profile; staging and production enforce it.
- Riders: create them in the admin with their real phone number and press **Approve rider**; they can then sign in.

## If sign-in says `[auth/app-not-authorized] … Invalid app info in play_integrity_token`
The debug APKs are signed with SHA-1 `5E:8F:16:06…` / SHA-256 `FA:C6:17:45…` (checked with `apksigner`), and both are
registered, so this comes from app verification, not the fingerprints:
1. Google Cloud console → project **lunchboxappv1** → APIs & Services → Library → **Google Play Integrity API** →
   **Enable**. Wait a few minutes.
2. Make sure the SHA-256 is on the app with the package the build uses: `in.lunchbox.parent.development` and
   `in.lunchbox.partner.development` for development builds (not only `in.lunchbox.parent`).
3. On the emulator, use an image *with Google Play*. An app not installed from Play cannot pass Play Integrity, and
   Firebase then shows a reCAPTCHA page instead, which is expected.
4. Test numbers (Authentication → Sign-in method → Phone → *Phone numbers for testing*) still go through this check.

To go back: `./scripts/use-auth.ps1 -Target emulator` and `./scripts/dev-backend.ps1` (and rebuild the apps).
