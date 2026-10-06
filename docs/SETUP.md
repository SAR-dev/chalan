# Setup Notes

Quick-load reference so the project can be bootstrapped fast in future chats.

## What this is

- **App:** Delivery management — B2B delivery / parcel management app.
- **Brand config:** Edit `src/config/site.json` (`name`, `tagline`, `description`) to set the brand name used in nav, metadata, and email templates. Set `NEXT_PUBLIC_SITE_URL` for the domain.
- **Repo:** https://github.com/SAR-dev/delivery-management.git
- **Stack:** Next.js 16 (App Router) · Drizzle ORM · Better Auth · Tailwind v4 · shadcn · SWR · zod.
- **Database:** PostgreSQL (e.g. Neon, Supabase) — the only supported database.
- **PostgreSQL extensions:** `pg_trgm` and `unaccent` (required for search); `pg_stat_statements` (optional, for query monitoring). See [Extensions](#postgresql-extensions) below.
- **Package manager:** `pnpm`.

## Required environment variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
BETTER_AUTH_SECRET=<generate below>

# Optional — offloads GET queries to a replica. Falls back to DATABASE_URL when
# unset (safe for development and single-instance deploys).
# DATABASE_URL_READ_ONLY=postgresql://user:pass@replica-host:5432/dbname
```

### Read replica setup

When `DATABASE_URL_READ_ONLY` is set, all GET handlers automatically use the
replica. Write handlers (POST, PATCH, DELETE) and transactions always use the
primary. Here's how to set it up per provider:

**Neon** (recommended — one-click replicas)

1. Open your project in the [Neon Console](https://console.neon.tech).
2. Go to **Branches** → click your primary branch → **Add read replica**.
3. Neon creates a replica endpoint — copy the connection string from the
   **Connect** dialog (select **Read-only** pooler mode).
4. Set it as `DATABASE_URL_READ_ONLY`:
   ```env
   DATABASE_URL=postgres://user:pass@ep-xxx-primary.us-east-2.aws.neon.tech/dbname
   DATABASE_URL_READ_ONLY=postgres://user:pass@ep-xxx-ro.us-east-2.aws.neon.tech/dbname
   ```
   Neon handles replication automatically — no configuration needed.

**Supabase** (Team/Enterprise only)

1. Go to your project → **Database** → **Read replicas**.
2. Click **Enable read replica** and choose a region.
3. After provisioning, go to **Connection pooling** → copy the **Read-only**
   connection string from the **Session pooler** section.
4. Set it as `DATABASE_URL_READ_ONLY`:
   ```env
   DATABASE_URL=postgres://postgres.xxxxx:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   DATABASE_URL_READ_ONLY=postgres://postgres.xxxxx:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres?options=project%3Dxxxxx
   ```

**AWS RDS / GCP Cloud SQL**

1. Create a **read replica** instance in your cloud console.
2. Wait for the replica to finish provisioning (lag catches up).
3. Copy the replica's endpoint (hostname:port).
4. Set it as `DATABASE_URL_READ_ONLY`:
   ```env
   DATABASE_URL=postgres://user:pass@primary.xxxxx.us-east-2.rds.amazonaws.com:5432/dbname
   DATABASE_URL_READ_ONLY=postgres://user:pass@replica.xxxxx.us-east-2.rds.amazonaws.com:5432/dbname
   ```

**Self-managed Postgres** (streaming replication)

1. Configure the primary for WAL archiving (`postgresql.conf`):
   ```conf
   wal_level = replica
   max_wal_senders = 3
   wal_keep_size = 1024
   ```
2. Set up the standby with `pg_basebackup`:
   ```bash
   pg_basebackup -h primary-host -D /var/lib/postgresql/data -U replicator -P -v --wal-method=stream
   ```
3. Create a `standby.signal` file and configure `primary_conninfo` in
   `postgresql.conf` on the standby.
4. Create a read-only user for the app:
   ```sql
   CREATE USER app_readonly WITH LOGIN PASSWORD 'secure_password';
   GRANT CONNECT ON DATABASE dbname TO app_readonly;
   GRANT USAGE ON SCHEMA public TO app_readonly;
   ALTER DEFAULT PRIVILEGES FOR ROLE app_readonly IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
   -- Grant SELECT on existing tables
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
   ```
5. Use the standby's connection string as `DATABASE_URL_READ_ONLY`.

> **Note:** Replication introduces some lag (typically sub-second on the same
> region). Writes are immediately visible on the primary; the replica may lag
> behind by a few hundred milliseconds. The app accounts for this naturally
> since mutations revalidate via `db` (primary) after every write, so the
> re-fetch always reads the latest data.

### Cron (optional, recommended for production)

`CRON_SECRET` authenticates the cron endpoints. Generate one with:

```bash
printf "CRON_SECRET='%s'\n" "$(openssl rand -base64 32)" >> .env.development.local
```

Five scheduled endpoints are available, all authenticated via `CRON_SECRET`:

| Endpoint                       | What it does                             | Schedule             |
| ------------------------------ | ---------------------------------------- | -------------------- |
| `/api/cron/drain-email-outbox` | Delivers queued transactional email      | Every minute         |
| `/api/cron/cleanup-sessions`   | Expired sessions + verification tokens   | Immediate (N/A)      |
| `/api/cron/cleanup-audit-logs` | Old audit log entries                    | 30 days              |
| `/api/cron/cleanup-email-logs` | Successful email logs (SENT only)        | 10 days              |
| `/api/cron/cleanup-uploads`    | Orphaned uploads (unreferenced in the DB) | 48 hours (min age)  |

Transactional email (activation, verification, password reset, merchant
approval) is written to the `email_outbox` table in the same transaction as the
domain change; `drain-email-outbox` delivers anything a request could not send
synchronously (ROADMAP P1.5).

Retention is configurable via `AUDIT_LOG_RETENTION_DAYS`,
`EMAIL_LOG_RETENTION_DAYS`, and `UPLOAD_SWEEP_MIN_AGE_HOURS` env vars. FAILED
email log entries are never auto-deleted; `cleanup-uploads` never deletes a
file referenced by an image column or one younger than the grace period.

On **Vercel**, add `CRON_SECRET` to your project env vars — Vercel Cron injects
the `Authorization` header automatically. On a **Docker/VPS single instance**,
call from crontab (stagger times to avoid load spikes):

```bash
* * * * * curl -s -X POST https://your-domain/api/cron/drain-email-outbox \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1
0 3 * * * curl -s -X POST https://your-domain/api/cron/cleanup-sessions \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1
30 3 * * * curl -s -X POST https://your-domain/api/cron/cleanup-audit-logs \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1
0 4 * * * curl -s -X POST https://your-domain/api/cron/cleanup-email-logs \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1
30 4 * * * curl -s -X POST "https://your-domain/api/cron/cleanup-uploads?dryRun=1" \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1
```

Run `cleanup-uploads` with `?dryRun=1` first (as above): a dry run reports
`{ scanned, orphans, ... }` without deleting anything. Drop the query param
once a week of logs looks right. The sweep is not in `vercel.json` (free-plan
cron limit) — see `docs/ENV.md` → Cron.

On a **multi-instance Docker deployment**, the `cron` service in
`docker/compose.cluster.yml` handles all four automatically — it targets the
`dashboard` container's internal port so you don't need to expose the endpoints
publicly.

### Storage backends

The app supports two storage providers for file uploads (avatars, delivery
proofs, pickup-location photos):

| Provider   | `STORAGE_PROVIDER` | When to use                                  |
| ---------- | ------------------ | -------------------------------------------- |
| Local disk | `local` (default)  | Single-instance dev or Docker deployments    |
| R2         | `r2`               | Multi-instance or cloud-native on Cloudflare |

> **Multi-instance note:** when running more than one app container, use
> `STORAGE_PROVIDER=r2`. Local disk storage
> is not shared across containers — each instance would see a different subset
> of uploaded files. The `uploads_data` named volume in the compose files
> is shared across all role containers, so `local` still works for the
> multi-instance Docker setup as long as all containers run on the same host.
> For multi-host deployments, switch to R2.

Generate `BETTER_AUTH_SECRET`:

```bash
printf "BETTER_AUTH_SECRET='%s'\n" "$(openssl rand -base64 32)" >> .env.development.local
```

> Note: db/seed scripts use `dotenv/config` which loads `.env`, NOT `.env.development.local`.
> So when running CLI commands, source the env file first (see below).

## Bootstrap steps (in order)

```bash
# 0. start Postgres locally (skip if using a remote DB)
docker compose -f docker/compose.postgres.yml up -d --build

# 1. install deps
pnpm install

# 2. make env vars available to the CLI
set -a && . ./.env.development.local && set +a

# 3. apply schema migrations (versioned, idempotent)
#    The runner takes a database-wide advisory lock and records a content-hash
#    ledger; `db:push` is local-dev only and never used for deployments.
pnpm db:migrate

# 4. create superadmin account
pnpm db:admin
```

## Key files

- `src/lib/db/index.ts` — Drizzle client; initialises the pg pool and exports `db` (primary/writes), `dbRead` (read-replica, falls back to primary), and `pool`.
- `src/lib/db/schema.ts` — re-exports `schema.postgres` (kept for import-path compatibility).
- `src/lib/db/schema.postgres/` — PostgreSQL schema (pg-core types), split into domain
  modules (`enums.ts`, `auth.ts`, `orders.ts`, …) with an `index.ts` barrel.
- `src/lib/db/seed.ts` — seed script, creates users via Better Auth.
- `src/lib/auth.ts` — Better Auth config; uses `pool` directly.
- `drizzle.config.ts` — drizzle-kit config (PostgreSQL only).
- `drizzle/postgres/` — PostgreSQL migration files.
- `src/proxy.ts` — edge proxy: role-based instance isolation + upload rate limiting (reads `ALLOWED_ROLE`; no-op when unset).
- `src/app/manifest.ts` — PWA web app manifest (served at `/manifest.webmanifest`).
- `src/app/pwa-icon/[size]/route.tsx` — PWA icons (192/512 PNG) generated from the brand SVG.
- `public/sw.js` — PWA service worker (precaches app shell; never intercepts `/api/*` or `/uploads/*`). Registered only in production via `src/components/service-worker-register.tsx`.
- `docker/compose.postgres.yml` / `docker/Dockerfile.postgres` — standalone Postgres for local development (includes `pg_trgm`, `unaccent`, `pgcrypto`, `btree_gin`, `pg_stat_statements`, `pg_cron`).
- `playwright.config.ts` — Playwright E2E test config (see [E2E tests](#e2e-tests)
  below and the E2E section of `CONTRIBUTING.md`).
- `e2e/` — Playwright tests: `helpers.ts` (shared `CREDS` + `login()`),
  `selectors.ts` (data-testid constants), `specs/01-core-flows.spec.ts`,
  `specs/02-business-flows.spec.ts`, `specs/03-merchant-registration.spec.ts`,
  `specs/04-tracking-identity.spec.ts` (13 tests).

## Database schema (tables created by db:push)

`user`, `account`, `session`, `verification` (Better Auth), plus app tables:
`profile`, `warehouse`, `rider`, `merchant`, `pickup_location`, `security_config`,
`order`, `payout_request`.

## PostgreSQL extensions

The app uses `pg_trgm` for fast `ILIKE` search queries and `unaccent` for
accent-insensitive matching. `pg_stat_statements` is optional (query monitoring).

### Docker compose

All compose files mount [`scripts/init-extensions.sql`](./scripts/init-extensions.sql) into each
Postgres container's `/docker-entrypoint-initdb.d/` directory (`compose.postgres.yml`,
`docker/compose.monolith.yml`, `docker/compose.cluster.yml`), so extensions are created
automatically on first boot. No manual step needed.

### Managed providers (Neon, Supabase, RDS, etc.)

Enable the extensions manually after connecting to your database:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

- **Neon** — run the SQL above from the **SQL Editor** in the Neon Console.
- **Supabase** — run the SQL above from the **SQL Editor** in the Supabase Dashboard.
- **RDS / Cloud SQL** — connect with `psql` and run the SQL above (requires
  `superuser` or `rds_superuser` role for `pg_stat_statements`).

> `pg_trgm` and `unaccent` are contrib extensions that ship with PostgreSQL and
> do not require `shared_preload_libraries`. `pg_stat_statements` needs to be
> added to `shared_preload_libraries` in `postgresql.conf` (RDS/Cloud SQL) or
> enabled via the provider's config panel (Neon: **Extensions** tab).

## Seeded data (from `pnpm db:seed:full`)

Warehouses (3), delivery zones (3), delivery cities (8), zone-pricing matrix
(9 rows), riders (10 + 1 pending), merchants (6 incl. demo), pickup locations
(5), admin/warehouse-admin users, announcements (6), 100 orders, 2 payout
requests, and merchant balances. All seeded accounts share the password
`12qwaszx` (see `SEED_PASSWORD` in `src/lib/db/seed/seed-content/credentials.ts`).

## Drizzle CLI

```bash
pnpm db:push              # apply schema
pnpm db:generate          # generate migrations
pnpm db:studio            # open Drizzle Studio
pnpm db:admin     # create first superadmin
```

## E2E tests

```bash
pnpm build          # required first — the server runs `next start`
pnpm test:e2e      # run Playwright E2E suite
```

Requires a running PostgreSQL instance (schema applied via `pnpm db:push`).
Playwright's `webServer` runs `pnpm db:seed:full && pnpm start` — the database
is reseeded to deterministic state automatically before the suite starts (if a
server is already listening on port 3000, it is reused and the reseed is
skipped — stop it first for a fresh seed). See the E2E section of
[`CONTRIBUTING.md`](../CONTRIBUTING.md) for full details.

## Multi-instance deployment environment variables

When running each role portal as a separate Docker container, add this to
`docker/.env` (referenced by `docker/compose.cluster.yml`):

```env
# Comma-separated list of all role portal URLs (for cross-container auth)
BETTER_AUTH_ALLOWED_URLS=https://admin.yourdomain.com,https://merchant.yourdomain.com,https://rider.yourdomain.com,https://warehouse.yourdomain.com

# Cloudflare Tunnel token — required for the cloudflared service
CLOUDFLARE_TUNNEL_TOKEN=<your-tunnel-token>
```

Each container's `NEXT_PUBLIC_SITE_URL` is set to its own role URL in
`docker/compose.cluster.yml`. `ALLOWED_ROLE` is set per-service in
`docker/compose.cluster.yml` and does not need to appear in `docker/.env`. Valid
values: `dashboard`, `merchant`, `rider`, `warehouse`.
Leave unset (or omit entirely) for local development to serve all roles.

### How the migration guard works

`docker/compose.cluster.yml` has a single `migrate` service that runs the
versioned migrations (`src/lib/db/migrate.ts`) once and exits before any app
container starts. It holds a database-wide PostgreSQL advisory lock for the
duration, so two runners can never apply DDL at the same time. The runner uses
drizzle's own migrator, so the ledger stores a content hash (a renamed or
regenerated migration is not re-applied) and each migration file is split on
`--> statement-breakpoint` rather than `;` (a `$$`-quoted function body is
safe).

To run migrations manually (e.g. for a production update):

```bash
docker compose -f docker/compose.cluster.yml run --rm migrate
```

## Gotchas

- Never run `drizzle-kit push` (or `push --force`) against a deployed database — it diffs the live schema and can drop data. Use `pnpm db:migrate` (or the `migrate` compose service) for anything beyond your local machine.
- Always `set -a && . ./.env.development.local && set +a` before running `db:*` scripts.
- Edit the matching domain module under `src/lib/db/schema.postgres/` when making schema
  changes (the `index.ts` barrel re-exports everything — there is still one logical schema).
- In a multi-instance deployment, all containers must share the same `BETTER_AUTH_SECRET` and `DATABASE_URL` — the session and user tables are shared and auth will break if secrets differ across instances.
- The rate limiter in `src/lib/rate-limit.ts` and the upload proxy in `src/proxy.ts` use in-memory stores. For multi-host deployments (containers on different machines), swap the internal `Map` for a Redis/Upstash store so rate limits are enforced globally, not per-container.
