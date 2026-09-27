# Deployment

The app ships as a single Next.js standalone image (`app:latest`)
that can be deployed three ways:

| Option                                            | When to use it                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Local development](#local-development)           | Single Postgres instance with pg_cron for local dev                                                 |
| [Vercel](#vercel)                                 | Fastest path to production; no infra to manage                                                      |
| [Single-instance Docker](#single-instance-docker) | One VPS/server, all four role portals in one container                                              |
| [Multi-instance Docker](#multi-instance-docker)   | Isolate each role portal in its own container, e.g. for independent scaling or blast-radius control |

All three share the same PostgreSQL database and the same required env vars
(`DATABASE_URL`, `BETTER_AUTH_SECRET`). See [`docs/ENV.md`](./docs/ENV.md)
for the full list and [`SETUP.md`](./SETUP.md) for what each one does.

---

## Local development

[`docker/compose.postgres.yml`](./docker/compose.postgres.yml) runs a single PostgreSQL 17
instance with `pg_stat_statements` and `pg_cron` built from source
([`docker/Dockerfile.postgres`](./docker/Dockerfile.postgres)). Extensions and cron jobs are
created automatically on first boot via `scripts/init-extensions.sql` and
`scripts/setup-pg-cron.sql`.

```bash
docker compose -f docker/compose.postgres.yml up -d --build
```

This binds to port `25432` (avoids conflicts with any host Postgres). The
`DATABASE_URL` for local dev is:

```env
DATABASE_URL=postgresql://app:localdev123@localhost:25432/delivery
```

### pg_cron jobs (auto-scheduled)

| Job                  | Schedule        | Description                                |
| -------------------- | --------------- | ------------------------------------------ |
| `drain-email-outbox` | Every minute    | Delivers queued transactional email        |
| `cleanup-sessions`   | Daily 03:00 UTC | Deletes expired sessions and verifications |
| `cleanup-audit-logs` | Daily 03:30 UTC | Deletes audit logs older than 30 days      |
| `cleanup-email-logs` | Daily 04:00 UTC | Deletes sent email logs older than 10 days |

### pg_stat_statements

```sql
-- Find slow queries
SELECT query, calls, round(mean_exec_time::numeric, 2) AS mean_ms
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

---

## Vercel

1. Import the repo into Vercel and set the required env vars (`DATABASE_URL`,
   `BETTER_AUTH_SECRET`, plus any storage/mail vars from `docs/ENV.md`).
2. Add `CRON_SECRET` to the project's env vars — Vercel Cron injects the
   `Authorization` header automatically for the job defined in
   [`vercel.json`](./vercel.json) (`/api/cron/cleanup-sessions`, daily at 03:00 UTC).
3. `vercel.json` only schedules session cleanup. The audit-log and email-log
   cleanup jobs (`/api/cron/cleanup-audit-logs`, `/api/cron/cleanup-email-logs`)
   aren't in the free Vercel Cron plan by default — add them as additional
   `crons` entries if your plan supports more than one job, or trigger them
   from an external scheduler (e.g. GitHub Actions, cron-job.org) with the
   same `Authorization: Bearer $CRON_SECRET` header.
4. Set `BETTER_AUTH_ALLOWED_URLS` in your env to list all preview/staging
   URLs that Better Auth should trust (comma-separated). Omit for production
   single-instance deployments.
5. Local disk storage (`STORAGE_PROVIDER=local`) does **not** work on Vercel's
   ephemeral filesystem. Use `STORAGE_PROVIDER=r2`
   instead.
6. The app uses `pg_trgm`, `unaccent`, `pgcrypto`, `btree_gin`,
   `pg_stat_statements`, and `pg_cron` PostgreSQL extensions — if you're
   using a managed Postgres provider (Neon, Supabase, RDS), enable them
   manually after provisioning (see [SETUP.md](./SETUP.md#postgresql-extensions)).
   `pg_cron` replaces the HTTP-based cron endpoints for session, audit-log,
   and email-log cleanup.

Vercel deploys the whole app with all four roles served from one deployment —
there's no `ALLOWED_ROLE` equivalent for Vercel. If you need role isolation
in production, use multi-instance Docker instead.

---

## Single-instance Docker

One container serves all four role portals (admin/dashboard, merchant, rider,
warehouse). Routing between them happens inside the app itself — `ALLOWED_ROLE`
is left unset, so `src/proxy.ts` is a no-op.

[`docker/compose.monolith.yml`](./docker/compose.monolith.yml) bundles the app
with a PostgreSQL replica cluster (primary, standby, and pgpool for
failover-safe connection routing):

| Service  | Host port | Role                                                                             |
| -------- | --------- | -------------------------------------------------------------------------------- |
| `pg-0`   | 25432     | Primary (writes)                                                                 |
| `pg-1`   | 25433     | Standby (used for `DATABASE_URL_READ_ONLY`)                                      |
| `pgpool` | 25434     | Stable endpoint — always routes writes to the current primary, survives failover |
| `app`    | 3000      | The Next.js server, healthcheck at `/api/ready`                                 |
| `cron`   | —         | Schedules the `/api/cron/*` jobs against `app`                                   |

### Start everything

```bash
docker compose -f docker/compose.monolith.yml up -d
docker compose -f docker/compose.monolith.yml logs -f pg-0 pg-1
```

The app waits for pgpool to be healthy before booting, and pgpool waits for
both Postgres nodes to be healthy.

> **Direct-to-node for debugging:**
>
> ```env
> DATABASE_URL=postgresql://app:<PASSWORD>@localhost:25432/app          # pg-0 (primary)
> DATABASE_URL_READ_ONLY=postgresql://app:<PASSWORD>@localhost:25433/app # pg-1 (standby)
> ```
>
> This works for dev but breaks on failover — the ports are bound to specific
> containers, not the current primary.

### Failover

If `pg-0` goes down, repmgr promotes `pg-1`. Because the app connects through
pgpool (port `5434`), it automatically routes writes to the new primary — no
`.env` changes needed.

**Manual reattach:** after `pg-0` recovers, pgpool still sees it as down:

```bash
docker exec -it app-pgpool bash
PGPASSWORD=$PGPOOL_ADMIN_PASSWORD pcp_attach_node -h localhost -U admin -n 0
```

### Adding standbys

Add a `pg-2` service following the same pattern as `pg-1`, with:

```env
REPMGR_NODE_NAME=pg-2
REPMGR_NODE_NETWORK_NAME=pg-2
REPMGR_PARTNER_NODES=pg-0,pg-1:5432,pg-2:5432
```

Update `REPMGR_PARTNER_NODES` on existing nodes too, then restart.

### Environment

The `docker/.env` file is used by all Docker Compose files in the `docker/` folder.
It must contain both the app variables (`DATABASE_URL`,
`BETTER_AUTH_SECRET`, etc.) and the Postgres cluster credentials
(`REPMGR_*`, `PGPOOL_*`). Set `DATABASE_URL` to point at
the `pgpool` service — Docker Compose resolves it by service name:

```env
DATABASE_URL=postgres://app:<PASSWORD>@pgpool:5432/app
DATABASE_URL_READ_ONLY=postgres://app:<PASSWORD>@pgpool:5432/app

POSTGRESQL_POSTGRES_PASSWORD=<generate>
POSTGRESQL_USERNAME=app
POSTGRESQL_PASSWORD=<generate>
POSTGRESQL_DATABASE=app
REPMGR_PASSWORD=<generate>
PGPOOL_ADMIN_PASSWORD=<generate>
```

Docker Compose reads `.env` automatically for variable substitution, and
every service sets `env_file: .env` to pass variables into its container.

---

## Multi-instance Docker

Each role portal runs in its own container, all built from the same image.
`ALLOWED_ROLE` restricts each container to a single role at the edge
(`src/proxy.ts`); everything else (API routes, `/login`, `/track`, static assets,
the database, and the `uploads_data` volume) is shared across all of them.

[`docker/compose.cluster.yml`](./docker/compose.cluster.yml) consolidates the
database cluster, all four role services, cloudflared, and cron into a single
file.

### Deploy

```bash
# 1. Build the image once, from the project root
docker compose -f docker/compose.cluster.yml build

# 2. Start everything
docker compose -f docker/compose.cluster.yml up -d
```

### Automated deploy (GitHub Actions)

`.github/workflows/deploy.yml` runs **after** the CI workflow completes on
`main` and only when it succeeded (`workflow_run` + `conclusion == 'success'`),
so a red CI run can never reach production. It builds and pushes the image
tagged with the exact commit CI validated, then over SSH:

1. `docker compose pull`, then brings up the database/redis services.
2. Takes a pre-migration `pg_dump` into `backups/` — `set -euo pipefail` aborts
   the deploy if the dump fails, so it never migrates unbacked.
3. Runs `docker compose run --rm migrate`; a failure fails the job (there is no
   `||` fallback) and the app services are never rolled out.
4. Rolls out the app and prunes old images.

The host's compose file is chosen by `COMPOSE_FILE` (default
`docker/compose.cluster.yml`; set `COMPOSE_FILE=docker/compose.monolith.yml` on
a single-instance host).

### Services

| Service       | Port | `ALLOWED_ROLE` |
| ------------- | ---- | -------------- |
| `dashboard`   | 3001 | `dashboard`    |
| `merchant`    | 3002 | `merchant`     |
| `rider`       | 3003 | `rider`        |
| `warehouse`   | 3004 | `warehouse`    |
| `cloudflared` | —    | —              |
| `cron`        | —    | —              |

A single `migrate` service runs the versioned migrations
(`src/lib/db/migrate.ts`) once and exits before any app container starts
(`depends_on: service_completed_successfully`). It takes a database-wide
PostgreSQL advisory lock, so concurrent runners (a manual run during a deploy,
a leftover container) queue instead of racing the DDL. Migrations are applied
in one transaction and recorded by content hash, so a renamed or regenerated
file is never re-applied.

### Environment

The `docker/.env` file is used by every service. Set the shared
`BETTER_AUTH_ALLOWED_URLS` so each container trusts the others' origins:

```env
BETTER_AUTH_ALLOWED_URLS=https://admin.yourdomain.com,https://merchant.yourdomain.com,https://rider.yourdomain.com,https://warehouse.yourdomain.com
CLOUDFLARE_TUNNEL_TOKEN=<your-tunnel-token>
```

Each container's `NEXT_PUBLIC_SITE_URL` is set to its own role URL in
`docker/compose.cluster.yml`. `ALLOWED_ROLE` is also hardcoded per service —
don't set it in `.env`.

For the Postgres cluster, add the same `REPMGR_*` and
`PGPOOL_*` vars as in the single-instance setup above.

### Reverse proxy / Cloudflare Tunnel

| Subdomain                  | Container       | Port      |
| -------------------------- | --------------- | --------- |
| `admin.yourdomain.com`     | `app-dashboard` | 3001      |
| `merchant.yourdomain.com`  | `app-merchant`  | 3002      |
| `rider.yourdomain.com`     | `app-rider`     | 3003      |
| `warehouse.yourdomain.com` | `app-warehouse` | 3004      |
| `track.yourdomain.com`     | any instance    | 3001–3004 |

`/track` is public order-tracking and works from any instance since it's not
role-gated. If you're using Cloudflare Tunnel, add each hostname → local port
mapping to your tunnel's `config.yml` ingress rules and point
`CLOUDFLARE_TUNNEL_TOKEN` at that tunnel.

### Running migrations manually

```bash
docker compose -f docker/compose.cluster.yml run --rm migrate
```

The same command is safe to run while the stack is up: the advisory lock makes
it wait for any in-flight run instead of colliding with it. Never use
`drizzle-kit push --force` against a deployed database — it diffs the live
schema and can drop data. `push` is for local development only; deployments use
the versioned `migrate` runner above.

---

### Your own reverse proxy

If you prefer not to use Cloudflare Tunnel (e.g. you have a bare public IP and
want to terminate TLS yourself), run any standard reverse proxy on the host — no
additional container is required.

#### Single-instance

The app container in `docker/compose.monolith.yml` already binds port **3000** on the
host. Configure your proxy to:

| Proxy   | Config goal                                                             |
| ------- | ----------------------------------------------------------------------- |
| Nginx   | `proxy_pass http://127.0.0.1:3000;` + SSL termination on port 443       |
| Caddy   | `reverse_proxy 127.0.0.1:3000` (Caddy handles TLS automatically)        |
| Traefik | Label the `app` service and let Traefik route `Host: your.domain` to it |

Set env vars for your domain:

```env
NEXT_PUBLIC_SITE_URL=https://your.domain.com
BETTER_AUTH_ALLOWED_URLS=https://your.domain.com
```

> Leave `ALLOWED_ROLE` unset so all four portals are served from the same URL.

#### Multi-instance

Each role container binds a different host port (`3001`–`3004`). Map subdomains
to the corresponding port:

| Subdomain                  | Host port | Target container |
| -------------------------- | --------- | ---------------- |
| `admin.yourdomain.com`     | 3001      | `app-dashboard`  |
| `merchant.yourdomain.com`  | 3002      | `app-merchant`   |
| `rider.yourdomain.com`     | 3003      | `app-rider`      |
| `warehouse.yourdomain.com` | 3004      | `app-warehouse`  |
| `track.yourdomain.com`     | any       | any instance     |

Set `BETTER_AUTH_ALLOWED_URLS` in `.env` to include every subdomain:

```env
BETTER_AUTH_ALLOWED_URLS=https://admin.yourdomain.com,https://merchant.yourdomain.com,https://rider.yourdomain.com,https://warehouse.yourdomain.com
```

Each container's `NEXT_PUBLIC_SITE_URL` should be set to its own subdomain
(override in your compose file, or pass per-container env vars from the proxy).

> `/track` is public and not role-gated — it works on any subdomain.

---

## Health checks

Every app container (single- or multi-instance) exposes two probes:

- **`GET /api/health`** — liveness: 200 as soon as the process serves requests
  (no DB/Redis dependency).
- **`GET /api/ready`** — readiness: runs `SELECT 1` and, when `REDIS_URL` is
  configured, `PING`; returns 503 when a required dependency is unreachable
  (short timeout). This is what the Docker healthchecks point at.

Both are checked every 10s with a 60s startup grace period (`start_period`).

---

## Uploads storage

`uploads_data` is a named Docker volume mounted at `/app/uploads` in every
compose file, so uploaded files (avatars, delivery proof, pickup-location
photos) survive container rebuilds and are shared across role containers
under `STORAGE_PROVIDER=local`. For multi-host or serverless deployments
   (including Vercel), switch to `STORAGE_PROVIDER=r2` instead —
see `docs/ENV.md`.

---

## Cron jobs

Three cleanup jobs (sessions, audit logs, email logs) are scheduled via
`pg_cron` in the local dev setup and can optionally run via HTTP endpoints
under `/api/cron/*`. How they're triggered depends on deployment target:

- **Local dev** — `pg_cron` runs them natively inside Postgres (no extra config).
- **Vercel** — HTTP endpoints triggered by Vercel Cron (see [Vercel](#vercel) above).
- **Single-instance Docker** — use `pg_cron` (requires the custom image from
  `docker/Dockerfile.postgres`) or add an external scheduler hitting the HTTP endpoints.
- **Multi-instance Docker** — the `cron` service in `docker/compose.cluster.yml`
  runs all three via HTTP on a schedule automatically, hitting the `dashboard`
  container by service name.

HTTP endpoints are authenticated with `CRON_SECRET`
(`Authorization: Bearer $CRON_SECRET`). Generate it with
`openssl rand -base64 32` and set it in `docker/.env` before starting the `cron`
service — without it, the endpoints reject every request with 401.

---

## Troubleshooting

- **App container never becomes healthy** — check logs with
  `docker compose logs app` (or the relevant role container). The most common
  cause is the `migrate` service failing (`src/lib/db/migrate.ts`); verify
  `DATABASE_URL` is reachable from inside the container, not just from your
  host.
- **`cloudflared` never starts** — it waits on `service_healthy` for an app
  container, so an unhealthy app container will block it indefinitely.
- **Cron requests get 401** — `CRON_SECRET` isn't set, or doesn't match
  between `docker/.env` and whatever's calling the endpoint.
- **Uploaded files disappear after a redeploy** — you're on
  `STORAGE_PROVIDER=local` without the `uploads_data` volume mounted (or
  you're on Vercel, where local disk storage never works — see
  [Vercel](#vercel)).
- **ILIKE queries are slow or "extension not found" errors** — `pg_trgm`,
  `unaccent`, `pgcrypto`, or `btree_gin` are missing. On Docker, they're
  created via `scripts/init-extensions.sql` on first boot. On managed Postgres, run
  the `CREATE EXTENSION IF NOT EXISTS` statements in the provider's SQL
  console (see [SETUP.md](./SETUP.md#postgresql-extensions)).
- **Stale module errors after deploy** — errors like
  `module factory is not available` or `ChunkLoadError` mean the PWA service
  worker (`public/sw.js`) is serving a cached JS chunk from a previous deploy.
  The service worker caches `/_next/static/*` assets via stale-while-revalidate;
  after a deploy the old chunk references module IDs that no longer exist.
  **Fix:** Run `pnpm bump-sw` (or manually bump the `VERSION` constant in
  `public/sw.js`) on every deploy that changes static assets. The `activate`
  handler prunes old caches automatically.
  Users with a stale SW can hard-reload (**Ctrl+Shift+R**) or clear site data
  from DevTools > **Application** > **Storage** > **Clear site data**.
