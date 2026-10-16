# Runbook: incidents

Morning delivery window (09:00–13:00 IST, Mon–Sat) is the critical period. Child safety issues take priority over
everything else.

## SOS / partner emergency

1. The alert appears on the admin dashboard (*Alerts*) and as a notification to every ops admin.
2. Call the partner from the admin partner page (direct number) and, if needed, emergency services (112).
3. *Issues & SOS* → **Acknowledge**. If lunchboxes are on board, inform the school(s) and parents; cancel or
   reassign affected orders from *Orders*.
4. **Resolve** with a note. Everything is in the audit log.

## Delivery failures spike (`delivery-failures` alarm)

- *Reports → Failed deliveries by reason* shows the cause (e.g. school gate closed). Contact the school; consider a
  holiday entry if the school is closed (this cancels remaining pickups and notifies parents).

## Unassigned orders after cut-off

- Dashboard *Unassigned* > 0, or `OrdersUnassignedAfterCutoff`. Schedule more shifts (*Partners → Shifts*) and press
  *Orders → Auto-assign*, or assign manually. Partners need spare capacity and a shift for that date.

## Live tracking degraded

- Check RabbitMQ (`mq-queue-depth` alarm, Amazon MQ console) and Redis memory. The API keeps working without live
  pushes; apps fall back to polling snapshots every 30–60 s.
- `TrackingIngestSlow`: scale the ECS service (`desired_count`) and check Redis latency.

## Outbox publish failures

- Notifications and earnings lag while events wait in `outbox_events`; nothing is lost. Fix broker connectivity; the
  relay retries automatically (up to 20 attempts per event). Inspect stuck rows:
  `SELECT event_type, attempts, last_error FROM outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 50;`
- Messages that exhausted consumer retries are in the `*.dlq` queues; after fixing the cause, move them back with
  the RabbitMQ shovel plugin.

## Payment or payout discrepancies

- Every Razorpay/RazorpayX webhook is stored in `webhook_events` (raw payload). Payouts can only be created once per
  partner and period, and ledger entries are idempotent — re-running *Payouts → Run* is safe.

## Data subject requests (DPDP)

- Parents can export and delete in the app. For requests by email, verify identity via the registered phone number,
  then act through the parent's account (support cannot impersonate; escalate to the DPO).
