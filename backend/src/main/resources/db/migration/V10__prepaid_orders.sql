-- ADR-0018: prepaid plans paid through Razorpay Orders. The open (unpaid) order for a subscription's next period;
-- cleared once its payment is verified. A subscription with no Razorpay subscription id is billed this way.
ALTER TABLE subscriptions ADD COLUMN razorpay_order_id VARCHAR(64);
CREATE UNIQUE INDEX ux_subscriptions_razorpay_order ON subscriptions (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
-- Remembers the last renewal reminder so the hourly job sends at most one per period.
ALTER TABLE subscriptions ADD COLUMN renewal_reminded_for TIMESTAMPTZ;
