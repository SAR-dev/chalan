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

---

## Rate Limiting

| Variable    | Required | Default | Description                                                                                          |
| ----------- | -------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `REDIS_URL` | No       | —       | Redis connection string. When set, API rate limits are shared across app instances; otherwise an in-memory store is used (single-instance dev). Ignored if the connection fails. |

---

## Storage

| Variable           | Required | Default | Description                       |
| ------------------ | -------- | ------- | --------------------------------- |
| `STORAGE_PROVIDER` | **Yes**  | `local` | One of: `local`, `r2`, `supabase` |

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

### Supabase (`STORAGE_PROVIDER=supabase`)

| Variable               | Required | Description                                                          |
| ---------------------- | -------- | -------------------------------------------------------------------- |
| `SUPABASE_URL`         | **Yes**  | Supabase project URL (Settings → API → Project URL)                  |
| `SUPABASE_SERVICE_KEY` | **Yes**  | `service_role` key (Settings → API → service_role). Server-side only |
| `SUPABASE_BUCKET`      | **Yes**  | Storage bucket name                                                  |
| `SUPABASE_PUBLIC_URL`  | **Yes**  | Public base URL for serving files from the bucket                    |

---

## Cron

| Variable                   | Required | Default | Description                                                                    |
| -------------------------- | -------- | ------- | ------------------------------------------------------------------------------ |
| `CRON_SECRET`              | **Yes**  | —       | Authenticates `/api/cron/*` endpoints. Generate with `openssl rand -base64 32` |
| `AUDIT_LOG_RETENTION_DAYS` | No       | `30`    | Days to retain audit logs. Older entries are cleaned daily                     |
| `EMAIL_LOG_RETENTION_DAYS` | No       | `10`    | Days to retain sent email logs. Failed emails are never deleted                |

---

## Tunnel

| Variable                  | Required | Default | Description                                       |
| ------------------------- | -------- | ------- | ------------------------------------------------- |
| `CLOUDFLARE_TUNNEL_TOKEN` | No       | —       | Cloudflare Tunnel token for exposing local server |

---

## App

| Variable               | Required | Default       | Description                                     |
| ---------------------- | -------- | ------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | **Yes**  | —             | Canonical public URL for SEO, OG tags, sitemaps |
| `NEXT_PUBLIC_ENV`      | **Yes**  | `development` | One of: `development`, `production`             |

---

## Testing

Set these locally when running e2e tests. The Playwright `webServer` sets them
automatically — you only need them for manual dev server invocations.

| Variable                   | Required | Default | Description                                                                      |
| -------------------------- | -------- | ------- | -------------------------------------------------------------------------------- |
| `MAIL_DISABLED`            | No       | —       | Set to `1` to skip all SMTP sends (avoids auth errors in dev/test)               |
| `AUTH_RATE_LIMIT_DISABLED` | No       | —       | Set to `1` to disable Better Auth rate limiting for the test suite               |
| `PLAYWRIGHT_BASE_URL`      | No       | —       | Override the base URL for Playwright tests (defaults to `http://localhost:3000`) |

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

## Multi-Instance (Docker compose cluster)

Per-role portal URLs for multi-container deployments. `ALLOWED_ROLE` is set automatically per-container.

| Variable        | Required | Default                 | Description                                                                                    |
| --------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `DASHBOARD_URL` | **Yes**  | `http://localhost:3001` | Dashboard portal URL                                                                           |
| `MERCHANT_URL`  | **Yes**  | `http://localhost:3002` | Merchant portal URL                                                                            |
| `RIDER_URL`     | **Yes**  | `http://localhost:3003` | Rider portal URL                                                                               |
| `WAREHOUSE_URL` | **Yes**  | `http://localhost:3004` | Warehouse portal URL                                                                           |
| `ALLOWED_ROLE`  | No       | —                       | Restrict to one role: `dashboard`, `merchant`, `rider`, `warehouse`. Leave empty for all roles |
