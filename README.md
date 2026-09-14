# Skladnik

Infrastructure skeleton (stage 0): Turborepo with a Vite web app, NestJS API, shared package, and Dockerized Postgres / MinIO / Redis.

The API listens on **3001** so it does not collide with other local apps on 3000.

## Full app (`docker-compose.yml`)

Runs Postgres, Redis, MinIO, the API, and the web UI in this one file:

```bash
cp .env.example .env
npm install
docker compose up --build
```

- Web: http://localhost:5173
- API: http://localhost:3001/health
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

## Dev infra only (`docker-compose.dev.yml`)

Starts Postgres, Redis, and MinIO. Run the API and web on the host for hot-reload:

```bash
cp .env.example .env
npm install
npm run infra:up
npm run db:migrate
npm run dev
```

Or in one step: `npm run dev:all`.

If the API container from the full stack is still running, stop it first so port 3001 is free:

```bash
docker compose stop api web
```

## Probe endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API + Postgres + Redis + MinIO + Prisma |
| `POST` | `/test-upload` | multipart field `file` → private MinIO object |
| `GET` | `/test-download/:key` | stream object through the API |
| `GET` | `/test-signed-url/:key` | time-limited signed URL (raw `publicUrl` should 403) |
| `POST` | `/test-job` | enqueue a throwaway BullMQ job |
| `GET` | `/test-job/:id` | job state |

## Layout

```
apps/web          Vite + React + TypeScript
apps/api          NestJS
packages/shared   code imported by both apps (Zod schemas land here later)
```

`Ping` in Prisma is a throwaway connectivity table. Replace it when stage 1 models land.
