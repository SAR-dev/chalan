# Environment Variables

Copy `env.example` to `.env` and fill in your values:

```sh
cp env.example .env
```

---

## Quick Start (local dev)

```sh
DATABASE_URL=postgres://postgres:admin@localhost:5432/b2b_delivery
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ENV=development
CRON_SECRET=$(openssl rand -base64 32)
```

---

## Database

| Variable                 | Required | Default | Description                                                      |
| ------------------------ | -------- | ------- | ---------------------------------------------------------------- |
| `DATABASE_URL`           | **Yes**  | —       | PostgreSQL connection string `postgres://user:pass@host:port/db` |
| `DATABASE_URL_READ_ONLY` | No       | —       | Read-replica for GET queries. Falls back to `DATABASE_URL`       |

For local development, spin up a Postgres instance with:

```bash
docker compose -f compose.postgres.yml up -d --build
```

This creates a database with the defaults matching the Quick Start example above
and automatically enables `pg_trgm`, `unaccent`, `pgcrypto`, `btree_gin`,
`pg_stat_statements`, and `pg_cron`.

---

## Auth (Better Auth)

| Variable                   | Required | Default                | Description                                                                            |
| -------------------------- | -------- | ---------------------- | -------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`       | **Yes**  | —                      | Auth signing key. Min 32 chars. Generate with `openssl rand -base64 32`                |
| `BETTER_AUTH_ALLOWED_URLS` | No       | —                      | Comma-separated origins for callbacks & CSRF. Required for multi-subdomain deployments |

---

## Mail

The SMTP connection lives in the database (Super Admin → Settings → SMTP Server), but its
password is encrypted at rest using an env-provided AES-256-GCM key:

| Variable           | Required     | Default | Description                                                                   |
| ------------------ | ------------ | ------- | ----------------------------------------------------------------------------- |
| `SMTP_SECRET_KEY`  | **Yes** (prod) | —     | 64-hex-char AES-256-GCM key for SMTP passwords at rest. `openssl rand -hex 32` |
| `MAIL_DISABLED`    | No           | —       | Set to `1` to skip all SMTP sends (avoids auth errors in dev/test)            |
| `LOG_EMAIL_BODY`   | No           | —       | Set to `1` to add the (redacted + truncated) message body to the `Sending email` log line. **Off by default** — the body carries customer content, so stdout stays envelope-only (ROADMAP P4.4). The full body is always available in the admin-only Email Logs page. |

Each email is sent **once** — there is no retry and no outbox requeue/backoff.
Every send attempt is recorded in `email_log` (SENT or FAILED); failed mails
are kept in the DB for review/manual re-send (the success-only cleanup cron
never deletes them). Only the plain-text version of the body is stored — the
HTML is not persisted.

---

## Rate Limiting

| Variable    | Required | Default | Description                                                                                          |
| ----------- | -------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `REDIS_URL` | No       | —       | Redis connection string. When set, API rate limits are shared across app instances; otherwise an in-memory store is used (single-instance dev). Ignored if the connection fails.  **In production an unset value is reported on `/api/health` (`rateLimiter.degraded: true`) and logged once at boot** - limits are then per-instance, so a multi-instance deploy can be bypassed. |

---

## Security

| Variable             | Required | Default   | Description                                                                                                                                                                                                                                                                                        |
| -------------------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUSTED_PROXY_HOPS` | No       | `0`       | How many reverse-proxy hops sit in front of the app. Forwarding headers (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`) are **only trusted when this is set** (ROADMAP P0.6): the client IP is taken from the entry the last trusted hop appended, so a client cannot forge a fresh rate-limit bucket or forge its way past `ADMIN_IP_ALLOWLIST`. Single nginx = `1`; Cloudflare + nginx = `2`. Unset/`0` = no proxy, the headers are ignored. |
| `ADMIN_IP_ALLOWLIST` | No       | disabled  | Comma-separated IPs/CIDRs allowed to reach the admin portal: paths starting with `/dashboard` and `/api/admin` (e.g. `203.0.113.5,10.0.0.0/8,2001:db8::/32`). Exact IPv4/IPv6 and CIDR ranges are supported; `*` allows any IP. Unset or empty disables the check entirely (default — e2e and dev are unaffected). Invalid entries are ignored (boot fails if none are valid). Requests from other IPs get `403` and are logged. Other admin-gated APIs are not covered — they rely on role authz.  **Requires `TRUSTED_PROXY_HOPS`**: the allowlist reads the client IP from proxy headers, so the app must sit behind a proxy that overwrites them - otherwise every request resolves to "unknown" and is denied. |
| `ADMIN_2FA_REQUIRED` | No       | `0`       | Set to `1` to make two-factor authentication mandatory for admin roles (`SUPER_ADMIN`, `WAREHOUSE_ADMIN`): **enforced server-side**: while it is on, an unenrolled admin session is refused by every API route and every server-rendered page (`requireSession()` returns no session) and unenrolled admins are redirected to their account page's Two-factor tab until enrolled. Read at request time by `/api/users/me` — changing it requires a restart/redeploy (env, not DB). Merchants and riders can always opt into 2FA themselves and are never affected by this flag. |

---

## Storage

| Variable           | Required | Default | Description                       |
| ------------------ | -------- | ------- | --------------------------------- |
| `STORAGE_PROVIDER` | **Yes**  | `local` | One of: `local`, `r2` |

### Local (`STORAGE_PROVIDER=local`)

| Variable            | Required | Default      | Description                |
| ------------------- | -------- | ------------ | -------------------------- |
| `LOCAL_UPLOADS_DIR` | **Yes**  | `./.uploads` | Directory for file uploads |

### Cloudflare R2 (`STORAGE_PROVIDER=r2`)

| Variable               | Required | Description                                     |
| ---------------------- | -------- | ----------------------------------------------- |
| `R2_ACCOUNT_ID`        | **Yes**  | Cloudflare Account ID (dashboard right sidebar) |
| `R2_ACCESS_KEY_ID`     | **Yes**  | R2 API token access key                         |
| `R2_SECRET_ACCESS_KEY` | **Yes**  | R2 API token secret                             |
| `R2_BUCKET_NAME`       | **Yes**  | R2 bucket name                                  |
| `R2_PUBLIC_URL`        | **Yes**  | Public URL (r2.dev subdomain or custom domain)  |

---

## Cron

| Variable                     | Required | Default | Description                                                                                     |
| ---------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------- |
| `CRON_SECRET`                | **Yes**  | —       | Authenticates `/api/cron/*` endpoints. Generate with `openssl rand -base64 32`                  |
| `AUDIT_LOG_RETENTION_DAYS`   | No       | `30`    | Days to retain audit logs. Older entries are cleaned daily                                      |
| `EMAIL_LOG_RETENTION_DAYS`   | No       | `10`    | Days to retain sent email logs. Failed emails are never deleted                                 |
| `UPLOAD_SWEEP_MIN_AGE_HOURS` | No       | `48`    | Hours an unreferenced upload must age before `/api/cron/cleanup-uploads` may delete it          |

`/api/cron/cleanup-uploads` (ROADMAP 5.6 — storage hygiene) is scheduled via
crontab / the Docker cron container (pg_cron cannot make HTTP calls, so it is
not in `scripts/setup-pg-cron.sql`), and is **not** in `vercel.json` (same
free-plan limit as the audit/email jobs — call it manually or from an external
scheduler there). It supports `?dryRun=1`, which reports what would be deleted
without deleting anything — run that first, for a while, before enabling
deletes.

---

## Tunnel

| Variable                  | Required | Default | Description                                       |
| ------------------------- | -------- | ------- | ------------------------------------------------- |
| `CLOUDFLARE_TUNNEL_TOKEN` | No       | —       | Cloudflare Tunnel token for exposing local server |

---

## App

| Variable                | Required | Default       | Description                                                                                         |
| ----------------------- | -------- | ------------- | --------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`  | **Yes**  | —             | Canonical public URL for SEO, OG tags, sitemaps                                                     |
| `NEXT_PUBLIC_ENV`       | **Yes**  | `development` | One of: `development`, `production`. Also the seeded-demo switch: `development` enables (1) a "sign in as" dropdown on `/login` listing one seeded account per role (Super Admin, Warehouse Admin, Merchant, Rider), (2) a top "demo server" banner that notes the daily reset, and (3) a scheduled reset to the basic seed dataset at 12:00 AM local time every day (see `src/lib/demo-reset.ts`; SMTP `mail_config` rows survive the reset). The picker publishes seed credentials, so this must never be `development` in production. Read at render time, so flipping it only needs a reload. |
| `NEXT_PUBLIC_BASE_URL`  | No       | (same origin) | Absolute base URL for browser auth API calls (`forgot-password`). Must be a valid http(s) URL when set. |

---

## Testing

Set these locally when running e2e tests or manual dev-server test runs.
Playwright's `webServer` sets `AUTH_RATE_LIMIT_DISABLED=1` and
`LOG_EMAIL_BODY=1` automatically for the suite; the other variables are for
manual invocations only.

> Do **not** set `MAIL_DISABLED=1` for the e2e suite. It makes `sendMail` return
> as a *success*, so the outbox row is deleted and no `email_log` record is
> written — the specs that read activation/verification links out of
> `email_log` (S42, S47) and the outbox assertions (S52) depend on the
> "attempted, logged as FAILED, kept for review" path.

| Variable                   | Required | Default | Description                                                    |
| -------------------------- | -------- | ------- | -------------------------------------------------------------- |
| `MAIL_DISABLED`            | No       | —       | Set to `1` to skip all SMTP sends (avoids auth errors in dev/test) |
| `AUTH_RATE_LIMIT_DISABLED` | No       | —       | Set to `1` to disable Better Auth rate limiting (webServer sets this for the e2e suite; set manually for other test runs) |
| `LOG_EMAIL_BODY`           | No       | —       | Set to `1` to log the redacted mail body on each send. Off by default; the e2e suite turns it on so a failing run shows the mail in the server console. The specs read links from `email_log` either way. |

> There is no env var for the seed password: every account created by
> `pnpm db:seed:full` gets the well-known `12qwaszx`, and both seed entrypoints
> refuse to run when `NODE_ENV=production`. Change
> `SEED_PASSWORD` in `src/lib/db/seed/seed-content/credentials.ts` if you need
> a different dev password.

---

## Secrets on disk

`.env` is git-ignored and must stay that way (`git status` should never list an
env file). `.env.example` contains placeholders only — every real secret lives
in the deployment's own secret store, and `SMTP_SECRET_KEY` /
`BETTER_AUTH_SECRET` / `CRON_SECRET` are validated at boot
(`src/lib/env.ts`). If a secret is ever pasted into a tracked file, treat it as
compromised: rotate it, then remove the value from the file.

---

## Postgres Cluster (Docker compose only)

Required when deploying with `docker/compose.monolith.yml` or `docker/compose.cluster.yml`. See `DEPLOYMENT.md`.

| Variable                       | Required | Default | Description                                   |
| ------------------------------ | -------- | ------- | --------------------------------------------- |
| `POSTGRESQL_POSTGRES_PASSWORD` | **Yes**  | —       | Superuser password for the PostgreSQL cluster |
| `POSTGRESQL_USERNAME`          | **Yes**  | —       | Application database user                     |
| `POSTGRESQL_PASSWORD`          | **Yes**  | —       | Application database password                 |
| `POSTGRESQL_DATABASE`          | **Yes**  | —       | Application database name                     |
| `REPMGR_PASSWORD`              | **Yes**  | —       | Repmgr replication password                   |
| `PGPOOL_ADMIN_PASSWORD`        | **Yes**  | —       | Pgpool admin password                         |

---

## Deployment (portal modes)

One codebase ships as three deployment shapes, selected at runtime by the
server-only `PORTAL_MODE` (never `NEXT_PUBLIC_...` — the browser never reads it
directly; it learns the answer from `portalAllowed` on `/api/users/me`).
Changing the value needs a **restart** (env, not DB).

| `PORTAL_MODE`     | Portals served            | Roles allowed                        | Intended deployment                                        |
| ----------------- | ------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `admin`           | Dashboard + Warehouse     | `SUPER_ADMIN`, `WAREHOUSE_ADMIN`     | Internal ops instance                                      |
| `public`          | Merchant + Rider          | `MERCHANT`, `RIDER`                  | Internet-facing, customer self-onboarding                  |
| `all` *(default)* | everything                | all four roles                       | Single instance / dev — unset = zero behavior change       |

Notes:

- **Default is `all`** — leaving the var unset serves every portal (dev/e2e
  unaffected). Unset/invalid values fall back to `all` (strict validation in
  `src/lib/env.ts` refuses to boot on a typo).
- **`public` is a deployment name, not a role** — it maps to the `MERCHANT` +
  `RIDER` roles (the customer-facing side of the product).
- **Precedence with `ALLOWED_ROLE` (see Multi-Instance below):**
  `ALLOWED_ROLE` > `PORTAL_MODE`. `ALLOWED_ROLE` (when set) still restricts a
  container to its single role, and `PORTAL_MODE` is an additional *group*
  filter — when both are set a request must satisfy **both**.
- Enforcement: disabled portals' pages `404` at the edge (`src/proxy.ts`), and
  their roles get `401` from `requireSession()` on API calls (the sign-in flow
  additionally signs such sessions out with a clear message). Shared surfaces
  (`/login`, `/register`, `/track`, `/help`, `/apply`, public APIs)
  stay reachable in every mode.

---

## Multi-Instance (Docker compose cluster)

Per-role portal URLs for multi-container deployments. `ALLOWED_ROLE` is set automatically per-container.

| Variable        | Required | Default                 | Description                                                                                    |
| --------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `DASHBOARD_URL` | **Yes**  | `http://localhost:3001` | Dashboard portal URL                                                                           |
| `MERCHANT_URL`  | **Yes**  | `http://localhost:3002` | Merchant portal URL                                                                            |
| `RIDER_URL`     | **Yes**  | `http://localhost:3003` | Rider portal URL                                                                               |
| `WAREHOUSE_URL` | **Yes**  | `http://localhost:3004` | Warehouse portal URL                                                                           |
| `ALLOWED_ROLE`  | No       | —                       | Restrict to one role: `dashboard`, `merchant`, `rider`, `warehouse`. Leave empty for all roles |
