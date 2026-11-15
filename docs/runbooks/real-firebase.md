# Switching from the Firebase emulator to the real project (`lunchboxappv1`)

Local development signs in through the Firebase Auth emulator (`demo-lunchbox`). The real project is already wired
for builds; these steps switch a machine over to it. Everything below is local and git-ignored.

## Already in place
- `apps/parent/google-services.json` and `apps/partner/google-services.json`: one file covering all four Android apps
  (`in.lunchbox.parent`, `in.lunchbox.parent.development`, `in.lunchbox.partner`, `in.lunchbox.partner.development`).
- `apps/admin/.env.production.local`: the web app config, used only by `next build`.

## In the Firebase console (once)
1. **Authentication → Sign-in method**: enable **Phone** (parents, riders) and **Email/Password** (staff).
2. **Phone numbers for testing**: add e.g. `+91 98765 43210` → `123456`, so testing sends no SMS.
3. **Project settings → Your apps**: on each Android app, **Add fingerprint**:
   - Local/emulator builds (standard React Native debug key, not secret):
     SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
   - EAS builds: run `eas credentials` and add the SHA-1 and SHA-256 it shows.
   - Play Store builds: add the **App signing key** SHA-1 from Play Console → Setup → App integrity.
4. **Upgrade to Identity Platform** and enable **TOTP multi-factor**, so staff sign-in can require an authenticator.
5. **Authentication → Settings → Authorized domains**: add the admin domain once it exists.
6. **Project settings → Service accounts → Generate new private key**. Save it **outside the repo** (e.g.
   `C:\Users\<you>\.secrets\lunchbox-firebase-admin.json`). Never paste it into chat or commit it. The backend needs
   it to set role claims; verification alone would not be enough.

## Switch a machine to the real project
Backend (PowerShell, from `backend/`):
```powershell
$env:GOOGLE_CLOUD_PROJECT = "lunchboxappv1"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\<you>\.secrets\lunchbox-firebase-admin.json"
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST -ErrorAction SilentlyContinue
$env:BOOTSTRAP_SUPER_ADMIN_EMAIL = "<your staff email>"   # first run only
.\gradlew.bat bootRun --args=--spring.profiles.active=local
```
Mobile apps (`apps/parent/.env`, `apps/partner/.env`):
```
GOOGLE_SERVICES_JSON=./google-services.json
EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR=
```
Then rebuild the native app (`npx expo run:android`); `.env` changes to native config need a rebuild.

Admin: create your staff user under **Authentication → Users → Add user** with the bootstrap email, then sign in.
`require-admin-mfa` is off in the `local` profile; staging and production enforce it.

To go back to the emulator, restore the two `.env` lines (`./google-services.local.json` and `10.0.2.2:9099`) and
start the backend with `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099`.
