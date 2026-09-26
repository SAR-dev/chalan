# Delivery Management

A B2B delivery and logistics management platform covering the full parcel lifecycle across four roles: admin, merchant, warehouse, and rider.

> **Brand name is configurable** — edit `src/config/site.json` (`name`, `tagline`, `description`) or set `NEXT_PUBLIC_SITE_URL`. Legal pages (`/terms`, `/privacy`) resolve `{{APP_NAME}}`, `{{APP_URL}}`, `{{APP_EMAIL}}` from this config.

## Tech Stack

Next.js 16 (App Router) · React + TypeScript · PostgreSQL · Drizzle ORM · Better Auth · Tailwind CSS + shadcn/ui

## Getting Started

```bash
pnpm install
cp .env.example .env.local        # see docs/ENV.md for all variables
pnpm db:push                      # apply schema
pnpm db:admin             # create first superadmin
pnpm dev                          # http://localhost:3000
```

Required env: `DATABASE_URL`, `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`). Everything else is optional or has a safe default — the app validates required vars on boot (`src/lib/env.ts`). Image uploads work out of the box with the default `STORAGE_PROVIDER=local` (files in `./uploads`); switch to `r2` for shared/cloud storage.

## Roles

| Role      | Area         | What they do                                             |
| --------- | ------------ | -------------------------------------------------------- |
| Admin     | `/dashboard` | Orders, merchants, riders, payouts, team, COD settlement |
| Merchant  | `/merchant`  | Create orders, track deliveries, request payouts         |
| Warehouse | `/warehouse` | Intake, dispatch, order progress, hub riders, exceptions |
| Rider     | `/rider`     | Pickup queue and delivery queue                          |

Each rider belongs to one home warehouse and has an independent task type (`PICKUP` / `DELIVERY` / `BOTH`). Admins manage the full roster; Warehouse Admins only their own hub's riders (enforced server-side; Neon has no RLS).

## Demo Logins

Created by `pnpm db:admin` — local dev only. Sign in at `/login`:

| Role            | Email                  | Password        |
| --------------- | ---------------------- | --------------- |
| Super Admin     | `admin1@email.com`    | `12qwaszx`      |
| Warehouse Admin | `warehouse.admin1@email.com` | `12qwaszx` |
| Merchant        | `merchant1@email.com`  | `12qwaszx`      |
| Rider           | `rider1@email.com`     | `12qwaszx`      |
| Demo merchant   | `demo@kikuya.com`      | `12qwaszx`      |

> `warehouse.admin2@email.com` is seeded inactive (tests disabled-user handling). Full list in [`docs/SETUP.md`](./docs/SETUP.md).

## Scripts

| Command         | What it does                           |
| --------------- | -------------------------------------- |
| `pnpm dev`      | Start the development server           |
| `pnpm db:push`  | Push schema to the database            |
| `pnpm db:admin` | Create first superadmin account       |
| `pnpm ci:check` | Typecheck + lint + format              |
| `pnpm ci:test`  | Unit tests + build + E2E tests         |

Full current list lives in `package.json`.

## Project Structure

```
src/
  app/          Routes per role + auth + tracking + legal pages
  components/   Shared UI (DataTable, Markdown renderer, PublicFooter)
  content/      Markdown for legal pages (terms.md, privacy.md)
  features/     Per-domain components, dialogs, SWR hooks
  lib/          Auth, Drizzle db, storage, validation, mailer, rate limiting
  proxy.ts      Edge proxy — role isolation (ALLOWED_ROLE) + upload rate limiting
  manifest.ts   PWA web app manifest; pwa-icon/ generates install icons; sw.js in public/ (see CONTRIBUTING §7.5)
drizzle/        PostgreSQL migration files
```

The app is a PWA — installable from the browser (manifest + service worker +
brand icons all derive from `src/config/site.ts` / `src/icons/SiteIcon.tsx`).

## Deployment

- **Vercel** — set env vars; use `r2` storage (no local disk); enable `pg_trgm` + `unaccent`.
- **Single-instance Docker** — `docker/compose.monolith.yml` (app + Postgres failover cluster via pgpool).
- **Multi-instance Docker** — `docker/compose.cluster.yml` (one container per role, isolated via `ALLOWED_ROLE`; shared DB, `uploads_data` volume, cloudflared, cron).

Read-replica support via `DATABASE_URL_READ_ONLY` (all GETs use `dbRead`). See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md), [`docs/SETUP.md`](./docs/SETUP.md) (env reference), and [`CONTRIBUTING.md`](./CONTRIBUTING.md) (conventions & recipes).
