# App store release checklist

## Both apps

- [ ] EAS project ids set (`EAS_PROJECT_ID`), `eas.json` profiles verified, `runtimeVersion` policy understood
- [ ] Firebase `google-services.json` / `GoogleService-Info.plist` uploaded as EAS file secrets per environment
- [ ] Google Maps keys restricted to the app's package name / bundle id and SHA-1
- [ ] App icons, splash, adaptive icon, screenshots (phone sizes), feature graphic (Play)
- [ ] Privacy policy URL and terms URL live; in-app links point to the same version as `policyVersion`
- [ ] Data safety (Play) / App Privacy (App Store) forms: phone number, name, precise location (partner app),
      photos (partner app), payment info handled by Razorpay, children's data (parent app) — not sold, encrypted in
      transit, deletion available in-app
- [ ] Account deletion reachable in-app (parent app: Account → Delete account) — required by both stores
- [ ] Hindi translations reviewed by a native speaker
- [ ] Accessibility pass: TalkBack/VoiceOver labels, 48 dp touch targets, dynamic type
- [ ] Crash reporting (Sentry) DSN set for production builds

## Parent app

- [ ] Razorpay live key and checkout tested end-to-end with a real UPI mandate
- [ ] Notification permission prompt copy; SMS fallback DLT templates approved
- [ ] Play: target audience is **parents (18+)**, not children — the app is used by guardians

## Partner app (internal distribution first)

- [ ] Background location justification: Play *Location permissions declaration* with a video of the active-route
      flow; iOS `UIBackgroundModes: location` usage description
- [ ] Foreground service type `location` declared (Android 14+)
- [ ] Camera permission copy (QR scan + handover photo)
- [ ] Battery test: a 4-hour route on a mid-range Android keeps battery drain acceptable
- [ ] Offline test: airplane mode during pickup → actions sync on reconnect without duplicates
