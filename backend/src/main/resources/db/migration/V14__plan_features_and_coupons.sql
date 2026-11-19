-- Configurable plans (ADR-0024): feature definitions an admin can extend without code, typed per-plan values
-- (entitlements), plan visibility / trial / fixed duration / subscriber cap, and coupons.

CREATE TABLE plan_feature_definitions (
    key           varchar(60) PRIMARY KEY,
    label         varchar(120) NOT NULL,
    description   varchar(300),
    value_type    varchar(20)  NOT NULL,
    -- true: built in; the backend applies it. false: added by an admin; shown to parents on the plan card.
    enforced      boolean      NOT NULL DEFAULT false,
    default_value jsonb,
    display_order int          NOT NULL DEFAULT 100,
    active        boolean      NOT NULL DEFAULT true,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_plan_feature_key CHECK (key ~ '^[a-z][a-z0-9_]{1,59}$'),
    CONSTRAINT ck_plan_feature_type CHECK (value_type IN ('BOOLEAN', 'INTEGER', 'DAYS', 'TEXT', 'MONEY'))
);

INSERT INTO plan_feature_definitions (key, label, description, value_type, enforced, default_value, display_order) VALUES
    ('max_children', 'Children on this plan', 'How many of one parent''s children can be on this plan at the same time', 'INTEGER', true, NULL, 10),
    ('allowed_days', 'Pickup days allowed', 'Weekdays this plan can be used on', 'DAYS', true, NULL, 20),
    ('max_leave_days_per_month', 'Leave days a month', 'Days a parent can skip in one calendar month', 'INTEGER', true, NULL, 30),
    ('cancellation_allowed', 'Parents can cancel', 'Whether parents can cancel this plan in the app', 'BOOLEAN', true, 'true', 40),
    ('priority_delivery', 'Priority delivery', 'Orders on this plan get a rider first when riders are short', 'BOOLEAN', true, 'false', 50),
    ('live_tracking', 'Live tracking', 'Parents can follow the rider on a map', 'BOOLEAN', true, 'true', 60),
    ('refund_policy', 'Refund policy', 'Shown to parents before they pay', 'TEXT', false, NULL, 70);

ALTER TABLE plans
    ADD COLUMN visibility       varchar(10) NOT NULL DEFAULT 'PUBLIC',
    ADD COLUMN trial_days       int         NOT NULL DEFAULT 0,
    ADD COLUMN duration_periods int,
    ADD COLUMN max_subscribers  int,
    ADD COLUMN entitlements     jsonb       NOT NULL DEFAULT '{}',
    ADD CONSTRAINT ck_plans_visibility CHECK (visibility IN ('PUBLIC', 'HIDDEN')),
    ADD CONSTRAINT ck_plans_trial CHECK (trial_days BETWEEN 0 AND 30),
    ADD CONSTRAINT ck_plans_duration CHECK (duration_periods IS NULL OR duration_periods BETWEEN 1 AND 36),
    ADD CONSTRAINT ck_plans_max_subscribers CHECK (max_subscribers IS NULL OR max_subscribers > 0),
    ADD CONSTRAINT ck_plans_entitlements CHECK (jsonb_typeof(entitlements) = 'object');

CREATE TABLE coupons (
    id                      uuid PRIMARY KEY,
    code                    varchar(30)  NOT NULL UNIQUE,
    description             varchar(200),
    kind                    varchar(10)  NOT NULL,
    -- PERCENT: 1–100. FLAT: paise.
    amount                  bigint       NOT NULL,
    max_discount_paise      bigint,
    valid_from              date,
    valid_to                date,
    max_redemptions         int,
    redeemed                int          NOT NULL DEFAULT 0,
    plan_ids                uuid[]       NOT NULL DEFAULT '{}',
    first_subscription_only boolean      NOT NULL DEFAULT false,
    active                  boolean      NOT NULL DEFAULT true,
    created_at              timestamptz  NOT NULL,
    updated_at              timestamptz  NOT NULL,
    version                 bigint       NOT NULL DEFAULT 0,
    CONSTRAINT ck_coupons_code CHECK (code ~ '^[A-Z0-9_-]{3,30}$'),
    CONSTRAINT ck_coupons_kind CHECK (kind IN ('PERCENT', 'FLAT')),
    CONSTRAINT ck_coupons_amount CHECK ((kind = 'PERCENT' AND amount BETWEEN 1 AND 100) OR (kind = 'FLAT' AND amount > 0)),
    CONSTRAINT ck_coupons_dates CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
    CONSTRAINT ck_coupons_redeemed CHECK (redeemed >= 0 AND (max_redemptions IS NULL OR redeemed <= max_redemptions))
);

-- A parent can use a coupon once; recorded when the discounted payment is confirmed.
CREATE TABLE coupon_redemptions (
    id              uuid PRIMARY KEY,
    coupon_id       uuid        NOT NULL REFERENCES coupons (id),
    parent_id       uuid        NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
    subscription_id uuid        NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
    discount_paise  bigint      NOT NULL,
    redeemed_at     timestamptz NOT NULL,
    CONSTRAINT uq_coupon_parent UNIQUE (coupon_id, parent_id)
);

ALTER TABLE subscriptions
    ADD COLUMN periods_paid         int    NOT NULL DEFAULT 0,
    ADD COLUMN trial_ends_at        timestamptz,
    -- The amount and coupon of the open Razorpay order (price minus discount); checked when the payment arrives.
    ADD COLUMN pending_amount_paise bigint,
    ADD COLUMN pending_coupon_id    uuid REFERENCES coupons (id);

-- Periods already paid before this migration: one per captured payment.
UPDATE subscriptions s SET periods_paid = (
    SELECT count(*) FROM payments p WHERE p.subscription_id = s.id AND p.status IN ('CAPTURED', 'AUTHORIZED'));
