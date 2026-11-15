# Run the parent and partner apps in the Android emulator

Everything runs locally: the apps sign in through the Firebase Auth emulator and call the backend on your PC.
The emulator reaches your PC at `10.0.2.2`, which is what `apps/*/.env` already points to.

## Once per machine

1. **Android Studio → More Actions → SDK Manager.**
   - *SDK Platforms:* tick **Android 15 (API 35)** or newer.
   - *SDK Tools:* tick **Android SDK Command-line Tools**, **Android SDK Build-Tools**, **Android Emulator**,
     **Android SDK Platform-Tools** and **NDK (Side by side)**. Apply.
2. **Set environment variables** (Windows → *Edit environment variables for your account*), then open a new terminal:
   - `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`
   - `JAVA_HOME` = your JDK 21, e.g. `C:\Program Files\Java\jdk-21.0.12.1`. Not Android Studio's `jbr`: it is Java 25
     now, which Gradle 8 cannot run.
   - Add to `Path`: `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\emulator`
3. Check: `adb version` and `emulator -list-avds` both print something.
4. **Device Manager:** use the existing `Medium_Phone_API_37.0` or create a Pixel device with a *Google Play* image.
   Give it 4 GB RAM in *Advanced settings* if your PC allows.

## Every session

```powershell
docker compose up -d                       # Postgres, Redis, RabbitMQ, S3, Firebase emulator
./scripts/seed-emulator-admin.ps1          # local admin login (emulator data resets on restart)
./scripts/dev-backend.ps1                  # http://localhost:8080/actuator/health → UP
emulator -avd Medium_Phone_API_37.0        # or press ▶ in Device Manager
```

First time only for each app (compiles the native development build, 10–20 min, needs ~4 GB free RAM).

**Windows path limit.** The C++ part of the build fails with "Filename longer than 260 characters" when the project
sits in a deep folder (this worktree does). Map a short drive letter to the project, generate code once from the
real path, then build from the short one:

```powershell
subst L: "C:\{Projects}\LunchBox\.claude\worktrees\project-setup-ui-cdb22a"   # lasts until Windows restarts
cd "C:\{Projects}\LunchBox\.claude\worktrees\project-setup-ui-cdb22a\apps\partner\android"
.\gradlew.bat app:assembleDebug "-PreactNativeArchitectures=x86_64"   # stops at the C++ step; that is expected
cd L:\apps\partner\android
.\gradlew.bat app:installDebug "-PreactNativeArchitectures=x86_64"
```

Run Metro from the real `C:` path (not `L:`), or the workspace packages will not resolve. Moving the repository to a
short path such as `C:\lb` avoids all of this. Close the browser and other heavy apps while the emulator runs: with
less than ~2 GB free RAM the emulator lags and taps go astray.

```powershell
cd apps/parent
npx expo run:android                       # builds, installs and opens the app on the emulator
```

After that, just start the bundler and the installed app reconnects:

```powershell
pnpm dev:parent                            # press "a" to open it on the emulator
```

Same for the partner app with `apps/partner` and `pnpm dev:partner`. Run one app's bundler at a time.

## Demo data

With the backend running, `node scripts/seed-local-demo.mjs` creates a school, a parent with two children and an
address, today's lunchboxes, and an approved rider whose shift starts now. Sign in with:

- Parent app: `+91 98765 43210`
- Partner app: `+91 98765 00001`

Run it again whenever you like; it only adds what is missing. One exception: if a seeded rider never starts their
shift, the backend marks it a no-show after the grace period and it cannot be rescheduled for the same day. Clear it
with `docker compose exec postgres psql -U lunchbox -d lunchbox -c "delete from partner_shifts where status='NO_SHOW' and shift_date=current_date;"`
and run the script again.

For the rider's handover photo to upload from the emulator, start the backend with
`$env:S3_PRESIGN_ENDPOINT = "http://10.0.2.2:4566"` so the upload links point at your PC (`dev-backend.ps1` does this).

For real SMS OTPs instead of the emulator, see `real-firebase.md`.

## Signing in on the emulator

- Phone sign-in goes to the Firebase Auth emulator; no SMS is sent. Enter any number (e.g. `+91 98765 43210`), then
  read the 6-digit code with `docker compose logs firebase --tail 20`, or open
  http://localhost:9099/emulator/v1/projects/demo-lunchbox/verificationCodes.
- A partner must first be created in the admin (Partners → Create) with that phone number and approved.
- Maps show a blank grid until `GOOGLE_MAPS_ANDROID_KEY` is set in `apps/*/.env` (rebuild after setting it).

## If something goes wrong

| Symptom | Fix |
|---|---|
| `SDK location not found` | `ANDROID_HOME` not set in this terminal; reopen the terminal |
| `Unsupported class file major version`, or Gradle fails with just `25.0.4` | `JAVA_HOME` must be JDK 21, not Android Studio's `jbr` (Java 25) |
| App shows "network error" | Backend not running, or `.env` doesn't use `10.0.2.2` |
| Build runs out of memory | Stop the admin dev server and close the browser, then retry |
| Emulator very slow | Enable *Windows Hypervisor Platform* in *Turn Windows features on or off*, reboot |
