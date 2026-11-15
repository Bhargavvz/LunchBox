# Going live on one server (owner's checklist)

Everything server-side runs on **one EC2 machine in Mumbai** with Docker: the backend, PostgreSQL + PostGIS, Redis,
RabbitMQ and Caddy (HTTPS and the admin website). Handover photos go to **Firebase Storage**
(`lunchboxappv1.firebasestorage.app`, asia-south2), so the server needs no other AWS service.
Why: [ADR-0020](../adr/0020-single-server-deployment.md) and [ADR-0021](../adr/0021-firebase-storage-for-handover-photos.md).

**Cost on the AWS free plan.** Accounts opened after 15 July 2025 get credits ($100, up to $200 with the onboarding
tasks) that last **6 months**; the server's hours are paid from those credits. The chosen **`m7i-flex.large`**
(2 vCPU, 8 GB, free-plan eligible) costs roughly $0.09 an hour, so with its 30 GB disk, IPv4 address and snapshots
about **$70/month: $100 of credit lasts about 6 weeks, $200 about 3 months**. Check the exact rate on the launch
screen. To make the credit last the full 6 months, use `t3.small` (2 GB, about $22/month) and delete the four memory
lines in `.env`; the compose file falls back to 2 GB settings. Stop the instance when you are not testing: a stopped
instance costs only its disk and IP. Steps marked **(you)** need your accounts. Never paste
keys or passwords into a chat: put them in the server's `.env` yourself.

## 1. AWS account (you, ~20 min)
1. Sign up at aws.amazon.com and choose the **Free plan**. Do the onboarding tasks in *Explore AWS* for the extra
   credit.
2. Turn on **MFA** for the root user (top-right menu → Security credentials → Assign MFA device).
3. Billing → Budgets → *Zero spend budget* and a *Monthly cost budget* of $25, alerts to your email.
4. Set the console region to **Asia Pacific (Mumbai) ap-south-1**.

## 2. The server (you, ~15 min)
1. EC2 → **Launch instance**: name `lunchbox`, **Ubuntu Server 24.04 LTS (x86)**, instance type **m7i-flex.large**
   (marked *Free tier eligible*; or `t3.small`, see the cost note above). Create a key pair (`.pem`) and keep it safe.
2. Network settings → security group: allow **SSH 22 from My IP**, **HTTP 80** and **HTTPS 443** from anywhere.
3. Storage: **30 GiB gp3**.
4. Only for `t3.small`: Advanced details → **Credit specification: Standard** (*Unlimited* can bill extra CPU).
5. Launch, then EC2 → Elastic IPs → **Allocate** → *Associate* with the instance, so the address never changes.
6. **Backups of the whole disk:** EC2 → Lifecycle Manager → *Create EBS snapshot policy* → target the instance's
   volume (tag it `backup=daily`), every 24 h, keep 7.

## 3. Domain and DNS (you)
At your registrar add two **A records** pointing at the Elastic IP: `api.<your-domain>` and `admin.<your-domain>`.
Caddy gets HTTPS certificates for both automatically once they resolve.

## 4. Photo storage: Firebase Storage (you, ~5 min; the bucket already exists)
1. Leave the Storage security rules in **production mode** (deny all). The backend hands out signed links that
   Cloud Storage checks itself; apps never use the Firebase Storage SDK.
2. Google Cloud console → Cloud Storage → bucket `lunchboxappv1.firebasestorage.app` → **Lifecycle** → *Add a rule*:
   action **Delete object**, conditions **Age 90 days** and **Object name matches prefix `handover/`**. This is the
   90-day photo retention in `docs/security.md`.
3. Nothing to add to `.env` beyond `STORAGE_BUCKET`: the backend signs with the Firebase service-account key.

