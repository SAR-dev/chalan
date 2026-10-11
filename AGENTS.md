# AGENTS.md

Instructions for AI agents working in this codebase.

## Quick Reference

| Task | Command |
|------|---------|
| Dev server | `pnpm dev` |
| Type check | `pnpm typecheck` |
| Lint + format | `pnpm ci:fix` |
| Check all | `pnpm ci:check` |
| Unit tests | `pnpm test:unit:run` |
| Coverage (enforces floors) | `pnpm test:coverage` |
| Real-DB tests (opt-in) | `pnpm db:migrate` + `INTEGRATION_DATABASE_URL=… pnpm test:integration` |
| E2E tests | `pnpm test:e2e` |
| Full CI | `pnpm ci:test` |

## Project Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript (strict)
- **Database:** PostgreSQL + Drizzle ORM
- **State:** SWR for data fetching
- **UI:** shadcn/ui + Tailwind CSS v4
- **Testing:** Vitest (unit) + Playwright (E2E)
- **Linting:** Biome (not ESLint)

## Folder Structure

### Feature modules

All domain code lives under `src/features/<domain>/`. Each gets only the subdirectories it needs:

```
src/features/<domain>/
  components/    ← domain-specific UI (NOT reused across domains)
  hooks/         ← SWR hooks (use-<plural>.ts)
  dialogs/       ← feature dialogs (<action>-dialog.tsx or folder/index.tsx)
```

**15 domains:** account, announcements, audit-logs, email-logs, merchants, orders, packages, payouts, pickup-locations, platform-config, riders, support, team, users, warehouses

Not every domain has all three subdirs. Minimal domains (audit-logs, platform-config) may only have `hooks/`.

### Shared code

| Path | Purpose |
|------|---------|
| `src/components/ui/*` | shadcn/ui primitives (button, dialog, card, etc.) |
| `src/components/*.tsx` | Shared non-ui components (data-table, page-header, form-dialog, confirm-dialog, status-badge, etc.) |
| `src/components/charts/*` | Reusable chart components |
| `src/components/filters/*` | Shared filter bar, status tabs |
| `src/components/navigation/*` | Sidebar components per role |
| `src/lib/hooks/*` | Shared React hooks (fetcher, use-table-filters, use-debounced-value) |
| `src/lib/db/*` | Database connection, schema, seeds, migrations |
| `src/lib/storage/*` | File storage abstraction (R2, local) |
| `src/lib/*.ts` | Shared utilities (validation, types, constants, utils, pricing, mailer, audit, auth) |

### API routes

All routes live under `src/app/api/`:

```
src/app/api/<resource>/route.ts              ← GET (list) + POST (create)
src/app/api/<resource>/[id]/route.ts         ← GET + PATCH (single)
src/app/api/<resource>/[id]/<action>/route.ts ← state transitions
src/app/api/<resource>/bulk/<action>/route.ts ← bulk operations
```

Examples:
```
src/app/api/orders/route.ts
src/app/api/orders/[id]/route.ts
src/app/api/orders/[id]/approve/route.ts
src/app/api/orders/bulk/dispatch/route.ts
src/app/api/admin/mail-config/route.ts
src/app/api/admin/mail-config/[id]/activate/route.ts
```

## Spec File Placement

### Unit tests — colocated next to source

```bash
src/lib/validation.ts           → src/lib/validation.spec.ts
src/lib/utils.ts                → src/lib/utils.spec.ts
src/lib/hooks/fetcher.ts        → src/lib/hooks/fetcher.spec.ts
src/components/data-table.tsx   → src/components/data-table.spec.tsx  # .tsx for component tests
```

### API route tests — in the API folder

Named `<resource>.spec.ts` (NOT `route.spec.ts`):

```bash
src/app/api/orders/route.ts                → src/app/api/orders/orders.spec.ts
src/app/api/merchants/route.ts             → src/app/api/merchants/merchants.spec.ts
src/app/api/team/route.ts                  → src/app/api/team/team.spec.ts
src/app/api/admin/mail-config/route.ts     → src/app/api/admin/mail-config/mail-config.spec.ts
```

### Feature hooks — NO colocated specs

Feature hooks (`src/features/*/hooks/*.ts`) are NOT unit tested directly. They are tested via API route specs and E2E tests.

### Integration tests — `*.integration.spec.ts`, real DB

Anything only Postgres can prove (unique indexes, CHECK/FK behaviour, the
migration ledger, the advisory lock, session timezone) belongs in
`src/lib/db/integration.spec.ts`. Rules:

