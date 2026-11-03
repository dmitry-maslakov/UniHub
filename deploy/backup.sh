#!/bin/sh
# Nightly from cron, as root (it reads the blobs volume), with rsync installed:
#   30 3 * * * /srv/unihub/deploy/backup.sh /srv/backups
# The database first, then the files: content is stored before the database
# refers to it, so every hash in the dump is in the copy. rsync copies only
# what's new or differs, so a file an earlier run cut off gets repaired.
# Keep the folder off this server too, and deploy/.env with it (losing
# BETTER_AUTH_SECRET signs everyone out). Restoring: see README.
set -eu
cd "$(dirname "$0")"
dest=$(realpath "${1:-./backups}")
mkdir -p "$dest/blobs"

docker compose exec -T postgres pg_dump -U unihub -Fc unihub \
  >"$dest/db-$(date +%F).dump"
# tmp/ holds uploads in progress
rsync -a --exclude /tmp/ \
  "$(docker volume inspect -f '{{ .Mountpoint }}' unihub_blobs)/blobs/" \
  "$dest/blobs/"

# two weeks of dumps
find "$dest" -name 'db-*.dump' -mtime +14 -delete
