# Skladnik

Turborepo with a Vite web app, NestJS API (JWT auth + tenant isolation), shared package, and Dockerized Postgres / MinIO / Redis.

The stack uses **5176** (web), **3003** (API), and **9100/9101** (MinIO) so it does not collide with other apps on 5173, 3000/3001, or 9000.

## Full app (`docker-compose.yml`)

Runs Postgres, Redis, MinIO, the API, and the web UI in this one file:

```bash
cp .env.example .env
npm install
docker compose up --build
```

- Web: http://localhost:5176
- API: http://localhost:3003/health
- MinIO S3: http://localhost:9100
- MinIO console: http://localhost:9101 (`minioadmin` / `minioadmin`)

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

If the API container from the full stack is still running, stop it first so port 3003 is free:

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

Auth cookies, JWT secrets, and the Prisma schema live in `apps/api`. After migrate + seed, prove tenant isolation with `npm run auth:prove`.

## Auth

Signup creates a `Company` and an `Owner` in one transaction. Sessions are JWTs in httpOnly cookies (15-minute access + 7-day refresh stored in Redis). Every authenticated query is scoped to `companyId` from the token — never from the request body.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/signup` | `{ email, password, name, companyName }` → Owner + Company |
| `POST` | `/auth/login` | `{ email, password }` |
| `POST` | `/auth/refresh` | rotate tokens from refresh cookie |
| `POST` | `/auth/logout` | revoke refresh token, clear cookies |
| `GET` | `/auth/me` | current session |
| `GET` | `/tenancy/snapshot` | company-scoped counts (isolation check) |
| `GET` | `/tenancy/sites` | sites visible to this user |
| `GET` | `/tenancy/sites/:siteId` | 403 if the site is outside company or assignment |
| `GET` | `/tenancy/owner-only` | `@Roles('OWNER')` probe |

Seed users (password `DevPassword123!`):

- `owner-a@skladnik.dev` — Metro Corner Market (all sites)
- `manager-a@skladnik.dev` — Metro Corner Market (Main Store only)
- `owner-b@skladnik.dev` — Riverside Cafe (all sites)

```bash
npm run db:migrate
npm run db:seed
npm run auth:prove
```

`Ping` is gone; it was replaced by the core tenant schema.

## Docker (Mac laptop → Linux server)

# Images **never copy your Mac `node_modules`**. `.dockerignore` excludes them, and both Dockerfiles run `npm ci` inside Linux Alpine from `package-lock.json`. That is what compiles `bcrypt` and Prisma engines for the server, not for darwin.

Coolify should **build on the Linux host** (`docker compose up --build`). Do not copy an image built on your Mac onto an Intel VPS — let Coolify build there so `bcrypt` and Prisma match the server CPU.

Local Mac check:

```bash
docker compose build
```

That produces a Linux container for your Mac’s CPU (Apple Silicon → linux/arm64). The production server does the same install for linux/amd64. Both work because install happens **inside** the image.

## Coolify

Build succeeded; the API then went **unhealthy** because Coolify injects the laptop `.env` into the container (`DATABASE_URL=…@localhost`, `PORT=3003`, `MINIO_PORT=9100`). Those values are for `npm run dev` on your Mac, not for containers talking to each other.

In Coolify environment variables:

1. **NODE_ENV** — `production`, **Runtime only** (uncheck “Available at Buildtime”).
2. **WEB_ORIGIN** — your public site URL (`https://your-domain`).
3. Prefer **not** to copy `DATABASE_URL` / `REDIS_URL` / `MINIO_ENDPOINT` from `.env`. Compose already points them at `postgres`, `redis`, and `minio`. The API entrypoint also rewrites `localhost` → those hostnames if Coolify still injects them.

Redeploy after this commit. If it still fails, open the **api** container logs — `prisma migrate deploy` or MinIO bucket setup will be the first error.


