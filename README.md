# Skladnik

Multi-tenant stock management for Bulgarian shops and cafés. Photograph a supplier invoice, let OCR fill in the lines, review, and post it to an immutable stock ledger. Stock leaves through write-offs, transfers, stocktakes, and a (non-fiscal) till. On top of the ledger sit reports, Excel/CSV exports, and the monthly VAT ledgers with NRA files.

Turborepo with a Vite + React web app, a NestJS API, a shared package, and Postgres / Redis / MinIO in Docker. The UI is in English and Bulgarian, prices are in euro, and the web app installs as a PWA.

## What's in it

| Area | Status |
| --- | --- |
| Signup, login, invites (emailed with Resend, or a copyable link), roles, sites, site assignments | Done |
| Catalog: product groups, partners, products, barcodes, supplier codes, unit aliases | Done |
| Documents: invoice, goods receipt, dispatch, credit note; photo / PDF capture, OCR auto-fill, review, post, cancel | Done |
| Stock: on hand per site, batches and expiry (FEFO), movement history, weighted-average cost, reorder suggestions | Done |
| Write-offs, transfers between sites, stocktake with variances, opening stock | Done |
| Till (`/app/pos`): barcode scanning, FEFO batches, cash / card, voids, day report, margins | Done, **non-fiscal** |
| Recipes (technological cards): cost per portion, margin, dish sales issue ingredients | Done |
| Reports with Excel / CSV / print, document archive ZIP, remappable CSV layouts | Done |
| VAT purchase / sales ledgers, monthly return, `DEKLAR.TXT` / `POKUPKI.TXT` / `PRODAGBI.TXT` | Done |
| Offline: app shell, read cache, invoice photo queue | Done (photos only; other writes need the network) |
| Annex 38 e-shop audit XML (NRA `dec_audit.xsd`) | Done (e-shops under Art. 3(17) of Н-18; not a warehouse register) |
| Fiscal printer / УНП / СУПТО | Not built |

## Layout

```
apps/api          NestJS API, Prisma schema + migrations, seed, proof scripts
apps/web          Vite + React 19 + Tailwind 4, i18n (en / bg), PWA service worker
packages/shared   roles, document types, VAT / compliance / report helpers used by both apps
```

| Layer | Technology |
| --- | --- |
| API | NestJS 11, Prisma 6, Passport (local + JWT), BullMQ, ioredis, AWS S3 SDK (MinIO), Resend, Zod |
| Web | React 19, Vite 7, React Router 7, TanStack Query 5, Zustand, i18next, vite-plugin-pwa |
| Data | PostgreSQL 16, Redis 7 (queue + refresh tokens), MinIO (private `invoices` bucket) |
| OCR | Z.AI GLM vision (`glm-5.3-flash`, falls back to `glm-4.6v-flash`) |

Node 22 (`.nvmrc`); `engines` requires ≥ 20.

## Local development

Runs Postgres, Redis, and MinIO in Docker (`docker-compose.dev.yml`) and the API and web on your machine with hot reload:

```bash
cp .env.example .env
npm install
npm run dev:all        # infra:up → db:wait → db:migrate → db:seed → dev
```

Or step by step:

```bash
npm run infra:up       # postgres, redis, minio
npm run db:migrate
npm run db:seed
npm run dev            # nest --watch + vite
```

| Service | URL |
| --- | --- |
| Web | http://localhost:5176 |
| API | http://localhost:3003/health |
| MinIO S3 | http://localhost:9100 |
| MinIO console | http://localhost:9101 (`minioadmin` / `minioadmin`) |

The ports are chosen so they don't collide with other apps on 5173, 3000/3001, or 9000. The browser never calls the API on another origin: Vite (dev) and nginx (Docker) proxy the API paths, so auth cookies stay first-party.

Phone on the same Wi-Fi: open `http://<lan-ip>:5176`. The live camera, install, and offline mode need HTTPS (or `localhost`).

