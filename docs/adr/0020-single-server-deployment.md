# ADR-0020: One server with Docker Compose instead of Terraform/ECS

**Status:** Accepted by the owner on 2026-11-15 (to keep the AWS bill low for the pilot).

**Context.** The brief specified ECS Fargate, RDS Multi-AZ with a read replica, ElastiCache, Amazon MQ, an ALB,
CloudFront, WAF, Secrets Manager and KMS, all in Terraform. Sized down for a pilot that is still about
₹20,000–25,000 a month (the managed database, the broker, the load balancer and the NAT gateway are fixed costs that
do not shrink with traffic). A pilot with one school needs a fraction of that capacity.

**Decision.**
- Production runs on **one Lightsail (or EC2) server in ap-south-1**, 4 GB / 2 vCPU, about $24 a month, with
  `deploy/docker-compose.prod.yml`: the backend image, PostgreSQL 16 + PostGIS, Redis, RabbitMQ (STOMP plugin) and
  **Caddy**, which gets and renews HTTPS certificates and serves the admin static site with the security headers that
  CloudFront used to add.
- Only Caddy is reachable from outside (80/443); the API's actuator is hidden except `/actuator/health`.
- Secrets live in `/opt/lunchbox/.env` on the server (mode 600), not Secrets Manager. Handover photos stay in a
  private S3 bucket, accessed with an IAM key limited to that bucket (`S3_ACCESS_KEY` / `S3_SECRET_KEY`).
- Backups: nightly `deploy/backup.sh` (`pg_dump`, 14 days kept, optional copy to S3) plus Lightsail snapshots.
- CI/CD: the **Deploy** workflow is run by hand. It builds the image with Jib, pushes it to GitHub Container Registry,
  scans it with Trivy, builds the admin site, copies everything over SSH, restarts with `docker compose up -d` and
  waits for health `UP`. The ECS/S3/CloudFront deploy and the Terraform CI job are removed.
- `infra/terraform` is deleted. It is in git history if it is wanted again.
- RazorpayX payouts and MSG91 SMS may run in a new `off` mode in the prod profile (no automatic payouts: riders are
  paid by hand and recorded as adjustments; no SMS fallback: push only). Fakes are still refused in prod.

**Consequences.**
- Cost drops to roughly ₹2,000–4,500 a month.
- One machine is a single point of failure: no Multi-AZ, no rolling deploys (20–40 s of downtime per deploy, so deploy
  outside the delivery window), and a lost disk means restoring the last backup or snapshot. Acceptable for a pilot;
  not for the 99.9 % target in the brief.
- No WAF; rate limiting stays in the application (token buckets in Redis).
- Nothing in the code depends on this choice. Every connection is an environment variable, so moving the database to
  RDS, Redis to ElastiCache and RabbitMQ to Amazon MQ, or running several backend copies behind a load balancer, needs
  configuration only. Infrastructure as code can come back with that move.
