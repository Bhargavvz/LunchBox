-- Core platform tables: identity, consent, audit, outbox, idempotency, scheduling, settings.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Rejects UPDATEs, and DELETEs of rows younger than the retention period, on append-only tables.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
    id                 uuid PRIMARY KEY,
    firebase_uid       varchar(128) UNIQUE,
    role               varchar(20)  NOT NULL CHECK (role IN ('PARENT', 'PARTNER', 'SUPER_ADMIN', 'OPS_ADMIN', 'SUPPORT', 'SCHOOL_ADMIN')),
    phone              varchar(20),
    email              varchar(254),
    display_name       varchar(120),
    school_id          uuid,
    status             varchar(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED')),
    preferred_language varchar(5)   NOT NULL DEFAULT 'en',
    last_login_at      timestamptz,
    deleted_at         timestamptz,
    created_at         timestamptz  NOT NULL,
    updated_at         timestamptz  NOT NULL
);
CREATE UNIQUE INDEX ux_users_phone_live ON users (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE UNIQUE INDEX ux_users_email_live ON users (lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX ix_users_role ON users (role) WHERE deleted_at IS NULL;

CREATE TABLE parents (
    id         uuid PRIMARY KEY,
    user_id    uuid        NOT NULL UNIQUE REFERENCES users (id),
    first_name varchar(80) NOT NULL,
    last_name  varchar(80),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE INDEX ix_parents_name_trgm ON parents USING gin ((first_name || ' ' || coalesce(last_name, '')) gin_trgm_ops);

-- DPDP Act 2023: verifiable parental consent and purpose-bound consent records.
CREATE TABLE consents (
    id             uuid PRIMARY KEY,
    user_id        uuid        NOT NULL REFERENCES users (id),
    purpose        varchar(40) NOT NULL CHECK (purpose IN ('ACCOUNT_AND_SERVICE', 'CHILD_DATA_PROCESSING', 'LIVE_TRACKING', 'MARKETING')),
    policy_version varchar(20) NOT NULL,
    granted        boolean     NOT NULL,
    granted_at     timestamptz,
    withdrawn_at   timestamptz,
    ip             varchar(64),
    user_agent     varchar(255),
    created_at     timestamptz NOT NULL,
    updated_at     timestamptz NOT NULL
);
CREATE INDEX ix_consents_user ON consents (user_id, purpose);

CREATE TABLE audit_logs (
    id            uuid PRIMARY KEY,
    actor_user_id uuid,
    actor_role    varchar(20),
    action        varchar(80) NOT NULL,
    entity_type   varchar(60) NOT NULL,
    entity_id     varchar(64),
    before_state  jsonb,
    after_state   jsonb,
    ip            varchar(64),
    user_agent    varchar(255),
    request_id    varchar(64),
    occurred_at   timestamptz NOT NULL
);
CREATE INDEX ix_audit_entity ON audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_actor ON audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX ix_audit_time ON audit_logs (occurred_at DESC);

CREATE OR REPLACE FUNCTION audit_logs_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.occurred_at < now() - interval '3 years' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_logs_guard BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_guard();

CREATE TABLE outbox_events (
    id             uuid PRIMARY KEY,
    aggregate_type varchar(60)  NOT NULL,
    aggregate_id   uuid         NOT NULL,
    event_type     varchar(80)  NOT NULL,
    payload        jsonb        NOT NULL,
    created_at     timestamptz  NOT NULL,
    published_at   timestamptz,
    attempts       int          NOT NULL DEFAULT 0,
    last_error     text
);
CREATE INDEX ix_outbox_unpublished ON outbox_events (created_at) WHERE published_at IS NULL;

CREATE TABLE processed_events (
    consumer     varchar(80) NOT NULL,
    event_id     uuid        NOT NULL,
    processed_at timestamptz NOT NULL,
    PRIMARY KEY (consumer, event_id)
);

CREATE TABLE idempotency_keys (
    id            uuid PRIMARY KEY,
    idem_key      varchar(100) NOT NULL,
    user_id       uuid         NOT NULL,
    scope         varchar(80)  NOT NULL,
    request_hash  varchar(64)  NOT NULL,
    status        varchar(20)  NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    response_body jsonb,
    created_at    timestamptz  NOT NULL,
    expires_at    timestamptz  NOT NULL,
    UNIQUE (user_id, scope, idem_key)
);
CREATE INDEX ix_idempotency_expiry ON idempotency_keys (expires_at);

CREATE TABLE shedlock (
    name       varchar(64)  NOT NULL PRIMARY KEY,
    lock_until timestamp    NOT NULL,
    locked_at  timestamp    NOT NULL,
    locked_by  varchar(255) NOT NULL
);

CREATE TABLE app_settings (
    key         varchar(80) PRIMARY KEY,
    value       jsonb       NOT NULL,
    description varchar(300),
    updated_by  uuid,
    updated_at  timestamptz NOT NULL,
    version     bigint      NOT NULL DEFAULT 0
);
