# Demo data

Realistic sample data so every admin page and chart can be tried: 4 schools in Hyderabad, 40 families (54 children,
plans, 108 payments), 12 riders with 30 days of shifts, about 1,200 orders with ratings and failures, allocation runs
with decisions, and a few resolved rider issues.

## Load

Admin panel → **Settings → Demo data → Load demo data** (super admin), or:

```
POST /api/v1/admin/demo-data
```

## Remove (one step, demo rows only)

Admin panel → **Settings → Demo data → Remove demo data**, or:

```
DELETE /api/v1/admin/demo-data
```

Every demo row is listed in `demo_records (table_name, record_id)`; removal deletes exactly those rows (and their order
history, decisions, shifts and assignments) and nothing else. `GET /api/v1/admin/demo-data` shows what is loaded.

## Why it is safe on a live server

- Demo schools, the demo plan and the demo coupon are **inactive**: parents never see or buy them, and no orders are
  generated for them.
- Demo riders are approved but **inactive**: they cannot sign in (no Firebase account) or be given real orders.
- No demo order is waiting to be allocated (`SCHEDULED`/`REASSIGNED`), so allocation jobs never touch them.
- Rows are written with plain SQL: no notifications, payouts or events fire.
- Names are prefixed "Demo ·" where they could be confused with real ones (schools, plan).
