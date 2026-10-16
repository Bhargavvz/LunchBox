# Runbook: load testing

Targets: API p95 < 300 ms; live location end-to-end < 3 s at **10,000 concurrent tracked deliveries**.

Run against **staging** sized like production (never production).

## Prepare data

1. In staging, create test schools and a service area (admin console).
2. Create N test partners (admin API `POST /api/v1/admin/partners`), approve their KYC with the fake KYC provider
   (document numbers not starting with `FAIL` verify), schedule shifts for today.
3. Register parents with Firebase test phone numbers (Firebase console → *Phone numbers for testing*) and create
   children, addresses and subscriptions (staging uses Razorpay test mode).
4. `POST /api/v1/admin/jobs/generate-orders?date=<today>` and `POST /api/v1/admin/jobs/auto-assign?date=<today>`;
   start each partner's shift and route.
5. Collect fresh ID tokens (valid 1 h) into `load/tokens.json`:
   `[{ "partnerToken": "...", "parentToken": "...", "orderId": "..." }]`.

## Run

```bash
k6 run -e WS_URL=wss://api.staging.lunchbox.in/ws -e PARTNERS=2000 -e PARENTS=10000 load/tracking.js
k6 run -e API_URL=https://api.staging.lunchbox.in -e RPS=500 load/orders-api.js
```

Both scripts fail the run if their thresholds are not met (`tracking_end_to_end_ms p95 < 3000`,
`http_req_duration p95 < 300`). Watch the Grafana *LunchBox · Overview* dashboard and CloudWatch alarms during the run,
and record results in `docs/PROGRESS.md`.

Note: the WAF rate rule (3,000 requests / 5 min / IP) will block a single k6 host; run from several hosts or add a
temporary WAF exception for the load-generator IPs.
