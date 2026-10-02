# Delivery Management

A B2B delivery and logistics management platform covering the full parcel lifecycle across four roles: admin, merchant, warehouse, and rider.

**Stack:** Next.js 16 (App Router) · React + TypeScript · PostgreSQL · Drizzle ORM · Better Auth · Tailwind CSS + shadcn/ui

## Quick start

```bash
pnpm install
cp .env.example .env    # see docs/ENV.md for every variable
pnpm db:migrate         # apply schema migrations
pnpm db:admin           # create the first superadmin (and demo logins)
pnpm dev                # http://localhost:3000
```

Only two env vars are required: `DATABASE_URL` and `BETTER_AUTH_SECRET` (generate one with `openssl rand -base64 32`). Everything else is optional or has a safe default, and the app validates the required set on boot. Image uploads work out of the box with the default `STORAGE_PROVIDER=local`, which stores files in `./.uploads`.

`pnpm db:admin` seeds the demo accounts for `/login`; the full list is in [`docs/SETUP.md`](./docs/SETUP.md).

## Scripts

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `pnpm dev`          | Start the development server                |
| `pnpm build`        | Build for production                        |
| `pnpm ci:check`     | Typecheck + lint + format                   |
| `pnpm ci:fix`       | Apply lint and format fixes                 |
| `pnpm test:coverage`| Unit tests with coverage floors enforced    |
| `pnpm test:e2e`     | Playwright end-to-end tests (build first)   |
| `pnpm db:migrate`   | Apply schema migrations                     |
| `pnpm db:admin`     | Create the first superadmin account         |

The full list lives in `package.json`. Further reading: [`docs/ENV.md`](./docs/ENV.md), [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md), and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for conventions and recipes.
