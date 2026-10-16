CREATE TABLE payouts (
    id                 uuid PRIMARY KEY,
    partner_id         uuid        NOT NULL REFERENCES delivery_partners (id),
    period_start       date        NOT NULL,
    period_end         date        NOT NULL,
    amount_paise       bigint      NOT NULL CHECK (amount_paise > 0),
    status             varchar(20) NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'REVERSED')),
    provider_payout_id varchar(64) UNIQUE,
    utr                varchar(64),
    failure_reason     varchar(300),
    processed_at       timestamptz,
    version            bigint      NOT NULL DEFAULT 0,
    created_at         timestamptz NOT NULL,
    updated_at         timestamptz NOT NULL,
    CONSTRAINT ux_payout_period UNIQUE (partner_id, period_start, period_end)
);
CREATE INDEX ix_payouts_status ON payouts (status);

-- Append-only money ledger. Balance = SUM(amount_paise). Corrections are new ADJUSTMENT rows, never edits.
CREATE TABLE earnings_ledger (
    id           uuid PRIMARY KEY,
    partner_id   uuid         NOT NULL REFERENCES delivery_partners (id),
    entry_type   varchar(20)  NOT NULL CHECK (entry_type IN ('BASE_DAY', 'DELIVERY', 'DISTANCE', 'INCENTIVE', 'PENALTY',
                                                             'ADJUSTMENT', 'PAYOUT', 'PAYOUT_REVERSAL')),
    amount_paise bigint       NOT NULL,
    earning_date date         NOT NULL,
    order_id     uuid,
    route_id     uuid,
    payout_id    uuid REFERENCES payouts (id),
    description  varchar(300) NOT NULL,
    created_by   uuid,
    dedupe_key   varchar(120) NOT NULL UNIQUE,
    created_at   timestamptz  NOT NULL,
    CONSTRAINT ck_ledger_sign CHECK (
        (entry_type IN ('PENALTY', 'PAYOUT') AND amount_paise < 0)
            OR (entry_type IN ('BASE_DAY', 'DELIVERY', 'DISTANCE', 'INCENTIVE', 'PAYOUT_REVERSAL') AND amount_paise > 0)
            OR (entry_type = 'ADJUSTMENT' AND amount_paise <> 0))
);
CREATE INDEX ix_ledger_partner_date ON earnings_ledger (partner_id, earning_date);
CREATE TRIGGER trg_ledger_append_only BEFORE UPDATE OR DELETE ON earnings_ledger
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
