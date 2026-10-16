# ADR-0010: Every third party behind an interface with a sandbox fake

**Status:** Accepted

**Decision.** `PaymentGateway`, `PayoutGateway`, `PushSender`, `SmsSender`, `CallMasking` and `KycProvider` each have
a live and a fake implementation selected by `lunchbox.integrations.<name>.mode`. The prod profile refuses to start
with any fake (`IntegrationModeGuard`). Outbound calls use Resilience4j retries (exponential backoff with jitter) and
circuit breakers. Non-idempotent calls (creating a Razorpay subscription, placing a masked call) are not retried
automatically; RazorpayX payouts are retried with an idempotency key.

**Consequences.** The whole flow runs locally and in CI without credentials. A local-profile endpoint simulates the
Razorpay checkout for the parent app.
