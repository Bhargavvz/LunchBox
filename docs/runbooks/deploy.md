# Runbook: provisioning and deploying

## One-time per AWS account

1. `cd infra/terraform/bootstrap && terraform init && terraform apply -var github_repository=<owner>/<repo>`
   creates the state bucket, lock table and the GitHub OIDC deploy role.
2. In Route 53, create (or delegate) the hosted zone. Request ACM certificates: the API domain in **ap-south-1**,
   the admin domain in **us-east-1** (CloudFront requirement).
3. Firebase: create one project per environment, enable Phone and Email/Password providers, upgrade to Identity
   Platform and enable **TOTP** multi-factor. Create a service account with *Firebase Authentication Admin* and keep
   its JSON for the app secret.

## Per environment

1. `cd infra/terraform/envs/<env> && cp terraform.tfvars.example terraform.tfvars` and fill it in.
2. `terraform init && terraform apply`. The first apply needs any existing image for `backend_image`; CI replaces it.
3. Fill the application secret `lunchbox-<env>/app` in Secrets Manager. **Every key listed in
   `stack/main.tf → app_secret_keys` must exist** (use an empty string for an unused one), otherwise ECS cannot start
   the task:
   - `LUNCHBOX_PII_KEY`, `LUNCHBOX_QR_SIGNING_KEY`: `openssl rand -base64 32` (store safely; losing the PII key
     makes encrypted columns unreadable)
   - `FIREBASE_CREDENTIALS_JSON`: the service-account JSON (one line)
   - Razorpay, RazorpayX, MSG91 (DLT template ids), Exotel, IDfy, Sentry values
4. In GitHub, create environments `staging` and `prod` (add required reviewers to `prod`) with variables:
   `AWS_DEPLOY_ROLE_ARN`, `API_URL`, `WS_URL`, `ADMIN_BUCKET`, `ADMIN_DISTRIBUTION_ID`, `FIREBASE_*`,
   `GOOGLE_MAPS_WEB_KEY`.
5. Configure webhooks: Razorpay → `https://<api>/api/v1/webhooks/razorpay`, RazorpayX →
   `https://<api>/api/v1/webhooks/razorpayx`, using the secrets stored above.
6. Set `BOOTSTRAP_SUPER_ADMIN_EMAIL` once (task environment override) to create the first super admin, then remove it.

## Routine deploys

- Merge to `main` → **Deploy** workflow builds with Jib, Trivy-scans, rolls out to staging ECS (circuit breaker
  rolls back on failed health checks) and publishes the admin site.
- Promote to prod with *Run workflow → environment: prod* (requires approval).
- Flyway migrations run on application start. Migrations must be backward compatible with the previous release
  (expand → deploy → contract) because old and new tasks overlap during a rolling deploy.

## Rollback

- Backend: re-run the deploy workflow for the previous commit, or in ECS update the service to the previous task
  definition revision. Never roll back a migration by hand; ship a forward fix.
- Admin: re-run the deploy for the previous commit (static files) and invalidate CloudFront.
- Mobile: `eas update --branch production --message "rollback"` republishes the previous JS bundle.