- The whole suite is gated on `process.env.INTEGRATION_DATABASE_URL` — use
  `const suite = url ? describe : describe.skip` so a normal `pnpm test:unit:run`
  never touches a database.
- Connect with a plain `pg` `Client`; do NOT import `@/lib/db` (it reads env
  and opens pools at import time).
- Every fixture row is tagged with a per-run suffix and registered for cleanup
  in `afterEach`, so the suite is safe against a seeded dev database.
- Run it with `pnpm test:integration`; CI has an `integration` job that migrates
  a throwaway Postgres first.

### E2E tests — Playwright with data-testid selectors

```bash
e2e/specs/01-core-flows.spec.ts    # Core flows: lifecycle, roles, public pages
e2e/specs/02-business-flows.spec.ts # Business/ops flows
e2e/specs/03-onboarding.spec.ts    # Merchant onboarding
e2e/specs/04-tracking-identity.spec.ts # Merchant sidebar identity + tracking token
e2e/specs/05-two-factor.spec.ts    # 2FA for admins
e2e/specs/06-support.spec.ts       # Support tickets
e2e/specs/07-dispatch-planning.spec.ts # Auto-assign + rider run sheet
e2e/selectors.ts                    # Centralized data-testid selectors
```

**Run:** `pnpm build` (manual) then `pnpm test:e2e`. Playwright's `webServer`
reseeds the DB (`pnpm db:seed:full`) and starts `pnpm start` — build must be
done first.

**Separate env:** copy `.env.e2e.example` to `.env.e2e` (gitignored) to point
e2e at its own database. `playwright.config.ts` loads it into the runner so the
webServer and test workers inherit it; omitted keys fall back to `.env`, and
shell values win. Set up the test DB with `pnpm db:push:e2e` (or
`pnpm db:migrate:e2e` / `pnpm db:seed:e2e`). CI does **not** use `.env.e2e` — the
`e2e` job in `.github/workflows/ci.yml` sets the same vars directly against a
Postgres service container.

**Credentials (seeded — all passwords `12qwaszx`):**
- Super Admin: `admin1@email.com` / `12qwaszx`
- Warehouse Admin: `warehouse.admin1@email.com` / `12qwaszx`
- Merchant: `merchant1@email.com` / `12qwaszx`
- Rider: `rider1@email.com` / `12qwaszx`

**Selector policy — `data-testid` first, always.** Text and roles change
frequently (copy edits, i18n, layout), so **use `data-testid` as much as
possible** — it is the default, not a nicety. Before writing any assertion:

1. Add a `data-testid` attribute to the component under test.
2. Add a constant for it in `e2e/selectors.ts` (namespaced export).
3. Reference that constant in the spec — never a raw string or a text matcher.

`getByRole` / `getByText` are **fallbacks only** for elements that genuinely
cannot carry a test id (headings, static/generic text) — **never** for buttons,
inputs, links, options, rows, cells, tabs, dialogs, or toasts, all of which can
be tagged. When fixing or writing e2e tests, **convert** existing `getByText` /
`getByRole` selectors on taggable elements to `data-testid` as you go. If you
must match text, scope it to a tagged container (e.g.
`page.locator(selectors.x.table).getByText(...)`), not the whole page.

**Suite naming:** every `test.describe` is prefixed with a scenario id **scoped
to its file** — `<file number><index in that file>`, both two digits, so `2901.`
is the first scenario in `29-sign-out.spec.ts`. File prefixes run `01`…`42` and
must be unique, so ids never collide. Adding or removing a scenario renumbers
**that one file only** — renumber it; there are no gaps to preserve any more.
Files sort in run order, so the log now reads in id order too.

The summary below is asserted by `src/app/__tests__/docs-drift.spec.ts`, which
fails on a duplicate id, a prefix that does not match the filename, an
out-of-sequence index, or stale counts: **currently 83 scenarios across 42 files
/ 164 tests**.

## Coding Patterns

### Auth

- Server components: `requireSession()` + `redirect()` for gating
- API routes: `requireSession()` returns `null` if unauthorized
- Client components: use `useAuth()` hook
- Layout shells (`dashboard-shell.tsx`, `warehouse-shell.tsx`) handle async auth init — NOT redundant
- Automatic logouts redirect to `/login?next=<current page>`: server pages via
  `loginRedirectPath()` (reads the proxy-forwarded `x-pathname` header), shells
  via `loginPathWithNext()`; the login page validates `next` with
  `safeNextPath()` (same-site path only) and lands there after password/2FA
  sign-in. Intentional logout and role-mismatch redirects use plain `/login`.

