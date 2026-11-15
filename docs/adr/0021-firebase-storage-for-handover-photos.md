# ADR-0021: Handover photos in Firebase Storage instead of Amazon S3

**Status:** Accepted by the owner on 2026-11-15.

**Context.** Handover photos were planned for a private S3 bucket with SSE-KMS. The owner already uses Firebase for
sign-in and push, has created the project's Storage bucket (`lunchboxappv1.firebasestorage.app`, location
**asia-south2**, Delhi) in production mode, and is moving to an AWS free-plan account, where every extra AWS service
spends the same small credit.

**Decision.**
- `StorageService` gets a second implementation, `FirebaseStorageService`, selected with
  `lunchbox.storage.provider: firebase` (`STORAGE_PROVIDER`). The prod profile defaults to it; `STORAGE_BUCKET` names
  the bucket.
- It uses the Google Cloud Storage client that ships with the Firebase Admin SDK and issues **V4 signed URLs**:
  PUT for the rider's upload (5 minutes, `Content-Type` bound into the signature) and GET for parents and admins
  (5 minutes). The apps keep uploading with a plain HTTP PUT, so no app change is needed.
- Signed URLs are authorised by Cloud Storage, not by Firebase security rules, so the rules stay closed
  (production mode: no client reads or writes). Unsigned requests are refused.
- Signing uses the service-account key the backend already has (`FIREBASE_CREDENTIALS_JSON`). No AWS keys are
  needed on the server any more.
- `S3StorageService` stays for local development (LocalStack) and as the default when no provider is set.
- OR-Tools pulls protobuf 4.26, which lacks `GeneratedMessageV3` that the Cloud Storage client uses. The build pins
  protobuf 4.29.3, which supports both.

**Consequences.**
- Verified against the real bucket: a signed upload, a size/type check, a signed download, a delete, and a refused
  unsigned read.
- Photos are encrypted at rest with Google-managed keys (not a customer-managed KMS key as the brief asked).
- Retention: the 90-day photo expiry moves from an S3 lifecycle rule to a Cloud Storage lifecycle rule on the bucket
  (Delete, age 90 days, prefix `handover/`), set once in the Google Cloud console.
- Data stays in India (asia-south2). Cost: the Spark/Blaze free quota (5 GB stored) covers a pilot.
- Photos cross clouds (AWS server → Google storage) only as URLs; the image bytes go directly between the phone and
  Google.
