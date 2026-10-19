#!/bin/bash
# Install on the Otterwiki VM (docker compose setup in /root/otterwiki).
# Idempotent. Backs up app-data and Dockerfile.api first. Safe: touches only
# the marked block in Dockerfile.api; wiki data is a bind mount and is never modified.
set -euo pipefail
OW=${OW:-/root/otterwiki}
cd "$OW"
[ -d otterwiki-obsidian ] || { echo "put this folder at $OW/otterwiki-obsidian first"; exit 1; }

B=/root/backup-obsidian-$(date +%Y%m%d-%H%M%S); mkdir -p "$B"
tar czf "$B/app-data.tgz" -C "$OW" app-data
cp Dockerfile.api "$B/Dockerfile.api"
echo "backup in $B"

if ! grep -q ">>> otterwiki-obsidian" Dockerfile.api; then
cat >> Dockerfile.api <<'EOF'

# >>> otterwiki-obsidian (delete this block to uninstall, see otterwiki-obsidian/CLAUDE.md)
COPY otterwiki-obsidian /tmp/otterwiki-obsidian
RUN /opt/venv/bin/pip install --no-cache-dir /tmp/otterwiki-obsidian && rm -rf /tmp/otterwiki-obsidian
# <<< otterwiki-obsidian
EOF
fi
docker compose build web
docker compose up -d web
sleep 8
docker compose ps web
docker logs --tail 5 otterwiki-web-1 2>&1 | grep -i "plugin\|error" || true
