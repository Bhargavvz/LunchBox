-- Clearer logs: severity, module and a plain-English summary on every audit entry, plus system events.
ALTER TABLE audit_logs
    ADD COLUMN severity varchar(10) NOT NULL DEFAULT 'INFO',
    ADD COLUMN module   varchar(40),
    ADD COLUMN summary  varchar(500),
    ADD CONSTRAINT ck_audit_logs_severity CHECK (severity IN ('INFO', 'WARNING', 'ERROR'));

-- The log is append-only (trg_audit_logs_guard); the guard is lifted only for this one-time backfill of the new
-- columns, inside this migration's transaction, and restored straight after.
ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_guard;
UPDATE audit_logs SET module = split_part(action, '.', 1) WHERE module IS NULL;
UPDATE audit_logs SET severity = 'WARNING'
WHERE action ~ '\.(failed|declined|no_show|lapsed|halted|rejected|suspended)$';
ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_guard;

CREATE INDEX ix_audit_logs_severity ON audit_logs (severity, occurred_at DESC);
CREATE INDEX ix_audit_logs_module ON audit_logs (module, occurred_at DESC);

-- Demo data is tagged so it can be listed and removed in one step without touching real records
-- (scripts/demo-data, POST/DELETE /api/v1/admin/demo-data).
CREATE TABLE demo_records (
    table_name varchar(60) NOT NULL,
    record_id  uuid        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (table_name, record_id)
);

-- Order history stays append-only for real orders; only the history of demo orders may be deleted (with them).
CREATE OR REPLACE FUNCTION order_history_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM demo_records WHERE table_name = 'orders' AND record_id = OLD.order_id) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER trg_order_history_append_only ON order_status_history;
CREATE TRIGGER trg_order_history_append_only BEFORE UPDATE OR DELETE ON order_status_history
    FOR EACH ROW EXECUTE FUNCTION order_history_guard();

-- Plans may cover all seven days now that schools can work on Saturday and Sunday.
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_max_days_per_week_check;
ALTER TABLE plans ADD CONSTRAINT plans_max_days_per_week_check CHECK (max_days_per_week BETWEEN 1 AND 7);
