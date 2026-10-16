# ADR-0013: Libraries added beyond the fixed stack

**Status:** Proposed — please confirm

Each addition has a one-line justification, as required by CLAUDE.md §14.6.

| Library | Where | Why |
|---|---|---|
| `reactor-netty` | backend | TCP client required by Spring's STOMP broker relay |
| `software.amazon.awssdk:s3` | backend | Pre-signed URLs and HEAD checks for S3 objects |
| `com.redis:testcontainers-redis` | backend tests | Redis container with Spring Boot `@ServiceConnection` support |
| `openapi-typescript`, `openapi-fetch` | api-client | Generate types from the OpenAPI spec and a typed fetch client |
| `i18next`, `react-i18next`, `expo-localization` | mobile | English + Hindi strings and device-locale detection |
| `react-native-razorpay` | parent app | Official Razorpay native checkout (subscriptions) |
| `react-native-qrcode-svg`, `react-native-svg` | parent app | Render the signed pickup QR |
| `@react-native-async-storage/async-storage` | partner app | Durable offline action queue (SecureStore values are size-limited) |
| `@react-native-community/netinfo` | partner app | Flush the offline queue when connectivity returns |
| `expo-file-system`, `expo-image-manipulator` | partner app | Compress the handover photo and PUT it to S3 |
| `@vis.gl/react-google-maps` | admin | Google-maintained React wrapper for the Maps JS API |
| `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` | admin | shadcn/ui primitives and their utilities |
| `qrcode.react` | admin | Show the TOTP enrolment QR |
| `firebase` (web SDK) | admin | Email + TOTP sign-in for staff |
