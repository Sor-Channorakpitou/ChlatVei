#!/usr/bin/env bash
# Rebuilds the DEMO database (chlatvei_demo) used by the browser tests and screenshots.
# It only ever drops chlatvei_demo; development (chlatvei) and test (chlatvei_test) data are untouched.
#
# Usage (from the repo root, with Docker running and the backend stopped):
#   E2E_ADMIN_PASSWORD='choose-a-demo-password' bash frontend/e2e/reset-demo.sh
# Then start the backend against the demo DB (see docs/frontend/README.md) and run:
#   node frontend/e2e/prepare-demo.mjs
set -euo pipefail

DB=chlatvei_demo
: "${E2E_ADMIN_PASSWORD:?Set E2E_ADMIN_PASSWORD}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

docker exec chlatvei-postgres-1 psql -q -U chlatvei -d chlatvei -c "DROP DATABASE IF EXISTS ${DB} WITH (FORCE);"
docker exec chlatvei-postgres-1 psql -q -U chlatvei -d chlatvei -c "CREATE DATABASE ${DB};"

cd "$ROOT/backend"
export DATABASE_URL="postgresql://chlatvei:chlatvei_dev@localhost:55432/${DB}"
npx prisma migrate deploy
npm run seed
ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-demo-admin@chlatvei.local}" ADMIN_PASSWORD="$E2E_ADMIN_PASSWORD" ADMIN_NAME="Demo Admin" npm run create-admin
echo "Demo database ready: ${DB}"
