# ADR-0002: Firebase Auth for identity, LunchBox DB for authorisation

**Status:** Accepted

**Decision.** Firebase handles phone OTP (parents, partners) and email + TOTP MFA (staff). The backend verifies ID
tokens with the Admin SDK on every request and STOMP CONNECT. Roles and status are read from the `users` table
(cached 30 s) and mirrored to custom claims for clients; the database is authoritative so a suspension applies
without waiting for token expiry.

**Alternatives.** Spring's OAuth2 resource server against Google's JWKS is cryptographically equivalent, but the
Admin SDK also provides claims management, user deletion (DPDP erasure) and emulator support.

**Consequences.** Partners and staff are pre-provisioned and linked on their first verified sign-in, which is how
"only KYC-approved partners can log in" is enforced. TOTP MFA requires upgrading the Firebase project to Identity
Platform.
