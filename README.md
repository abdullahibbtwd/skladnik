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
