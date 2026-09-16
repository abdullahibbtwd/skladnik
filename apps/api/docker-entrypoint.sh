#!/bin/sh
set -eu

# Coolify passes the laptop .env (localhost, PORT=3003, MINIO_PORT=9100).
# Ignore those hosts: Compose DNS is always postgres / redis / minio, and
# this process must bind 3000 (the published host port is 3003).

export NODE_ENV=production
export PORT=3000
export SKLADNIK_IN_DOCKER=1

USER_NAME="${POSTGRES_USER:-skladnik}"
PASSWORD="${POSTGRES_PASSWORD:-skladnik}"
DB_NAME="${POSTGRES_DB:-skladnik}"
export DATABASE_URL="postgresql://${USER_NAME}:${PASSWORD}@postgres:5432/${DB_NAME}"
export REDIS_URL="redis://redis:6379"
export MINIO_ENDPOINT=minio
export MINIO_PORT=9000
export MINIO_USE_SSL=false
export MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-${MINIO_ROOT_USER:-minioadmin}}"
export MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-${MINIO_ROOT_PASSWORD:-minioadmin}}"

echo "skladnik-api: port=${PORT} postgres=${USER_NAME}@postgres/${DB_NAME} redis=redis minio=${MINIO_ENDPOINT}:${MINIO_PORT}"

echo "skladnik-api: prisma generate"
if ! npx prisma generate; then
  echo "skladnik-api: prisma generate failed" >&2
  exit 1
fi

echo "skladnik-api: prisma migrate deploy"
if ! npx prisma migrate deploy; then
  echo "skladnik-api: prisma migrate deploy failed" >&2
  exit 1
fi

if [ -f dist/main.js ]; then
  exec node dist/main.js
fi
if [ -f dist/src/main.js ]; then
  exec node dist/src/main.js
fi

echo "skladnik-api: missing compiled entry (dist/main.js)" >&2
ls -la dist dist/src 2>/dev/null || true
exit 1
