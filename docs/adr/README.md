# Architecture decision records

| # | Decision |
|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith, package-by-feature |
| [0002](0002-firebase-auth.md) | Firebase Auth for identity, LunchBox DB for authorisation |
| [0003](0003-transactional-outbox.md) | Transactional outbox for domain events |
| [0004](0004-stomp-broker-relay.md) | STOMP with RabbitMQ broker relay (dot-separated destinations) |
| [0005](0005-redis-tracking-state.md) | Redis hot tracking state, batched ping persistence |
| [0006](0006-or-tools-routing.md) | OR-Tools PDPTW with heuristic fallback |
| [0007](0007-uuidv7-keys.md) | UUIDv7 primary keys |
| [0008](0008-pii-encryption.md) | Application-level PII column encryption |
| [0009](0009-reports-from-replica.md) | Reports read the replica directly |
| [0010](0010-third-party-fakes.md) | Third parties behind interfaces with fakes |
| [0011](0011-static-admin.md) | Static-export admin on S3 + CloudFront |
| [0012](0012-money-ledger.md) | Paise integers and an append-only ledger |
| [0013](0013-library-additions.md) | Libraries added beyond the fixed stack |
| [0014](0014-delivery-ratings.md) | Parent ratings of deliveries |
| [0015](0015-tiffin-design-system.md) | Tiffin design system across mobile and admin |
| [0016](0016-ink-and-mango-design-system.md) | "Ink & Mango" design system across mobile and admin |
| [0017](0017-box-marks.md) | Box marks on lunchboxes |
| [0018](0018-prepaid-billing-via-orders.md) | Prepaid lunch plans paid through Razorpay Orders |
| [0019](0019-no-call-masking-or-document-kyc.md) | No masked calling (Exotel) and no document KYC (IDfy) |
| [0020](0020-single-server-deployment.md) | One server with Docker Compose instead of Terraform/ECS |
| [0021](0021-firebase-storage-for-handover-photos.md) | Handover photos in Firebase Storage instead of Amazon S3 |
| [0022](0022-chalk-and-turmeric-design-system.md) | "Chalk & Turmeric" design system for the apps and the admin panel |
| [0023](0023-rider-allocation-engine.md) | Rider allocation as a min-cost assignment with batching, fairness and reliability |
| [0024](0024-configurable-plans-and-coupons.md) | Configurable plans: feature definitions, enforced entitlements and coupons |
