#!/bin/sh
# Nightly database backup: dump, compress, keep 14 days on the server. The EBS snapshot policy (aws-setup.md)
# copies the whole disk off the machine every night.
# Install on the server:  crontab -e  →  30 2 * * * /opt/lunchbox/backup.sh >> /opt/lunchbox/backup.log 2>&1
set -eu
cd "$(dirname "$0")"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="backups/lunchbox-$stamp.sql.gz"
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U lunchbox -d lunchbox --format=plain | gzip -9 > "$file"
find backups -name 'lunchbox-*.sql.gz' -mtime +14 -delete
echo "backup ok: $file"
