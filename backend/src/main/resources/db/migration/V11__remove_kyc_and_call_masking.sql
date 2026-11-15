-- ADR-0019: no document KYC (IDfy) and no masked calling (Exotel). Riders keep a simple operations approval.
ALTER TABLE delivery_partners DROP CONSTRAINT IF EXISTS delivery_partners_kyc_status_check;
ALTER TABLE delivery_partners RENAME COLUMN kyc_status TO approval_status;
ALTER TABLE delivery_partners RENAME COLUMN kyc_reviewed_by TO approval_reviewed_by;
ALTER TABLE delivery_partners RENAME COLUMN kyc_reviewed_at TO approval_reviewed_at;
ALTER TABLE delivery_partners RENAME COLUMN kyc_notes TO approval_notes;
UPDATE delivery_partners SET approval_status = 'PENDING' WHERE approval_status IN ('NOT_STARTED', 'SUBMITTED', 'IN_REVIEW');
ALTER TABLE delivery_partners ALTER COLUMN approval_status SET DEFAULT 'PENDING';
ALTER TABLE delivery_partners ADD CONSTRAINT delivery_partners_approval_status_check
    CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));
DROP INDEX IF EXISTS ix_partners_kyc;
CREATE INDEX ix_partners_approval ON delivery_partners (approval_status) WHERE deleted_at IS NULL;
-- The partner photo came from the KYC "PHOTO" document.
ALTER TABLE delivery_partners DROP COLUMN IF EXISTS photo_key;
DROP TABLE IF EXISTS kyc_documents;
DROP TABLE IF EXISTS masked_calls;