### Mutations (3-step error pipeline)

1. **API route:** `parseBody(req, schema)` → returns `{ data, error }`. Validation errors include `issues` array.
2. **Hook:** Extract `resData`, format with `formatOrderError()` pattern, return `{ ok, error }`.
3. **UI:** Call hook, show `toast.error(result.error)` on failure.

### Error Response Shape

```ts
// parseBody validation error
{ error: "Invalid request body", issues: [{ path: ["field"], message: "msg" }] }

// Business logic error
{ error: "Inactive merchant" }

// Unhandled 500 (from withErrorHandler) — requestId also in the x-request-id header
{ error: "Internal server error", requestId: "…" }
```

### Logging (structured)

Use `logger` from `src/lib/logger.ts` — never `console.*` in the request/error
path. Every line is JSON (`level`, `time`, `msg`, fields); pass an `err` field
for errors and add context (`logger.error("msg", { requestId, merchantId, err })`).
`withErrorHandler` already logs unhandled errors with `{ requestId, method,
path }` and returns the id in the response. `x-request-id` is minted/forwarded
by `src/proxy.ts` (or on demand via `getRequestId(req)`).

### Error Formatter Pattern

Used in hooks to flatten `issues` into a readable string:

```ts
function formatOrderError(data: {
  error?: string
  issues?: Array<{ path: (string | number)[]; message: string }>
}): string {
  if (!data.issues || data.issues.length === 0) {
    return data.error ?? "Failed to create order."
  }
  const msgs = data.issues.map((i) => {
    const field = i.path
      .filter((p) => typeof p === "string")
      .join(" ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim()
    return field ? `${field}: ${i.message}` : i.message
  })
  return msgs.length > 0
    ? msgs.join(". ")
    : (data.error ?? "Validation failed.")
}
```

### Database

- Schema: folder `src/lib/db/schema.postgres/` (domain modules + `index.ts` barrel, re-exported via `schema.ts`)
- New tables: `delivery_zone`, `zone_pricing` (N×N pricing matrix), `delivery_city` (with zoneId + warehouseId)
- Updated: `pickup_location` (cityId instead of warehouseId), `order` (deliveryCityId FK)
- Queries: **inline in each `route.ts`** — no separate queries file
  - Exception: `src/lib/maintenance.ts`. The six cron jobs are driven by two
    schedulers (the per-route endpoints and `/api/cron/maintenance`), so their
    bodies live in one module both call. A job added there needs a
    `run*` function *and* a route entry, never a second copy of the query.
- Use `db` for writes, `dbRead` for reads
- Table names use `"snake_case"` via Drizzle's `"snake_case"` name mapper
- Migrations: `pnpm db:generate` then `pnpm db:push`
- Seed: `pnpm db:admin` (interactive menu)

### Validation

- ALL Zod schemas centralized in `src/lib/validation.ts`
- Use `parseBody(req, schema)` for API route validation
- Helper: `requiredString(label)` for common string fields
- Helper: `isValidBdPhone(phone)` for Bangladeshi phone validation

### Hook Naming

- Feature hooks: `use-<plural-domain>.ts` (e.g. `use-orders.ts`, `use-merchants.ts`)
- Sub-resource hooks: `use-<domain>-<sub>.ts` (e.g. `use-merchant-balance.ts`)
- Shared hooks: `use-<description>.ts` (e.g. `use-debounced-value.ts`)
- Non-hook utilities (e.g. `fetcher.ts`) do NOT get `use-` prefix

### Dialog Placement

- Feature dialogs: `src/features/<domain>/dialogs/<action>-dialog.tsx`
- Complex dialogs: `src/features/<domain>/dialogs/<action>-dialog/index.tsx`
- Shared base: `src/components/form-dialog.tsx`, `src/components/confirm-dialog.tsx`
- **Every modal/dialog must be in its own file** — never define dialog components inline in page components
- **Destructive actions always use a confirmation dialog** — wrap `delete`, `cancel`, `suspend`, `reject` etc. in `ConfirmDialog` or `confirm()` before executing

### Testing

- Mock `fetch()` with `vi.fn()` + `vi.mock("@/lib/hooks/fetcher")`
- Use `createMockOrder()` helper from `src/app/__tests__/test-utils.tsx`
- E2E selectors: centralized in `e2e/selectors.ts` (text-based, namespaced exports)
- Component tests use `.spec.tsx` extension

