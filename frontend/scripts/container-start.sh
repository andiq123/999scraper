#!/bin/sh

set -eu

lockfile_hash="$(sha256sum package-lock.json | cut -d ' ' -f 1)"
install_stamp="node_modules/.package-lock.sha256"

if [ ! -f "$install_stamp" ] || [ "$(cat "$install_stamp")" != "$lockfile_hash" ]; then
  echo "Synchronizing frontend dependencies with package-lock.json..."
  npm ci
  printf '%s\n' "$lockfile_hash" > "$install_stamp"
fi

exec npm start -- --poll 500
