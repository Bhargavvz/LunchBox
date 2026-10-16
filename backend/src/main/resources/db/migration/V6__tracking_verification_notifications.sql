-- Raw GPS pings, partitioned by UTC day so retention is a cheap DROP TABLE.
CREATE TABLE location_pings (
    id          uuid        NOT NULL,
    partner_id  uuid        NOT NULL,
    route_id    uuid,
    location    geometry(Point, 4326) NOT NULL,
    accuracy_m  double precision,
    speed_mps   double precision,
    heading_deg double precision,
    battery_pct int,
    recorded_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL,
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);
CREATE INDEX ix_location_pings_partner_time ON location_pings (partner_id, recorded_at);
CREATE TABLE location_pings_default PARTITION OF location_pings DEFAULT;

CREATE OR REPLACE FUNCTION ensure_location_ping_partition(p_day date) RETURNS void AS $$
DECLARE
    part_name text := 'location_pings_' || to_char(p_day, 'YYYYMMDD');
BEGIN
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF location_pings FOR VALUES FROM (%L) TO (%L)',
                   part_name,
                   (p_day::timestamp AT TIME ZONE 'UTC'),
                   ((p_day + 1)::timestamp AT TIME ZONE 'UTC'));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION drop_location_ping_partitions_before(p_day date) RETURNS int AS $$
DECLARE
    r       record;
    dropped int := 0;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_inherits i
                 JOIN pg_class c ON c.oid = i.inhrelid
                 JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname = 'location_pings'
          AND c.relname ~ '^location_pings_[0-9]{8}$'
          AND to_date(substring(c.relname FROM 16 FOR 8), 'YYYYMMDD') < p_day
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I', r.relname);
        dropped := dropped + 1;
    END LOOP;
    DELETE FROM location_pings_default WHERE recorded_at < (p_day::timestamp AT TIME ZONE 'UTC');
    RETURN dropped;
END;
$$ LANGUAGE plpgsql;

SELECT ensure_location_ping_partition((current_date + g)::date) FROM generate_series(-1, 7) AS g;

CREATE TABLE verifications (
    id                   uuid PRIMARY KEY,
    order_id             uuid        NOT NULL REFERENCES orders (id),
    verification_type    varchar(20) NOT NULL CHECK (verification_type IN ('PICKUP_OTP', 'PICKUP_QR', 'HANDOVER_PHOTO')),
    status               varchar(20) NOT NULL CHECK (status IN ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED')),
    code_ciphertext      text,
    expires_at           timestamptz,
    attempts             int         NOT NULL DEFAULT 0,
    verified_at          timestamptz,
    verified_by          uuid,
    photo_key            varchar(300),
    location             geometry(Point, 4326),
    inside_geofence      boolean,
    distance_to_target_m int,
    metadata             jsonb,
    created_at           timestamptz NOT NULL,
    updated_at           timestamptz NOT NULL
);
CREATE INDEX ix_verifications_order ON verifications (order_id, verification_type);
CREATE UNIQUE INDEX ux_verifications_pending_otp ON verifications (order_id)
    WHERE verification_type = 'PICKUP_OTP' AND status = 'PENDING';

CREATE TABLE notifications (
    id              uuid PRIMARY KEY,
    user_id         uuid         NOT NULL REFERENCES users (id),
    category        varchar(40)  NOT NULL,
    title           varchar(160) NOT NULL,
    body            varchar(1000) NOT NULL,
    data            jsonb,
    channel         varchar(10)  NOT NULL CHECK (channel IN ('PUSH', 'SMS', 'IN_APP')),
    delivery_status varchar(20)  NOT NULL CHECK (delivery_status IN ('PENDING', 'SENT', 'FAILED')),
    read_at         timestamptz,
    created_at      timestamptz  NOT NULL,
    updated_at      timestamptz  NOT NULL
);
CREATE INDEX ix_notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE device_tokens (
    id           uuid PRIMARY KEY,
    user_id      uuid         NOT NULL REFERENCES users (id),
    token        varchar(512) NOT NULL UNIQUE,
    platform     varchar(10)  NOT NULL CHECK (platform IN ('ANDROID', 'IOS', 'WEB')),
    app          varchar(20)  NOT NULL CHECK (app IN ('PARENT', 'PARTNER', 'ADMIN')),
    last_seen_at timestamptz  NOT NULL,
    created_at   timestamptz  NOT NULL,
    updated_at   timestamptz  NOT NULL
);
CREATE INDEX ix_device_tokens_user ON device_tokens (user_id);

CREATE TABLE broadcasts (
    id              uuid PRIMARY KEY,
    audience        varchar(30)   NOT NULL CHECK (audience IN ('ALL_PARENTS', 'ALL_PARTNERS', 'SCHOOL_PARENTS')),
    school_id       uuid REFERENCES schools (id),
    title           varchar(160)  NOT NULL,
    body            varchar(1000) NOT NULL,
    created_by      uuid          NOT NULL,
    recipient_count int           NOT NULL DEFAULT 0,
    status          varchar(20)   NOT NULL CHECK (status IN ('QUEUED', 'SENDING', 'COMPLETED', 'FAILED')),
    created_at      timestamptz   NOT NULL,
    updated_at      timestamptz   NOT NULL
);
