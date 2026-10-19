#!/bin/bash
# Remove the plugin completely. Wiki data is untouched (the plugin never writes to it).
set -euo pipefail
OW=${OW:-/root/otterwiki}
cd "$OW"
cp Dockerfile.api "Dockerfile.api.bak-$(date +%Y%m%d-%H%M%S)"
sed -i '/# >>> otterwiki-obsidian/,/# <<< otterwiki-obsidian/d' Dockerfile.api
docker compose build web
docker compose up -d web
echo "removed. Optional: rm -rf $OW/otterwiki-obsidian"
