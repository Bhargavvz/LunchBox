CREATE TABLE orders (
    id                  uuid PRIMARY KEY,
    child_id            uuid        NOT NULL REFERENCES children (id),
    parent_id           uuid        NOT NULL REFERENCES parents (id),
    school_id           uuid        NOT NULL REFERENCES schools (id),
    address_id          uuid        NOT NULL REFERENCES addresses (id),
    subscription_id     uuid REFERENCES subscriptions (id),
    scheduled_date      date        NOT NULL,
    pickup_window_start timestamptz NOT NULL,
    pickup_window_end   timestamptz NOT NULL,
    delivery_deadline   timestamptz NOT NULL,
    pickup_location     geometry(Point, 4326) NOT NULL,
    status              varchar(30) NOT NULL CHECK (status IN ('SCHEDULED', 'ASSIGNED', 'REASSIGNED', 'PARTNER_EN_ROUTE',
                                                               'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL', 'DELIVERED',
                                                               'CANCELLED', 'PICKUP_FAILED', 'DELIVERY_FAILED')),
    partner_id          uuid,
    source              varchar(20) NOT NULL DEFAULT 'SUBSCRIPTION' CHECK (source IN ('SUBSCRIPTION', 'MANUAL')),
    cancel_reason       varchar(300),
    failure_reason      varchar(300),
    picked_up_at        timestamptz,
    delivered_at        timestamptz,
    school_received_at  timestamptz,
    school_received_by  uuid,
    version             bigint      NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL,
    updated_at          timestamptz NOT NULL,
    CONSTRAINT ux_orders_child_date UNIQUE (child_id, scheduled_date),
    CONSTRAINT ck_orders_window CHECK (pickup_window_start < pickup_window_end AND pickup_window_end <= delivery_deadline)
);
CREATE INDEX ix_orders_date_status ON orders (scheduled_date, status);
CREATE INDEX ix_orders_school_date ON orders (school_id, scheduled_date);
CREATE INDEX ix_orders_parent_date ON orders (parent_id, scheduled_date DESC);
CREATE INDEX ix_orders_partner_date ON orders (partner_id, scheduled_date) WHERE partner_id IS NOT NULL;

CREATE TABLE order_status_history (
    id            uuid PRIMARY KEY,
    order_id      uuid        NOT NULL REFERENCES orders (id),
    from_status   varchar(30),
    to_status     varchar(30) NOT NULL,
    actor_user_id uuid,
    actor_role    varchar(20),
    reason        varchar(300),
    metadata      jsonb,
    occurred_at   timestamptz NOT NULL
);
CREATE INDEX ix_order_history_order ON order_status_history (order_id, occurred_at);
CREATE TRIGGER trg_order_history_append_only BEFORE UPDATE OR DELETE ON order_status_history
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
