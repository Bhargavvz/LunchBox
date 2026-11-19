# ADR-0024: Configurable plans: feature definitions, enforced entitlements and coupons

**Status:** Accepted (owner asked to define plan features in the admin panel, add new kinds without code changes, and
have the apps enforce them, not just display them).

**Context.** A plan had a price, billing period, days per week and up to eight text bullets. Anything else (children per
family, allowed days, trials, limits, discounts) needed code.

**Decision.**
- **Feature definitions** (`plan_feature_definitions`): key, label, description, value type (yes/no, number, amount,
  days, text), display order, active. Admins add new kinds in the panel; values are validated by type and shown to
  parents on the plan card.
- **Built-in features are enforced** by the backend (definitions marked `enforced`, which admins cannot retire):
  `max_children` (per family on the plan), `allowed_days` (pickup days), `max_leave_days_per_month`,
  `cancellation_allowed` (parents cancelling in the app), `priority_delivery` (allocation, ADR-0023) and
  `live_tracking` (snapshot and STOMP subscription). `refund_policy` is text shown before paying.
- **Plan settings** as columns: visibility (listed or hidden), free trial days (one trial per family; the plan starts
  active without a payment and renews from Plans), fixed duration in paid periods (then the plan ends instead of
  lapsing), and a subscriber limit. Partial updates keep every setting they do not mention.
- **Coupons** (`coupons`, `coupon_redemptions`): percent (with an optional cap) or flat, valid dates, total uses, plan
  restriction, first plan only, active. A coupon is checked when the parent asks for a quote or opens a checkout,
  priced into the Razorpay order (₹1 always remains), stored as the order's expected amount (the webhook compares the
  paid amount with it), and redeemed once per family when the payment is confirmed. Checks are rate-limited per parent.

**Not built.** Add-ons with their own price and automatic renewals: prepaid billing (ADR-0018) charges once per period,
and auto-debit needs Razorpay Subscriptions (`lunchbox.billing.mode=subscription`, already supported, without coupons).
Text and amount features added by admins are shown, not enforced, because their meaning is not known to the code.

**Consequences.** New kinds of features are a panel action. Enforced features need code by definition; the list is in
`PlanFeatures` and tested in `CouponAndFeatureRulesTest`, `PlanServiceTest`, `LeaveServiceTest` and
`PrepaidBillingTest`.
