#!/bin/sh
set -eu

# Coolify injects the laptop .env (localhost, PORT=3003, MINIO_PORT=9100).
# Inside Compose those must be the other containers and port 3000.

export NODE_ENV=production
export PORT=3000

if [ -n "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed 's/@localhost:/@postgres:/g; s/@127.0.0.1:/@postgres:/g')"
else
  export DATABASE_URL="postgresql://${POSTGRES_USER:-skladnik}:${POSTGRES_PASSWORD:-skladnik}@postgres:5432/${POSTGRES_DB:-skladnik}"
fi

if [ -n "${REDIS_URL:-}" ]; then
  export REDIS_URL="$(printf '%s' "$REDIS_URL" | sed 's@://localhost:@://redis:@g; s@://127.0.0.1:@://redis:@g')"
else
  export REDIS_URL="redis://redis:6379"
fi

case "${MINIO_ENDPOINT:-}" in
  localhost | 127.0.0.1 | "") export MINIO_ENDPOINT=minio ;;
esac

# Host mapping is 9100:9000; the MinIO process always listens on 9000 in-network.
export MINIO_PORT=9000

echo "Starting API on :${PORT} db=${DATABASE_URL%%@*}@…"
npx prisma migrate deploy
exec node dist/main.js
