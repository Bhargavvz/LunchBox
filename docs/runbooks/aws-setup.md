# Going live on one server (owner's checklist)

Everything server-side runs on **one Lightsail (or EC2) machine in Mumbai** with Docker: the backend, PostgreSQL +
PostGIS, Redis, RabbitMQ and Caddy (HTTPS and the admin website). Handover photos go to one private S3 bucket.
Why one server and what it gives up: [ADR-0020](../adr/0020-single-server-deployment.md).

**Monthly cost:** Lightsail 4 GB about $24 (~₹2,000) + S3 and data transfer (a few rupees at pilot volume) + domain.
Steps marked **(you)** need your accounts or a card. Never paste keys or passwords into a chat: put them in the
server's `.env` yourself.

## 1. AWS account (you, ~20 min)
1. Sign up at aws.amazon.com, add a card, verify your phone, pick the free **Basic support** plan.
2. Turn on **MFA** for the root user (top-right menu → Security credentials → Assign MFA device).
3. Billing → Budgets → *Monthly cost budget* ₹4,000, alert at 80 % to your email.
4. Set the console region to **Asia Pacific (Mumbai) ap-south-1**.

## 2. The server (you, ~10 min)
1. **Lightsail** → Create instance → Mumbai → *Linux/Unix* → *OS Only* → **Ubuntu 24.04 LTS** → plan **4 GB RAM,
   2 vCPU** ($24). Name it `lunchbox`. (2 GB works for a demo but is tight; Postgres, RabbitMQ and Java share it.)
2. Networking tab: **Create static IP** and attach it. Under *IPv4 Firewall* allow **HTTP 80** and **HTTPS 443**
   (SSH 22 is there already; restrict it to your IP if you can).
3. Download the default SSH key from Account → SSH keys, or connect with the browser terminal.

## 3. Domain and DNS (you)
At your registrar (or Route 53) add two **A records** pointing at the static IP:
`api.<your-domain>` and `admin.<your-domain>`. Caddy gets HTTPS certificates for both automatically once they resolve.

## 4. Photo bucket and a key that can only touch it (you, ~10 min)
1. S3 → Create bucket `lunchbox-handover-<something unique>` in ap-south-1. Keep **Block all public access** on and
   default encryption on. Management → Lifecycle rule: expire objects after **90 days**.
2. IAM → Users → Create user `lunchbox-server`, no console access. Permissions → *Create inline policy* → JSON:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
       "Resource": "arn:aws:s3:::lunchbox-handover-<something unique>/*"
     }]
   }
   ```
3. That user → Security credentials → **Create access key** → *Application running outside AWS*. These two values go
   into `.env` (step 6) as `S3_ACCESS_KEY` / `S3_SECRET_KEY`.
4. Bucket → Permissions → **CORS**, so the apps can upload straight to it:
   ```json
   [{ "AllowedMethods": ["PUT", "GET"], "AllowedOrigins": ["*"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3000 }]
   ```

## 5. Prepare the server (Claude can do this over SSH, or you paste it)
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker
sudo mkdir -p /opt/lunchbox && sudo chown ubuntu:ubuntu /opt/lunchbox
# 2 GB swap so a memory spike does not kill the database
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
If the GitHub repository is **private**, let the server pull the backend image: GitHub → Settings → Developer
settings → *Fine-grained token* (or classic with `read:packages` only), then on the server
`docker login ghcr.io -u <github-user>` and paste the token when asked.

## 6. The server's `.env` (you)
Copy `deploy/.env.example` to `/opt/lunchbox/.env` on the server, `chmod 600 .env`, and fill it in:
- `API_DOMAIN`, `ADMIN_DOMAIN` from step 3.
- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `RABBIT_PASSWORD`, `LUNCHBOX_PII_KEY`, `LUNCHBOX_QR_SIGNING_KEY`: a new
  `openssl rand -base64 32` each. **Keep a copy of the PII key offline**: losing it makes encrypted data unreadable.
- `FIREBASE_CREDENTIALS_JSON`: the service-account JSON on one line inside single quotes.
- `S3_HANDOVER_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` from step 4.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (test keys until launch), `RAZORPAY_WEBHOOK_SECRET` (step 9).
- `RAZORPAYX_MODE=off` and `MSG91_MODE=off` until you have those accounts: riders are paid by hand and there is no
  SMS fallback (push still works).
- `BOOTSTRAP_SUPER_ADMIN_EMAIL`: your admin email for the first start only.

## 7. GitHub (you)
Repository → Settings → Environments → New environment **`production`** (add yourself as required reviewer).
- **Variables:** `API_URL=https://api.<domain>`, `WS_URL=wss://api.<domain>/ws`, `FIREBASE_WEB_API_KEY`,
  `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` (Firebase web app config),
  `GOOGLE_MAPS_WEB_KEY`, and optionally `DEPLOY_PATH` (default `/opt/lunchbox`).
- **Secrets:** `SSH_HOST` (the static IP), `SSH_USER` (`ubuntu`), `SSH_KEY` (a private key made for deploys:
  `ssh-keygen -t ed25519 -f lunchbox-deploy`, put the `.pub` line in the server's `~/.ssh/authorized_keys`),
  `SSH_KNOWN_HOSTS` (output of `ssh-keyscan <static IP>`).

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
5. **Backups:** `crontab -e` on the server and add
   `30 2 * * * /opt/lunchbox/backup.sh >> /opt/lunchbox/backup.log 2>&1`. Also turn on Lightsail
   **automatic snapshots** (instance → Snapshots, about $2/month) so the whole server can be restored.
6. Build test apps against the server: in `apps/parent/.env` and `apps/partner/.env` set
   `EXPO_PUBLIC_API_URL=https://api.<domain>` and `EXPO_PUBLIC_WS_URL=wss://api.<domain>/ws` (emulator variable empty, fake payments off), then
   `eas build --profile preview --platform android` in each app.

## Everyday operations (on the server, in `/opt/lunchbox`)
| Task | Command |
|---|---|
| Status | `docker compose -f docker-compose.prod.yml ps` |
| Backend logs | `docker compose -f docker-compose.prod.yml logs -f --tail 200 backend` |
| Restart after editing `.env` | `docker compose -f docker-compose.prod.yml up -d` |
| Restore a backup | `gunzip -c backups/<file>.sql.gz \| docker compose -f docker-compose.prod.yml exec -T postgres psql -U lunchbox -d lunchbox` (into an empty database) |
| Disk space | `df -h` and `docker system df` |

Growing out of one server later (managed database, several backend copies) needs no code change: the same
environment variables point the backend at RDS, ElastiCache and Amazon MQ.
