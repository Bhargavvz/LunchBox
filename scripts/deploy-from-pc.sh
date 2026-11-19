#!/usr/bin/env bash
# Deploys the backend and the admin site from this PC to the single server over SSH (ADR-0020), without GitHub
# Actions or a container registry: the backend image is built with Jib into a tar, copied and loaded on the server.
#
#   scripts/deploy-from-pc.sh <server-ip> <path-to-key.pem> [api-domain] [admin-domain]
#
# Domains default to the free sslip.io names for the IP (api.<ip>.sslip.io, admin.<ip>.sslip.io).
# The server must already have Docker and /opt/lunchbox/.env (see docs/runbooks/aws-setup.md); this script never
# writes secrets. Run from Git Bash at the repository root with JDK 21 available.
set -euo pipefail

IP=${1:?server IP}
KEY=${2:?path to the .pem key}
DASHED=${IP//./-}
API_DOMAIN=${3:-api.$DASHED.sslip.io}
ADMIN_DOMAIN=${4:-admin.$DASHED.sslip.io}
TARGET=ubuntu@$IP
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$TARGET")
TAG=$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- backend || echo "-dirty")

echo "== Backend image lunchbox/backend:$TAG"
(cd backend && JIB_IMAGE=lunchbox/backend IMAGE_TAG=$TAG ./gradlew.bat --no-daemon -q jibBuildTar -x test)

echo "== Admin site for https://$API_DOMAIN"
NEXT_PUBLIC_API_URL=https://$API_DOMAIN NEXT_PUBLIC_WS_URL=wss://$API_DOMAIN/ws NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR= \
  pnpm --filter @lunchbox/admin build >/dev/null

echo "== Copying to $IP"
"${SSH[@]}" 'test -f /opt/lunchbox/.env || { echo "/opt/lunchbox/.env is missing"; exit 1; }; mkdir -p /opt/lunchbox/rabbitmq'
scp -i "$KEY" -q backend/build/jib-image.tar "$TARGET:/opt/lunchbox/backend-image.tar"
scp -i "$KEY" -q deploy/docker-compose.prod.yml deploy/Caddyfile deploy/backup.sh "$TARGET:/opt/lunchbox/"
scp -i "$KEY" -q deploy/rabbitmq/enabled_plugins "$TARGET:/opt/lunchbox/rabbitmq/"
tar -czf - -C apps/admin/out . | "${SSH[@]}" 'cd /opt/lunchbox && rm -rf admin.new && mkdir admin.new && tar -xzf - -C admin.new'

echo "== Restarting"
"${SSH[@]}" bash -s <<EOF
set -euo pipefail
cd /opt/lunchbox
sudo docker load -i backend-image.tar >/dev/null && rm backend-image.tar
# Caddy bind-mounts ./admin: replace the files inside it (renaming the folder would leave Caddy on the old one).
rm -rf admin.old && mkdir -p admin && cp -a admin admin.old && find admin -mindepth 1 -delete && cp -a admin.new/. admin/ && rm -rf admin.new
chmod +x backup.sh
sed -i '/^BACKEND_IMAGE=/d' .env && echo "BACKEND_IMAGE=lunchbox/backend:$TAG" >> .env
sudo docker compose -f docker-compose.prod.yml up -d --remove-orphans
for i in \$(seq 1 40); do
  if sudo docker compose -f docker-compose.prod.yml exec -T caddy wget -qO- http://backend:8080/actuator/health 2>/dev/null | grep -q '"UP"'; then
    echo "backend healthy"; sudo docker image prune -f >/dev/null; exit 0
  fi
  sleep 5
done
echo "backend did not report UP within 200 s"; sudo docker compose -f docker-compose.prod.yml logs --tail 80 backend; exit 1
EOF
echo "Done: https://$API_DOMAIN/actuator/health and https://$ADMIN_DOMAIN"
