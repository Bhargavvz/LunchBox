-- Parent rating of a delivered order (one per order). The partner's aggregate rating is updated asynchronously
-- from the rating.submitted outbox event.
ALTER TABLE orders
    ADD COLUMN rating_stars   smallint CHECK (rating_stars BETWEEN 1 AND 5),
    ADD COLUMN rating_comment varchar(500),
    ADD COLUMN rated_at       timestamptz,
    ADD CONSTRAINT ck_orders_rating CHECK ((rating_stars IS NULL) = (rated_at IS NULL));
