CREATE TABLE plans (
    id                uuid PRIMARY KEY,
    code              varchar(40)  NOT NULL UNIQUE,
    name              varchar(120) NOT NULL,
    description       varchar(500),
    price_paise       bigint       NOT NULL CHECK (price_paise > 0),
    billing_period    varchar(20)  NOT NULL CHECK (billing_period IN ('MONTHLY', 'QUARTERLY')),
    max_days_per_week int          NOT NULL CHECK (max_days_per_week BETWEEN 1 AND 6),
    razorpay_plan_id  varchar(64),
    active            boolean      NOT NULL DEFAULT true,
    created_at        timestamptz  NOT NULL,
    updated_at        timestamptz  NOT NULL
);

CREATE TABLE subscriptions (
    id                       uuid PRIMARY KEY,
    parent_id                uuid        NOT NULL REFERENCES parents (id),
    child_id                 uuid        NOT NULL REFERENCES children (id),
    plan_id                  uuid        NOT NULL REFERENCES plans (id),
    address_id               uuid        NOT NULL REFERENCES addresses (id),
    days_of_week             varchar(70) NOT NULL,
    start_date               date        NOT NULL,
    end_date                 date,
    status                   varchar(20) NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'HALTED', 'CANCELLED', 'EXPIRED')),
    razorpay_subscription_id varchar(64) UNIQUE,
    checkout_short_url       varchar(300),
    current_period_end       timestamptz,
    cancelled_at             timestamptz,
    cancel_reason            varchar(300),
    version                  bigint      NOT NULL DEFAULT 0,
    created_at               timestamptz NOT NULL,
    updated_at               timestamptz NOT NULL,
    CONSTRAINT ck_subscription_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX ux_subscriptions_live_child ON subscriptions (child_id)
    WHERE status IN ('PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'HALTED');
CREATE INDEX ix_subscriptions_parent ON subscriptions (parent_id);
CREATE INDEX ix_subscriptions_status ON subscriptions (status);

CREATE TABLE leave_days (
    id         uuid PRIMARY KEY,
    child_id   uuid         NOT NULL REFERENCES children (id),
    leave_date date         NOT NULL,
    reason     varchar(200),
    created_by uuid,
    created_at timestamptz  NOT NULL,
    updated_at timestamptz  NOT NULL,
    UNIQUE (child_id, leave_date)
);

CREATE TABLE payments (
    id                  uuid PRIMARY KEY,
    parent_id           uuid        NOT NULL REFERENCES parents (id),
    subscription_id     uuid REFERENCES subscriptions (id),
    razorpay_payment_id varchar(64) UNIQUE,
    razorpay_invoice_id varchar(64),
    amount_paise        bigint      NOT NULL CHECK (amount_paise >= 0),
    currency            varchar(3)  NOT NULL DEFAULT 'INR',
    status              varchar(20) NOT NULL CHECK (status IN ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED')),
    method              varchar(30),
    description         varchar(200) NOT NULL,
    failure_reason      varchar(300),
    paid_at             timestamptz,
    created_at          timestamptz NOT NULL,
    updated_at          timestamptz NOT NULL
);
CREATE INDEX ix_payments_parent ON payments (parent_id, created_at DESC);

CREATE TABLE webhook_events (
    id           uuid PRIMARY KEY,
    provider     varchar(20)  NOT NULL,
    event_id     varchar(100) NOT NULL,
    event_type   varchar(80)  NOT NULL,
    payload      jsonb        NOT NULL,
    received_at  timestamptz  NOT NULL,
    processed_at timestamptz,
    UNIQUE (provider, event_id)
);
