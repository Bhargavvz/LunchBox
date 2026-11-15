# ADR-0018: Prepaid lunch plans paid through Razorpay Orders

**Status:** Accepted by the owner on 2026-11-15 (chosen over waiting for Razorpay Subscriptions).

**Context.** The brief specifies Razorpay Subscriptions (auto-debit). On the owner's Razorpay account, Plans and
Subscriptions return `401 Unauthorized` even in test mode, while Payments and Orders work with the same keys:
Subscriptions has to be enabled for an account by Razorpay. Waiting would block every paid flow.

**Decision.** Billing is prepaid by default (`lunchbox.billing.mode: prepaid`):
- A lunch plan is still a `Subscription` row (child, days, address, plan), so orders, leave, the admin views and the
  state machine are unchanged.
- Each billing period is one Razorpay **Order** for the plan price (`payment_capture: 1`). The checkout pays the order;
  `POST /subscriptions/{id}/verify` checks `HMAC_SHA256(order_id|payment_id, key_secret)`, records the payment and
  sets `currentPeriodEnd` to one month (or three for quarterly) from the start date, today, or the current period end
  when renewing early, so early renewals lose no days. Periods end at IST midnight.
- `POST /subscriptions/{id}/renew` opens the next order; allowed in the last 7 days of a period, after it lapsed
  (`HALTED`), or to finish an abandoned first payment (`PENDING_PAYMENT`). Idempotency-Key supported.
- An hourly job (`SubscriptionJobs`, ShedLock) lapses ended periods to `HALTED` (pre-pickup orders from the end date
  are cancelled through the existing `SubscriptionEnded` event) and, 3 days before the end, publishes `RenewalDue`;
  the notifications module turns that into a push (`PLAN_RENEWAL_DUE`, English and Hindi) once per period.
- Order generation only schedules days inside a paid period (`currentPeriodEnd` check in `findActiveOn`).
- Plans are no longer created at Razorpay in prepaid mode.
- The Subscriptions code path is kept behind `lunchbox.billing.mode: subscription` and `PaymentGateway`, so auto-debit
  can be switched on later without a migration. Existing auto-debit subscriptions keep working either way.

**Consequences.**
- Parents renew once a month (or quarter) with one tap instead of a standing mandate. The app shows "Paid until …",
  a reminder in the last 7 days, and **Renew** / **Complete payment** on the child card.
- A payment verified in the app activates the plan immediately; the `payment.captured` webhook (needs a public URL,
  so staging) is a backstop, not a requirement.
- Schema: `V10__prepaid_orders.sql` adds `subscriptions.razorpay_order_id` and `renewal_reminded_for`.
- Tests: `PrepaidBillingTest` (periods, early renewal, quarterly, signature checks, sweep) and `DeliveryFlowIT`
  (end-to-end with a prepaid payment).
- Verified against Razorpay test mode: a real order is created and the native checkout opens for the plan price.
