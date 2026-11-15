#!/bin/sh
# Nightly database backup: dump, compress, keep 14 days locally, and copy to S3 when BACKUP_BUCKET is set.
# Install on the server:  crontab -e  →  30 2 * * * /opt/lunchbox/backup.sh >> /opt/lunchbox/backup.log 2>&1
set -eu
cd "$(dirname "$0")"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="backups/lunchbox-$stamp.sql.gz"
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U lunchbox -d lunchbox --format=plain | gzip -9 > "$file"
find backups -name 'lunchbox-*.sql.gz' -mtime +14 -delete
if [ -n "${BACKUP_BUCKET:-}" ]; then
  aws s3 cp "$file" "s3://$BACKUP_BUCKET/db/" --only-show-errors
fi
echo "backup ok: $file"
