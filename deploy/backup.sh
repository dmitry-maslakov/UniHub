#!/bin/sh
# Nightly from cron, e.g. 30 3 * * * /srv/unihub/deploy/backup.sh /srv/backups
# The database first, then the files: content is stored before the database
# refers to it, so every hash in the dump is in the copy. Files never change,
# so the copy only adds new ones. Keep the folder off this server too, and
# deploy/.env with it (losing BETTER_AUTH_SECRET signs everyone out).
set -eu
cd "$(dirname "$0")"
dest=$(realpath "${1:-./backups}")
mkdir -p "$dest/blobs"

docker compose exec -T postgres pg_dump -U unihub -Fc unihub \
  >"$dest/db-$(date +%F).dump"
# GNU cp: -n merges into what's there (busybox's skips the whole folder)
docker run --rm -v unihub_blobs:/from:ro -v "$dest/blobs":/to debian:stable-slim \
  cp -an /from/blobs/. /to/

# two weeks of dumps
find "$dest" -name 'db-*.dump' -mtime +14 -delete
