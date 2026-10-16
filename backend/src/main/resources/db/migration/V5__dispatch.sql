-- bank_account_number and kyc document_number hold AES-GCM ciphertext.
CREATE TABLE delivery_partners (
    id                     uuid PRIMARY KEY,
    user_id                uuid        NOT NULL UNIQUE REFERENCES users (id),
    first_name             varchar(80) NOT NULL,
    last_name              varchar(80),
    vehicle_type           varchar(20) NOT NULL CHECK (vehicle_type IN ('BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'EV_SCOOTER', 'CAR')),
    vehicle_number         varchar(20),
    capacity               int         NOT NULL CHECK (capacity BETWEEN 1 AND 40),
    home_zone              geometry(Point, 4326) NOT NULL,
    service_radius_m       int         NOT NULL DEFAULT 5000 CHECK (service_radius_m BETWEEN 500 AND 30000),
    kyc_status             varchar(20) NOT NULL DEFAULT 'NOT_STARTED'
        CHECK (kyc_status IN ('NOT_STARTED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED')),
    kyc_reviewed_by        uuid,
    kyc_reviewed_at        timestamptz,
    kyc_notes              varchar(500),
    rating                 numeric(3, 2),
    rating_count           int         NOT NULL DEFAULT 0,
    photo_key              varchar(300),
    bank_account_name      varchar(120),
    bank_account_number    text,
    bank_ifsc              varchar(11),
    payout_contact_id      varchar(64),
    payout_fund_account_id varchar(64),
    active                 boolean     NOT NULL DEFAULT true,
    deleted_at             timestamptz,
    created_at             timestamptz NOT NULL,
    updated_at             timestamptz NOT NULL
);
CREATE INDEX ix_partners_home_zone ON delivery_partners USING gist (home_zone);
CREATE INDEX ix_partners_kyc ON delivery_partners (kyc_status) WHERE deleted_at IS NULL;

ALTER TABLE orders ADD CONSTRAINT fk_orders_partner FOREIGN KEY (partner_id) REFERENCES delivery_partners (id);

CREATE TABLE kyc_documents (
    id               uuid PRIMARY KEY,
    partner_id       uuid         NOT NULL REFERENCES delivery_partners (id),
    doc_type         varchar(30)  NOT NULL CHECK (doc_type IN ('AADHAAR', 'PAN', 'DRIVING_LICENSE', 'VEHICLE_RC', 'PHOTO', 'POLICE_VERIFICATION')),
    s3_key           varchar(300) NOT NULL,
    document_number  text,
    status           varchar(20)  NOT NULL CHECK (status IN ('UPLOADED', 'VERIFYING', 'VERIFIED', 'FAILED')),
    provider_task_id varchar(100),
    provider_result  jsonb,
    created_at       timestamptz  NOT NULL,
    updated_at       timestamptz  NOT NULL
);
CREATE INDEX ix_kyc_documents_partner ON kyc_documents (partner_id);

CREATE TABLE partner_shifts (
    id             uuid PRIMARY KEY,
    partner_id     uuid        NOT NULL REFERENCES delivery_partners (id),
    shift_date     date        NOT NULL,
    planned_start  timestamptz NOT NULL,
    planned_end    timestamptz NOT NULL,
    started_at     timestamptz,
    ended_at       timestamptz,
    status         varchar(20) NOT NULL CHECK (status IN ('SCHEDULED', 'ACTIVE', 'ENDED', 'NO_SHOW', 'CANCELLED')),
    start_location geometry(Point, 4326),
    created_at     timestamptz NOT NULL,
    updated_at     timestamptz NOT NULL,
    UNIQUE (partner_id, shift_date),
    CONSTRAINT ck_shift_window CHECK (planned_start < planned_end)
);
CREATE INDEX ix_shifts_date ON partner_shifts (shift_date, status);

CREATE TABLE routes (
    id               uuid PRIMARY KEY,
    partner_id       uuid        NOT NULL REFERENCES delivery_partners (id),
    route_date       date        NOT NULL,
    status           varchar(20) NOT NULL CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    optimizer        varchar(30) NOT NULL,
    total_distance_m int         NOT NULL DEFAULT 0,
    total_duration_s int         NOT NULL DEFAULT 0,
    started_at       timestamptz,
    completed_at     timestamptz,
    version          bigint      NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL,
    updated_at       timestamptz NOT NULL,
    UNIQUE (partner_id, route_date)
);

CREATE TABLE route_stops (
    id           uuid PRIMARY KEY,
    route_id     uuid        NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
    sequence     int         NOT NULL,
    stop_type    varchar(10) NOT NULL CHECK (stop_type IN ('PICKUP', 'DROP')),
    order_id     uuid REFERENCES orders (id),
    school_id    uuid REFERENCES schools (id),
    location     geometry(Point, 4326) NOT NULL,
    planned_eta  timestamptz,
    arrived_at   timestamptz,
    completed_at timestamptz,
    status       varchar(20) NOT NULL CHECK (status IN ('PENDING', 'ARRIVED', 'COMPLETED', 'SKIPPED', 'FAILED')),
    created_at   timestamptz NOT NULL,
    updated_at   timestamptz NOT NULL,
    CONSTRAINT ux_route_stop_sequence UNIQUE (route_id, sequence) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT ck_stop_target CHECK ((stop_type = 'PICKUP' AND order_id IS NOT NULL) OR (stop_type = 'DROP' AND school_id IS NOT NULL))
);
CREATE INDEX ix_route_stops_order ON route_stops (order_id);

CREATE TABLE assignments (
    id             uuid PRIMARY KEY,
    order_id       uuid        NOT NULL REFERENCES orders (id),
    partner_id     uuid        NOT NULL REFERENCES delivery_partners (id),
    route_id       uuid REFERENCES routes (id) ON DELETE SET NULL,
    status         varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'RELEASED')),
    assigned_by    uuid,
    assigned_at    timestamptz NOT NULL,
    released_at    timestamptz,
    release_reason varchar(300),
    version        bigint      NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL,
    updated_at     timestamptz NOT NULL
);
-- Hard guarantee against double assignment, independent of the Redis lock.
CREATE UNIQUE INDEX ux_assignments_active_order ON assignments (order_id) WHERE status = 'ACTIVE';
CREATE INDEX ix_assignments_partner ON assignments (partner_id, status);

CREATE TABLE partner_issues (
    id              uuid PRIMARY KEY,
    partner_id      uuid        NOT NULL REFERENCES delivery_partners (id),
    order_id        uuid REFERENCES orders (id),
    issue_type      varchar(30) NOT NULL CHECK (issue_type IN ('SOS', 'ACCIDENT', 'VEHICLE_BREAKDOWN', 'PARENT_UNREACHABLE', 'SCHOOL_CLOSED', 'OTHER')),
    description     varchar(1000),
    location        geometry(Point, 4326),
    status          varchar(20) NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
    acknowledged_by uuid,
    resolved_at     timestamptz,
    resolution_note varchar(500),
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL
);
CREATE INDEX ix_partner_issues_open ON partner_issues (status, created_at DESC);

CREATE TABLE masked_calls (
    id               uuid PRIMARY KEY,
    order_id         uuid        NOT NULL REFERENCES orders (id),
    partner_id       uuid        NOT NULL REFERENCES delivery_partners (id),
    direction        varchar(20) NOT NULL CHECK (direction IN ('PARTNER_TO_PARENT', 'PARENT_TO_PARTNER')),
    provider_call_id varchar(64),
    status           varchar(20) NOT NULL,
    created_at       timestamptz NOT NULL,
    updated_at       timestamptz NOT NULL
);