## 5. Prepare the server (Claude can do this over SSH, or you paste it)
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker
sudo mkdir -p /opt/lunchbox && sudo chown ubuntu:ubuntu /opt/lunchbox
# 2 GB swap absorbs memory spikes (needed on t3.small, harmless on m7i-flex.large)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
```
If the GitHub repository is **private**, let the server pull the backend image: GitHub → Settings → Developer
settings → token with `read:packages` only, then on the server `docker login ghcr.io -u <github-user>` and paste the
token when asked.

## 6. The server's `.env` (you)
Copy `deploy/.env.example` to `/opt/lunchbox/.env` on the server, `chmod 600 .env`, and fill it in:
- `API_DOMAIN`, `ADMIN_DOMAIN` from step 3.
- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `RABBIT_PASSWORD`, `LUNCHBOX_PII_KEY`, `LUNCHBOX_QR_SIGNING_KEY`: a new
  `openssl rand -base64 32` each. **Keep a copy of the PII key offline**: losing it makes encrypted data unreadable.
- `FIREBASE_CREDENTIALS_JSON`: the service-account JSON on one line inside single quotes (sign-in, push and photos).
- `STORAGE_BUCKET=lunchboxappv1.firebasestorage.app` (already in the template).
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (test keys until launch), `RAZORPAY_WEBHOOK_SECRET` (step 9).
- `RAZORPAYX_MODE=off` and `MSG91_MODE=off` until you have those accounts: riders are paid by hand and there is no
  SMS fallback (push still works).
- `BOOTSTRAP_SUPER_ADMIN_EMAIL`: your admin email for the first start only.

## 7. GitHub (you)
Repository → Settings → Environments → New environment **`production`** (add yourself as required reviewer).
- **Variables:** `API_URL=https://api.<domain>`, `WS_URL=wss://api.<domain>/ws`, `FIREBASE_WEB_API_KEY`,
  `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` (Firebase web app config),
  `GOOGLE_MAPS_WEB_KEY`, and optionally `DEPLOY_PATH` (default `/opt/lunchbox`).
- **Secrets:** `SSH_HOST` (the Elastic IP), `SSH_USER` (`ubuntu`), `SSH_KEY` (a key made for deploys:
  `ssh-keygen -t ed25519 -f lunchbox-deploy`, put the `.pub` line in the server's `~/.ssh/authorized_keys`),
  `SSH_KNOWN_HOSTS` (output of `ssh-keyscan <Elastic IP>`).

## 8. Deploy
Push to `main` yourself, then Actions → **Deploy** → *Run workflow*. It builds the backend image (pushed to GitHub
Container Registry, free), builds the admin site, copies both to the server and restarts the containers, then waits
until `/actuator/health` is `UP`. Repeat this for every release.

## 9. After the first deploy
1. `https://api.<domain>/actuator/health` shows `UP`; `https://admin.<domain>` opens the login page.
2. Firebase → Authentication → Users → Add user with the bootstrap email; sign in at the admin site and set up TOTP.
   Then empty `BOOTSTRAP_SUPER_ADMIN_EMAIL` in `.env` and run
   `docker compose -f docker-compose.prod.yml up -d` in `/opt/lunchbox`.
3. Firebase → Authentication → Settings → **Authorized domains**: add `admin.<domain>`.
4. Razorpay → Webhooks → `https://api.<domain>/api/v1/webhooks/razorpay`, events `payment.captured` and
   `payment.failed`; put its secret in `RAZORPAY_WEBHOOK_SECRET` and restart as above.
5. **Database backups:** `crontab -e` on the server and add
   `30 2 * * * /opt/lunchbox/backup.sh >> /opt/lunchbox/backup.log 2>&1` (dumps kept 14 days; the snapshot policy
   from step 2 copies the disk off the machine).
6. Build test apps against the server: in `apps/parent/.env` and `apps/partner/.env` set
   `EXPO_PUBLIC_API_URL=https://api.<domain>` and `EXPO_PUBLIC_WS_URL=wss://api.<domain>/ws` (emulator variable
   empty, fake payments off), then `eas build --profile preview --platform android` in each app.

## Everyday operations (on the server, in `/opt/lunchbox`)
| Task | Command |
|---|---|
| Status and memory | `docker compose -f docker-compose.prod.yml ps` and `docker stats --no-stream` |
| Backend logs | `docker compose -f docker-compose.prod.yml logs -f --tail 200 backend` |
| Restart after editing `.env` | `docker compose -f docker-compose.prod.yml up -d` |
| Restore a backup | `gunzip -c backups/<file>.sql.gz \| docker compose -f docker-compose.prod.yml exec -T postgres psql -U lunchbox -d lunchbox` (into an empty database) |
| Disk space | `df -h` and `docker system df` |

**Changing size:** stop the instance, *Actions → Instance settings → Change instance type*, start it, and match the
memory lines in `.env` (8 GB: as in `.env.example`; 2 GB: delete them).
Growing further (managed database, several backend copies) needs no code change.
