# ADR-0019: No masked calling (Exotel) and no document KYC (IDfy)

**Status:** Accepted by the owner on 2026-11-15.

**Context.** The brief included masked parent ↔ rider calls through Exotel and rider KYC through IDfy. The owner
decided not to use either service.

**Decision.**
- **No calling inside the apps.** The parent tracking screen and the rider stop screen no longer have call buttons,
  and the pickup stop no longer carries any phone number (masked or not). A rider who cannot reach a parent waits out
  the pickup window and marks the pickup failed ("Parent not answering"), or raises an issue/SOS; operations sees it
  at the top of Issues & SOS and contacts the parent from the admin console, which already shows parent details to
  staff. Removed: `CallMasking`, `ExotelCallMasking`, `FakeCallMasking`, `MaskedCallService`, both call endpoints and
  the `masked_calls` table.
- **No document KYC.** Riders still cannot work until operations approves them, but approval is a single decision
  with notes (`POST /api/v1/admin/partners/{id}/approval`), made after checking identity, licence and police
  verification in person. Removed: `KycService`, `KycProvider`/IDfy, `KycDocument`, the document endpoints, the
  `kyc_documents` table, the KYC S3 bucket and the partner photo that came from it (parents see the rider's initials).
  `kyc_status` becomes `approval_status` (`PENDING`, `APPROVED`, `REJECTED`); `V11__remove_kyc_and_call_masking.sql`
  maps existing rows.
- Exotel/IDfy configuration, secrets (Terraform `app_secret_keys`) and the KYC bucket are gone from every environment.

**Consequences.**
- Child safety now depends on the operations approval step being done properly; the admin approval card says what
  to check, and every decision is audited (`partner.approved` / `partner.rejected`).
- Two fewer vendors and their monthly cost; no DLT/ExoPhone or IDfy onboarding needed before launch.
- If calling is wanted later, add a `CallMasking` interface back behind the dispatch module; no other module depends
  on it.