### Formatting

- Run `biome check --write .` before committing
- Import order: `@/` aliases before relative imports
- Biome handles all formatting (no Prettier)

### Coverage

- `pnpm test:coverage` runs the unit suite under `@vitest/coverage-v8` and
  fails if statements/branches/functions/lines drop below the floors in
  `vitest.config.ts` (50 / 45 / 40 / 52). A CI `coverage` job enforces it.
- Raise the floors as tests land — they are a regression guard, not a target.
  New code should come with tests, not with a lowered threshold.

## DataTable Pattern

Every data list page follows this structure:

### Page component

```tsx
"use client"
import { DataTable, type DataTableColumn, CellTwoRow, CellContent } from "@/components/data-table"
import { useOrders } from "@/features/orders/hooks/use-orders"

export function OrdersPageClient({ initialData, initialTotal }) {
  const {
    orders, total, setPage, setLimit,
    query, setQuery,
    sortId, sortDir, onSortChange,
    isLoading,
  } = useOrders({ initialData, initialTotal })

  const columns: DataTableColumn<Order>[] = [
    {
      id: "order", header: "Order", sortable: true,
      sortValue: (o) => o.id,
      cell: (o) => <CellContent className="font-medium">{o.id}</CellContent>,
    },
    {
      id: "name", header: "Name", sortable: true,
      sortValue: (u) => u.name,
      cell: (u) => <CellTwoRow primary={u.name} secondary={u.email} />,
    },
    {
      id: "actions", sticky: true, header: "", align: "right",
      cell: (row) => <DropdownMenu>...</DropdownMenu>,
    },
  ]

  return (
    <Card><CardContent className="p-0">
      <DataTable
        pinnedColumns={["order"]}
        id="dashboard-orders"
        searchable
        searchColumns={["order", "merchant"]}
        columns={columns}
        data={orders}
        getRowKey={(o) => o.id}
        emptyMessage="No orders match the current filters."
        loading={isLoading}
        serverPaginated
        total={total}
        query={query}
        onQueryChange={setQuery}
        onPageChange={(p, l) => { setPage(p); setLimit(l) }}
        serverSortId={sortId}
        serverSortDir={sortDir}
        onSortChange={onSortChange}
      />
    </CardContent></Card>
  )
}
```

### Key conventions

- **`pinnedColumns`**: Always pin the primary key column (e.g. `["order"]`, `["name"]`)
- **`id`**: Always set — enables column visibility persistence in localStorage
- **`serverPaginated`**: All list pages use server-side pagination via `useTableFilters`
- **`serverSortId` / `serverSortDir` / `onSortChange`**: Controlled sort from `useTableFilters`
- **`query` / `onQueryChange`**: Controlled search from `useTableFilters`
- **`toolbarLeft`**: Use for `<Tabs>` (status filtering) or `<QuickFilters>` (date/checkbox filters)
- **`loading`**: Pass `isLoading` from SWR
- **`getRowKey`**: Always provide a unique key extractor

### Column helpers

- `CellContent` — single-line truncated text with tooltip
- `CellTwoRow` — primary + secondary text (e.g. name + email)
- `sticky: true` — right-pinned actions column

### Status tabs pattern

```tsx
toolbarLeft={
  <Tabs value={tab} onValueChange={(v) => setTab(v)}>
    <TabsList>
      <TabsTrigger value="PENDING">Pending</TabsTrigger>
      <TabsTrigger value="APPROVED">Approved</TabsTrigger>
      <TabsTrigger value="ALL">All</TabsTrigger>
    </TabsList>
  </Tabs>
}
```

Tab changes call `setStatuses(TAB_STATUSES[tab])` + `setPage(1)` in the hook.

### Column definition shape

```ts
{
  id: string                    // stable key, also used as sort ID
  header: React.ReactNode      // column label
  cell: (row: T) => React.ReactNode
  sortable?: boolean
  sortValue?: (row: T) => string | number | boolean | null
  align?: "left" | "right" | "center"
  sticky?: boolean             // right-pin during horizontal scroll
  headClassName?: string       // e.g. "hidden sm:table-cell" for responsive hide
  cellClassName?: string
}
```

## Important

- **Read CONTRIBUTING.md** for full conventions (error handling, hooks, testing, DB, etc.)
- Never commit secrets or API keys
- Follow existing patterns — check neighboring files before adding new ones

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
