# Runbook: deploying

Production runs on one server with Docker Compose (`deploy/`, [ADR-0020](../adr/0020-single-server-deployment.md)).
First-time setup of the server, DNS, photo bucket, `.env` and GitHub settings: [`aws-setup.md`](aws-setup.md).

## Routine deploys

1. Push to `main` (CI runs tests, lint and builds).
2. Actions → **Deploy** → *Run workflow* (environment `production`, needs your approval). It:
   - builds the backend image with Jib, pushes it to `ghcr.io/<owner>/<repo>/backend:<commit>` and Trivy-scans it;
   - builds the admin static site with the `production` environment's `FIREBASE_*`, `API_URL`, `WS_URL` variables;
   - copies `deploy/` and the admin site to the server over SSH, records the new image in `.env`,
     runs `docker compose pull && up -d`, and fails unless `/actuator/health` reports `UP` within 200 s.
- Flyway migrations run when the backend starts. The old container stops before the new one starts, so expect
  20–40 s of API downtime per deploy; deploy outside the 9:00–13:30 delivery window.
- Mobile JS changes: `eas update --branch production`. Native changes need a new store build.

## Rollback

- Backend: on the server, set `BACKEND_IMAGE` in `/opt/lunchbox/.env` to the previous tag
  (`docker image ls ghcr.io/*/backend`) and run `docker compose -f docker-compose.prod.yml up -d`. Or re-run the
  Deploy workflow on the previous commit. Never roll back a migration by hand; ship a forward fix.
- Admin: the previous site is kept in `/opt/lunchbox/admin.old`. Copy it back into place (Caddy bind-mounts
  `admin/`, so never rename the folder): `find admin -mindepth 1 -delete && cp -a admin.old/. admin/`.
- Mobile: `eas update --branch production --message "rollback"` republishes the previous JS bundle.

## Database

- Nightly `backup.sh` (cron) writes `backups/lunchbox-<time>.sql.gz` and keeps 14 days. The daily EBS snapshot
  policy copies the whole disk off the machine (restore: create a volume from a snapshot and attach it).
- Test a restore every month into a scratch database:
  `docker compose -f docker-compose.prod.yml exec postgres createdb -U lunchbox restore_test`, then pipe a dump into
  `psql -d restore_test`, check row counts, and drop it.
