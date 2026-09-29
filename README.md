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
| `GET` | `/health/live` | Liveness |

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
| `GET`/`POST`/`PATCH`/`DELETE` | `/sites` | Company sites (Owner writes; others see assigned) |
| `GET`/`PATCH`/`DELETE` | `/users` | Company users — Owner only |
| `GET`/`POST` | `/invites` | Pending invites — Owner only; public `GET /invites/:token` |
| `POST` | `/auth/signup-with-invite` | Join an existing company from an invite token |

Invites are emailed with **Resend** (`RESEND_API_KEY`). If the key is missing, the invite is still created and the owner gets a copyable `/signup?invite=` link.

Seed users (password `DevPassword123!`):

- `owner-a@skladnik.dev` — Metro Corner Market (all sites)
- `manager-a@skladnik.dev` — Metro Corner Market (Main Store only)
- `owner-b@skladnik.dev` — Riverside Cafe (all sites)

Demo companies with a month of history (invoices, a transfer, write-offs, till sales, recipes, expiring batches, low stock):

- `demo-owner@skladnik.dev` — Demo Mini Market (all sites)
- `demo-manager@skladnik.dev` — Demo Mini Market (Main Store only)
- `demo-cashier@skladnik.dev` — Demo Mini Market till (Main Store only)
- `demo-storekeeper@skladnik.dev` — Demo Mini Market (Warehouse only)
- `demo-accountant@skladnik.dev` — Demo Mini Market (accountant)
- `cafe-owner@skladnik.dev` — Demo Café (all sites)
- `cafe-barista@skladnik.dev` — Demo Café till (Café Bar only)

```bash
npm run db:migrate
npm run db:seed                 # safe to re-run; history is written once
SEED_RESET=1 npm run db:seed    # rebuild the demo companies with dates relative to today
npm run auth:prove
```

On a Docker deployment the image has no TypeScript sources, so the seed runs the compiled copy in `dist/seed/`:

```bash
docker compose exec -e SEED_DEMO=1 -e SEED_PASSWORD='choose-one' api npm run db:seed
```

`Ping` is gone; it was replaced by the core tenant schema.

## Docker (Mac laptop → Linux server)

Images **never copy your Mac `node_modules`**. `.dockerignore` excludes them, and both Dockerfiles run `npm ci` inside Linux Alpine from `package-lock.json`. That is what compiles `bcrypt` and Prisma engines for the server, not for darwin.

Coolify should **build on the Linux host** (`docker compose up --build`). Do not copy an image built on your Mac onto an Intel VPS — let Coolify build there so `bcrypt` and Prisma match the server CPU.

Local Mac check:

```bash
docker compose build
```

That produces a Linux container for your Mac’s CPU (Apple Silicon → linux/arm64). The production server does the same install for linux/amd64. Both work because install happens **inside** the image.

## Coolify

Coolify injects the laptop `.env` (`DATABASE_URL=…@localhost`, `PORT=3003`, `MINIO_PORT=9100`, `NODE_ENV=development`). Those values are for `npm run dev` on your Mac. The API entrypoint always uses Compose DNS (`postgres`, `redis`, `minio`) and binds **3000** inside the container.

In Coolify environment variables:

1. **NODE_ENV** — `production`, **Runtime only** (uncheck “Available at Buildtime”). The build warning is expected if it stays checked; images still install devDependencies.
2. **WEB_ORIGIN** — your public site URL (`https://your-domain`).
3. You can leave `DATABASE_URL` / `REDIS_URL` / `MINIO_*` as in `.env`. The entrypoint overwrites hosts and in-network ports.

Every API container start runs `prisma generate` then `prisma migrate deploy` before the server listens.

Push, then redeploy. If it still fails, open the **api** container logs — look for `prisma generate failed`, `prisma migrate deploy failed`, or `skladnik-api: port=`.


