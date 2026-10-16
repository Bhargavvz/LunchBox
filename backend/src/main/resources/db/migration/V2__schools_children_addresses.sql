CREATE TABLE schools (
    id                    uuid PRIMARY KEY,
    code                  varchar(30)  NOT NULL UNIQUE,
    name                  varchar(160) NOT NULL,
    address_line          varchar(300) NOT NULL,
    city                  varchar(80)  NOT NULL,
    pincode               varchar(10)  NOT NULL,
    location              geometry(Point, 4326) NOT NULL,
    geofence              geometry(Polygon, 4326),
    geofence_radius_m     int CHECK (geofence_radius_m BETWEEN 20 AND 2000),
    lunch_time            time         NOT NULL,
    delivery_window_start time         NOT NULL,
    delivery_window_end   time         NOT NULL,
    working_days          varchar(70)  NOT NULL DEFAULT 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY',
    contact_name          varchar(120),
    contact_phone         varchar(20),
    handover_instructions varchar(500),
    active                boolean      NOT NULL DEFAULT true,
    deleted_at            timestamptz,
    created_at            timestamptz  NOT NULL,
    updated_at            timestamptz  NOT NULL,
    CONSTRAINT ck_school_window CHECK (delivery_window_start < delivery_window_end),
    CONSTRAINT ck_school_lunch CHECK (delivery_window_end <= lunch_time)
);
CREATE INDEX ix_schools_location ON schools USING gist (location);
CREATE INDEX ix_schools_name_trgm ON schools USING gin (name gin_trgm_ops);

ALTER TABLE users ADD CONSTRAINT fk_users_school FOREIGN KEY (school_id) REFERENCES schools (id);

CREATE TABLE school_holidays (
    id           uuid PRIMARY KEY,
    school_id    uuid         NOT NULL REFERENCES schools (id),
    holiday_date date         NOT NULL,
    reason       varchar(200) NOT NULL,
    created_by   uuid,
    created_at   timestamptz  NOT NULL,
    updated_at   timestamptz  NOT NULL,
    UNIQUE (school_id, holiday_date)
);

CREATE TABLE service_areas (
    id         uuid PRIMARY KEY,
    name       varchar(120) NOT NULL,
    city       varchar(80)  NOT NULL,
    boundary   geometry(Polygon, 4326) NOT NULL,
    active     boolean      NOT NULL DEFAULT true,
    created_at timestamptz  NOT NULL,
    updated_at timestamptz  NOT NULL
);
CREATE INDEX ix_service_areas_boundary ON service_areas USING gist (boundary);

CREATE TABLE children (
    id             uuid PRIMARY KEY,
    parent_id      uuid        NOT NULL REFERENCES parents (id),
    school_id      uuid        NOT NULL REFERENCES schools (id),
    first_name     varchar(80) NOT NULL,
    last_name      varchar(80),
    class_name     varchar(20) NOT NULL,
    section        varchar(10),
    roll_number    varchar(20),
    allergies_note text,
    deleted_at     timestamptz,
    created_at     timestamptz NOT NULL,
    updated_at     timestamptz NOT NULL
);
CREATE INDEX ix_children_parent ON children (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_children_school ON children (school_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_children_roll ON children (school_id, class_name, coalesce(section, ''), roll_number)
    WHERE deleted_at IS NULL AND roll_number IS NOT NULL;

-- line1, line2 and instructions hold AES-GCM ciphertext (see PiiCipher).
CREATE TABLE addresses (
    id           uuid PRIMARY KEY,
    parent_id    uuid         NOT NULL REFERENCES parents (id),
    label        varchar(40)  NOT NULL,
    line1        text         NOT NULL,
    line2        text,
    landmark     varchar(160),
    city         varchar(80)  NOT NULL,
    pincode      varchar(10)  NOT NULL,
    location     geometry(Point, 4326) NOT NULL,
    instructions text,
    is_default   boolean      NOT NULL DEFAULT false,
    deleted_at   timestamptz,
    created_at   timestamptz  NOT NULL,
    updated_at   timestamptz  NOT NULL
);
CREATE INDEX ix_addresses_parent ON addresses (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_addresses_location ON addresses USING gist (location);
CREATE UNIQUE INDEX ux_addresses_default ON addresses (parent_id) WHERE is_default AND deleted_at IS NULL;
