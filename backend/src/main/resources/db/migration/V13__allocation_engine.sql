-- Rider allocation engine (ADR-0023): tunable weights, an explainable decision log, optional rider zones.

-- A rider may be limited to one service area; NULL = anywhere within their service radius.
ALTER TABLE delivery_partners ADD COLUMN service_area_id uuid REFERENCES service_areas (id);

-- One row per allocation run (scheduled, manual, or triggered by a decline / no-show / offline rider).
CREATE TABLE allocation_runs (
    id              uuid PRIMARY KEY,
    run_date        date        NOT NULL,
    trigger         varchar(20) NOT NULL,
    actor_user_id   uuid,
    started_at      timestamptz NOT NULL,
    finished_at     timestamptz,
    considered      int         NOT NULL DEFAULT 0,
    assigned        int         NOT NULL DEFAULT 0,
    unassigned      int         NOT NULL DEFAULT 0,
    riders          int         NOT NULL DEFAULT 0,
    total_cost      numeric(14, 2),
    improving_moves int         NOT NULL DEFAULT 0,
    solve_ms        int         NOT NULL DEFAULT 0,
    travel_source   varchar(30),
    weights         jsonb       NOT NULL,
    CONSTRAINT ck_allocation_runs_trigger CHECK (trigger IN ('SCHEDULED', 'MANUAL', 'DECLINE', 'NO_SHOW', 'OFFLINE'))
);
CREATE INDEX ix_allocation_runs_date ON allocation_runs (run_date, started_at DESC);

-- Who got each order and why (or why nobody did). Outcomes: ASSIGNED, UNASSIGNED, CONFLICT (someone else changed the
-- order first), MANUAL (ops override), DECLINED (rider said no), RELEASED (no-show / offline / reassignment).
CREATE TABLE allocation_decisions (
    id                   uuid PRIMARY KEY,
    run_id               uuid REFERENCES allocation_runs (id) ON DELETE CASCADE,
    order_id             uuid        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    partner_id           uuid REFERENCES delivery_partners (id),
    outcome              varchar(20) NOT NULL,
    reason_code          varchar(40),
    reason               varchar(500) NOT NULL,
    breakdown            jsonb,
    eligible_riders      int,
    runner_up_partner_id uuid,
    runner_up_cost       numeric(12, 2),
    actor_user_id        uuid,
    created_at           timestamptz NOT NULL,
    CONSTRAINT ck_allocation_decisions_outcome
        CHECK (outcome IN ('ASSIGNED', 'UNASSIGNED', 'CONFLICT', 'MANUAL', 'DECLINED', 'RELEASED'))
);
CREATE INDEX ix_allocation_decisions_order ON allocation_decisions (order_id, created_at DESC);
CREATE INDEX ix_allocation_decisions_run ON allocation_decisions (run_id);
CREATE INDEX ix_allocation_decisions_declined ON allocation_decisions (partner_id, order_id) WHERE outcome = 'DECLINED';

INSERT INTO app_settings (key, value, description, updated_at, version) VALUES
    ('allocation.weights',
     '{"distancePerKm": 1.0, "newSchoolKm": 3.0, "workloadKm": 2.0, "ratingKm": 2.0, "reliabilityKm": 4.0, "unassignedPenaltyKm": 1000, "priorityMultiplier": 2.0, "candidatesPerOrder": 8, "offlineAfterMinutes": 10, "roadDetourFactor": 1.35, "averageSpeedKmph": 18}',
     'How riders are chosen: every term is in km of riding (see Rider allocation)', now(), 0)
ON CONFLICT (key) DO NOTHING;