After changing `packages/shared`, rebuild it (`npm run build --workspace=@skladnik/shared`); the API imports its `dist`.

Other infra commands: `npm run infra:down`, `npm run infra:logs`, `npm run db:migrate:dev` (create a new migration).

## Full stack in Docker (`docker-compose.yml`)

Builds and runs all five services: `postgres`, `redis`, `minio`, `api`, `web`. This file is written for Coolify: services only `expose` their ports inside the Compose network (`api:3000`, `web:80`, `minio:9000`) and **publish nothing on the host**. The web container's nginx proxies API paths to `api:3000`.

```bash
docker compose up --build
```

To reach it on your machine, add a `docker-compose.override.yml` (Compose loads it automatically; keep it out of the repo so Coolify doesn't pick it up):

```yaml
services:
  web:
    ports: ["5176:80"]
  api:
    ports: ["3003:3000"]
    environment:
      MINIO_PUBLIC_ENDPOINT: localhost
      MINIO_PUBLIC_PORT: "9100"
      MINIO_PUBLIC_USE_SSL: "false"
  minio:
    ports: ["9100:9000", "9101:9001"]
```

Every API container start runs `prisma generate` and `prisma migrate deploy` before the server listens. The entrypoint (`apps/api/docker-entrypoint.sh`) always uses the Compose hostnames (`postgres`, `redis`, `minio:9000`, no TLS) and port 3000, whatever `.env` says.

Images never copy your Mac's `node_modules`: `.dockerignore` excludes them and both Dockerfiles run `npm ci` inside Alpine Linux, so `bcrypt`, Prisma, and `@napi-rs/canvas` are built for the server's CPU. Build on the server; don't ship an image built on Apple Silicon to an amd64 VPS.

## Deploying on Coolify

1. Create a **Docker Compose** resource from this repo (`docker-compose.yml`).
2. Give each service a domain in the resource configuration. Add the container port when it isn't 80; Coolify still serves on 443 and forwards to that port:
   - `web`: `https://your-domain`
   - `minio`: `https://files.your-domain:9000` (only needed for signed MinIO links; the UI loads photos through the API)
   - `api` (optional, the web container already proxies it): `https://api.your-domain:3000`
3. Set the environment variables (Developer view lets you paste them all at once). Mark `NODE_ENV` **runtime only** (untick "Available at Buildtime").

```
NODE_ENV=production
WEB_ORIGIN=https://your-domain
COOKIE_SECURE=true

POSTGRES_USER=skladnik
POSTGRES_PASSWORD=<strong password>
POSTGRES_DB=skladnik

MINIO_ROOT_USER=<new username>
MINIO_ROOT_PASSWORD=<long random password>
MINIO_ACCESS_KEY=<same as MINIO_ROOT_USER>
MINIO_SECRET_KEY=<same as MINIO_ROOT_PASSWORD>
MINIO_BUCKET=invoices
MINIO_PUBLIC_ENDPOINT=files.your-domain
MINIO_PUBLIC_PORT=443
MINIO_PUBLIC_USE_SSL=true

JWT_ACCESS_SECRET=<random, 64+ chars>
JWT_REFRESH_SECRET=<different random, 64+ chars>
GOOGLE_CLIENT_ID=<optional Google OAuth web client id>

GLM_API_KEY=<Z.AI key>
RESEND_API_KEY=<optional, required for invite + password-reset emails>
RESEND_FROM_EMAIL=Skladnik <noreply@your-domain>
```

- Use a real domain with TLS before production (not a raw-IP `sslip.io` host). Set `WEB_ORIGIN` and `COOKIE_SECURE=true` to match.
- **Change the MinIO credentials.** Once `minio` has a domain it is reachable from the internet, and the defaults are `minioadmin` / `minioadmin`.
- `POSTGRES_PASSWORD` is only applied when the database volume is first created. Changing it later also needs an `ALTER USER` inside Postgres.
- `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `PORT`, and `WEB_PORT` are ignored in Docker; leave them out.
- `SERVICE_URL_*` / `SERVICE_FQDN_*` are generated by Coolify from the domains; don't set them by hand.

Push, then redeploy. If it fails, open the **api** logs and look for `skladnik-api: port=`, `prisma generate failed`, or `prisma migrate deploy failed`.

To load demo data on a server, open a terminal in the `api` container (or use `docker compose exec`). The image has no TypeScript sources, so the seed runs the compiled copy in `dist/seed/`, and it refuses to run in production without `SEED_DEMO=1`:

```bash
docker compose exec -e SEED_DEMO=1 -e SEED_PASSWORD='choose-one' api npm run db:seed
```

## Environment variables

One `.env` at the repo root, read by the API in local dev (see `.env.example`).

| Group | Variables |
| --- | --- |
| App | `NODE_ENV`, `PORT` (3003 locally), `WEB_PORT` (5176), `WEB_ORIGIN` (CORS, invite and password-reset links), `TRUST_PROXY` (optional) |
| Postgres | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `DATABASE_URL` |
| Redis | `REDIS_PORT`, `REDIS_URL` |
| MinIO (internal) | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_CONSOLE_PORT`, `MINIO_USE_SSL`, `MINIO_BUCKET` |
| MinIO (signed links for browsers) | `MINIO_PUBLIC_ENDPOINT`, `MINIO_PUBLIC_PORT`, `MINIO_PUBLIC_USE_SSL` (port and SSL default to the internal values) |
| Auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES` (15m), `JWT_REFRESH_EXPIRES` (7d), `COOKIE_SECURE`, `GOOGLE_CLIENT_ID` (optional) |
| OCR | `GLM_API_KEY` or `ZAI_API_KEY`, `GLM_BASE_URL`, `GLM_MODEL` |
| Email | `RESEND_API_KEY` (optional), `RESEND_FROM_EMAIL` |
| Seed | `SEED_PASSWORD`, `SEED_RESET=1`, `SEED_DEMO=1` (required when `NODE_ENV=production`) |

## Auth, tenancy, and roles

Signup creates a `Company` and its `Owner` in one transaction. Sessions are JWTs in httpOnly cookies: a 15-minute access token and a 7-day refresh token that rotates on every use and is stored in Redis. Login and signup are rate-limited per IP. Password reset sends a one-hour email link (via Resend) and revokes every refresh session for that user. Optional Google sign-in uses Google Identity Services: set `GOOGLE_CLIENT_ID` and add `WEB_ORIGIN` under Authorized JavaScript origins. Every query is scoped to the `companyId` from the token, never from the request body, and site managers and staff only see the sites they are assigned to.

| Capability | Owner | Accountant | Site manager | Staff |
| --- | :-: | :-: | :-: | :-: |
| Sites | all, edit | all | assigned | assigned |
| Users and invites | ✅ | — | — | — |
| Product groups, partners, unit aliases (write) | ✅ | ✅ | — | — |
| Product catalog (create, edit, archive, prices) | ✅ | ✅ | — | — |
| Product minimum stock | ✅ | ✅ | ✅ | — |
| Goods receipt / photo drafts → review; write-offs | ✅ | ✅ | ✅ | ✅ |
| Transfer, stocktake; post/cancel/reverse paper docs | ✅ | ✅ | ✅ | — |
| Opening stock | ✅ | — | — | — |
| Sell at the till; **own** day report | ✅ | ✅ | ✅ | ✅ |
| Site-wide sales, costs, margins, recipes, reports | ✅ | ✅ | ✅ | — |
| Change till price, void | ✅ | ✅ | ✅ | — |
| Bulk ZIP of original documents | ✅ | ✅ | — | — |
| VAT ledgers and NRA files | ✅ | ✅ | — | — |

Full paste-ready §3 text: [`docs/SPEC-SECTION-3-PERMISSIONS.md`](docs/SPEC-SECTION-3-PERMISSIONS.md).

## API

All routes need a session cookie except signup, login, refresh, logout, `GET /invites/:token`, and `/health`.

| Prefix | Purpose |
| --- | --- |
| `/auth` | `signup`, `signup-with-invite`, `login`, `refresh`, `logout`, `me` |
| `/sites`, `/users`, `/invites` | Company sites, users, and pending invites |
| `/product-groups`, `/partners`, `/products`, `/unit-aliases` | Catalog and master data |
| `/documents` | Drafts, lines, photo captures and OCR retry, submit, post, cancel, reverse, stocktake counts |
| `/stock` | On hand, movements, reorder suggestions |
| `/sales` | Till sales, voids, day report, margins |
| `/recipes` | Technological cards and the till's dish menu |
| `/reports`, `/export-profiles` | Reports and exports, document archive ZIP, CSV layouts |
| `/vat` | VAT settings, period ledgers, NRA files and filings, manual entries |
| `/annex38` | E-shop registration, monthly Annex 38 XML, filings archive (owner and accountant) |
| `/company` | Company profile, document numbering series, expiry thresholds, print template, till price roles |
| `/activity` | Append-only activity log with filters (owner and accountant) |
| `/tenancy` | Isolation probes (not used by the UI) |
| `/health`, `/health/live` | Postgres + Redis + MinIO + Prisma check; liveness |

New API prefixes must also be proxied in `apps/web/vite.config.ts` and `apps/web/nginx.conf`, or the web app gets a 404.

## Seed data

`npm run db:seed` is safe to re-run; history is written once. `SEED_RESET=1 npm run db:seed` rebuilds the demo companies with dates relative to today. The password for every seed user is `DevPassword123!` unless `SEED_PASSWORD` is set.

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

## Tests and scripts

| Command | What it does |
| --- | --- |
| `npm test --workspace=@skladnik/api` | Unit tests: posting rules, stock and costing, FEFO, OCR parsing and matching, recipes, reports, exports, compliance checksums, VAT ledgers and NRA file layouts |
| `npm run auth:prove` | Tenant isolation between the two seed companies |
| `npm run documents:prove` | Creates a draft, posts it, checks totals mismatch, duplicates, future/old dates, missing supplier, expired-batch confirmation |
| `node --env-file=../../.env scripts/fix-l110526.mjs` (in `apps/api`) | Dry-run (or `--apply`) data fix for invoice L110526 wrong line totals / date — see script header for options |
| `node --env-file=../../.env scripts/prove-annex38.mjs` (in `apps/api`) | Annex 38 end to end: e-shop settings, pre-checks, generate, SHA-256 archive, xmllint vs `dec_audit.xsd` |
| `npx dotenv -e .env -- npm run extract:image --workspace=@skladnik/api -- invoice.jpg` | Runs OCR on one image against the real GLM API |
| `npm run scans:cleanup --workspace=@skladnik/api [-- --apply]` | Lists (or cancels) old empty `SCAN-…` drafts |
| `npm run i18n:translate --workspace=@skladnik/web` | Regenerates `bg.json` from `en.json` with Google Translate (overwrites manual edits) |
| `npm run pwa:icons --workspace=@skladnik/web` | Regenerates the PWA icons |

There are no frontend or end-to-end tests yet.

## Known limits

- The till is not fiscal: no fiscal printer, УНП, or СУПТО. A business that must issue fiscal receipts still needs its fiscal device.
- One payment method per sale, voids only (no partial returns), and a sale or dish can't take stock below zero.
- The business day is fixed to `Europe/Sofia`. Periods are not locked, so a late document changes past reports.
- Annex 38 is the NRA e-shop audit file, not a stock register. Confirm with your accountant whether the shop falls under Art. 3(17) of Ordinance Н-18, and the payment-code and currency conventions, before filing.
- Offline, only invoice photos can be captured; other writes need the network.
