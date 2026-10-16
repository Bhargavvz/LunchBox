# ADR-0008: Application-level encryption for selected PII columns

**Status:** Accepted

**Decision.** On top of KMS encryption at rest, columns that are sensitive but never searched — address lines and
instructions, allergy notes, bank account numbers, KYC document numbers and pickup OTPs — are encrypted with
AES-256-GCM through a JPA `AttributeConverter`. The 32-byte data key lives in Secrets Manager. Names and phone numbers
stay in plaintext because they are needed for search, uniqueness and SMS.

**Consequences.** A database dump or replica leak does not reveal home addresses. Key rotation needs a
re-encryption job; the ciphertext format is versioned (`v1:`).
