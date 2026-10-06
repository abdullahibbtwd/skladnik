# Skladnik architecture

Multi-tenant ERP for Bulgarian shops and cafés. This document covers the runtime layout, auth realms, and the SaaS subscription system.

## Runtime layout

| Piece | Role |
| --- | --- |
| `apps/web` | Vite + React SPA / PWA. Talks to the API only through same-origin proxies (Vite/nginx). |
| `apps/api` | NestJS API, Prisma, BullMQ workers (OCR), Resend mail, cron jobs. |
| `packages/shared` | Shared types and pure helpers (roles, VAT, entitlement, invoice totals, reminder day math). |
| Postgres | Source of truth for tenants, stock ledger, subscriptions, platform invoices. |
| Redis | Refresh-token sessions, BullMQ, create idempotency keys, TOTP replay / reveal lockout. |
| MinIO | Private invoice photo/PDF objects (tenant OCR). |

Local ports (dev): web `5176`, API `3003`, Postgres `5432`, Redis `6379`, MinIO `9100`/`9101`.

## Auth realms

Every HTTP controller method must be classified with `@Public()`, `@Tenant()`, or `@Platform()`. `AuthRealmGuard` default-denies unclassified routes.

| Realm | Cookies | JWT secrets | Audience | Who |
| --- | --- | --- | --- | --- |
| Tenant | `skladnik_access` / `skladnik_refresh` | `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `skladnik-tenant` | Company users |
| Platform | `skladnik_platform_*` | `JWT_PLATFORM_*` | `skladnik-platform` | Platform operators (`PlatformAdmin`) |
| Public | none required | — | — | Login, signup, password reset, invite preview |

Tenant and platform tokens must never cross: platform routes reject tenant JWTs and the reverse. Platform login requires TOTP (AES-GCM encrypted secret at rest). First admin: `npm run platform:create-admin`.

Tenant queries always take `companyId` from the authenticated user, never from the client body/query for tenancy.

## Subscriptions (SaaS)

### Models

- **Subscription** — plan (`STARTER` / `PRO` / `MULTI_LOCATION`), status lifecycle, `maxUsers`, `termMonths`, `expiresAt`, optimistic `version`.
- **ActivationCode** — HMAC-SHA256 of Crockford base32+checksum plaintext (`ACTIVATION_CODE_PEPPER`). Optional AES-256-GCM `codeCiphertext` (`ACTIVATION_CODE_ENCRYPTION_KEY`, AAD = code id, key-id prefix) only while the subscription is `PENDING`. Cleared on redeem, revoke, regenerate, expiry cron.
- **Invoice** — immutable snapshot (seller/buyer/lines/amounts). Statuses `ISSUED` → `PAID` \| `VOID` only (`PAID` → `VOID` forbidden). DB trigger rejects DELETE and snapshot UPDATEs. `CHECK (totalMinor = subtotalMinor + vatMinor)`.
- **InvoiceNumberCounter** — year-scoped sequential counter (calendar year in `Europe/Sofia`); numbers like `PI-2026-000001` with unique index on `number`.
- **SubscriptionEvent** — append-only history (DB trigger), including invoice and reveal events.
- **PlatformAuditLog** — operator actions + security alerts (failed redemptions, code reveals).

One live subscription per company (partial unique index on live statuses). `PENDING` is unbound; `REVOKED` frees the slot.

### Lifecycle

| Path | Behaviour |
| --- | --- |
| New signup (email / Google) | 14-day `TRIAL` (`STARTER`, seat cap 5). |
| Platform create | Same TX: `PENDING` subscription + ciphertext code + `ISSUED` invoice. Requires seller identity in platform Settings. Optional `Idempotency-Key`. |
| Paid activate | Owner posts one-time code → atomic redeem → `ACTIVE`, `expiresAt` from `termMonths`; ciphertext wiped. |
| Status change | `POST …/transition` with `version` (409 on stale). Reason required for `SUSPENDED` / `REVOKED`. Shared state machine in `@skladnik/shared`. Legacy suspend/unsuspend/revoke delegate here. |
| Mark invoice paid | Event stores payment reference + date. **Does not** activate the subscription. |
| Expiry / suspend | `resolveEntitlement` → `read_only` (reads + exports + activate). Mutations return **402** `SUBSCRIPTION_REQUIRED`. |
| Seats | Enforced at invite **accept** with row lock on the subscription. **402** `SUBSCRIPTION_SEAT_LIMIT` when full. |

Shared helpers: `resolveEntitlement`, `canTransitionSubscriptionStatus`, `computeInvoiceTotals` / VAT half-up in `@skladnik/shared`.

### Platform invoices & PDF

- Seller identity from `PlatformBillingSettings` (editable in `/platform/settings`). Create refuses to issue if incomplete.
- VAT rule: `vatMinor = roundHalfUp(subtotalMinor × vatRate% / 100)`; `totalMinor = subtotal + vat`.
- PDF via **pdfkit** + bundled DejaVuSans (`apps/api/assets/fonts/DejaVuSans.ttf`) for Cyrillic. Download is platform-only with `Cache-Control: no-store`.
- Corrections: void + new invoice (no edit of issued snapshot).

### Activation code reveal

- `POST …/reveal-code` with **inline** `totpCode` (no session step-up claim).
- Rejects reused TOTP timesteps (Redis); rate-limited + failure lockout.
- Audited (`PlatformAuditLog` + `CODE_REVEALED` event — never plaintext).
- Response `Cache-Control: no-store`; client keeps plaintext in ephemeral UI state only.
- Daily cron sweeps stale ciphertext (expired / non-`PENDING` / redeemed / revoked).

### HTTP enforcement

`SubscriptionGuard` (APP_GUARD, after JWT/roles):

- Safe methods allowed when entitlement is `read_only`.
- Mutations blocked unless `@AllowWithoutSubscription()` (activate/current, export/compliance filings, logout, password reset).
- `SUBSCRIPTION_ENFORCE=false` switches back to shadow logging only.

Background jobs (OCR, company-scoped invite mail) call `assertCompanyCanWrite` so workers cannot bypass HTTP.

### Emails & reminders

| Email | Trigger |
| --- | --- |
| Expiry reminder | Daily cron (`@nestjs/schedule`, 08:00 UTC) for **30 / 14 / 7 / 1** days before `expiresAt`. Deduped via `SubscriptionEvent` `NOTE` payload. |
| Activation confirmation | After successful redeem, emailed to active company OWNERS. |
| Invite / password reset | Existing Resend flows (password reset is not entitlement-gated). |

Repeated failed redemptions on a known code hash increment `ActivationCode.failedAttempts`. At threshold **5**, a `PlatformAuditLog` (`ACTIVATION_FAILED_THRESHOLD`) and a subscription `NOTE` are written. Client responses stay generic (`ACTIVATION_FAILED`).

### UI

- Tenant: **Settings → Subscription** (plan, users, activate).
- Dashboard **expiring-soon banner** when `expiresAt` is within 30 days (or status is expired/suspended).
- Platform: `/platform` — create (invoice fields + idempotency), list inline status transitions, detail (reveal TOTP, invoices PDF / paid / void). Suspend/revoke warns when the invoice is `PAID` (no auto-void).

### Proof scripts & tests

```bash
npm run auth:prove           # tenant isolation + subscription isolation + activation race safety
npm run auth:prove-roles     # role matrix
npm run platform:create-admin
npm test --workspace=@skladnik/api   # includes invoice immutability, number concurrency, VAT, PDF smoke, reveal crypto, transition 409
```

## Security notes

- Never log activation plaintext. Create/regenerate/reveal return it only in the HTTP body; reveal requires fresh TOTP.
- Ciphertext uses a dedicated key (`ACTIVATION_CODE_ENCRYPTION_KEY`), separate from `PLATFORM_TOTP_ENCRYPTION_KEY`.
- Activation failures always look the same to the client.
- Platform TOTP secrets are encrypted at rest; tenant passwords use bcrypt.
- PWA: platform-auth and subscription mutation routes are NetworkOnly (no offline cache of codes or platform session).
