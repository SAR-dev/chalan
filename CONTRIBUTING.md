# Contributing

This document covers both the architectural conventions and the step-by-step
recipes for adding or changing code. The principles come first;
the recipes follow. Use the recipe that matches your task, use the exact paths
shown, and finish with the [verification checklist](#verification-checklist).

> Golden rule: **find the closest existing example and mirror it.** This
> codebase is highly consistent — almost every new thing has a twin already in
> the tree. Search for it before writing anything new.

> After changing any code, run **`pnpm ci:check`** (typecheck, lint, format) and
> **`pnpm ci:test`** (unit tests, build, E2E tests) to catch errors early. Fix
> warnings before committing.

---

## Where things live

```
src/app/
  api/<resource>/route.ts            collection endpoints (GET list, POST create)
  api/<resource>/[id]/route.ts       item endpoints (PATCH, DELETE)
  api/auth/[...all]/route.ts         Better Auth catch-all handler
  api/users/me/route.ts              current user profile (GET, PATCH)
  api/health/route.ts                health check endpoint (GET — unauthenticated)
  api/uploads/route.ts               file upload
  api/orders/bulk/route.ts           bulk order creation (Merchant only, up to MAX_BULK_ORDERS)
  api/orders/counts/route.ts         aggregate counts by status (GET)
  api/orders/payable/route.ts        aggregate payable amounts (GET)
  api/orders/[id]/<action>/route.ts  order lifecycle wrappers (see Recipe F)
  api/orders/[id]/receiver-note/route.ts  public endpoint — recipient adds a delivery note (no session)
  api/merchants/[id]/approve/route.ts     PATCH — admin approves a PENDING merchant (requires NID data)
  api/merchants/[id]/suspend/route.ts     PATCH — admin suspends a merchant
  api/merchants/[id]/reactivate/route.ts  PATCH — admin reactivates a suspended merchant
  api/merchants/[id]/pricing/route.ts     PATCH — admin updates merchant pricing
  api/merchants/[id]/balance/route.ts     GET balance + paginated transaction history
  api/merchants/[id]/balance/payment/route.ts  POST — merchant submits payment proof (creates PENDING tx)
  api/merchants/[id]/balance/payment/[txId]/confirm/route.ts  PATCH — admin confirms, reduces balance
  api/merchants/[id]/balance/payment/[txId]/reject/route.ts   PATCH — admin rejects (balance unchanged)
  api/merchants/[id]/balance/adjust/route.ts   POST — super admin manual credit/debit
  api/merchants/resend-verification/route.ts   POST — public: resend activation email for unverified merchant
  api/delivery-zones/route.ts              GET — public active zones list
  api/delivery-cities/route.ts             GET — public active cities list
  api/zone-pricing/route.ts                GET — public zone pricing (for fee estimation)
  api/admin/delivery-zones/route.ts        GET + POST — zone CRUD (Super Admin)
  api/admin/delivery-zones/[id]/route.ts   PATCH + DELETE — zone update/delete
  api/admin/delivery-cities/route.ts       GET + POST — city CRUD (Super Admin)
  api/admin/delivery-cities/[id]/route.ts  PATCH + DELETE — city update/delete
  api/admin/zone-pricing/route.ts          GET + POST — pricing CRUD (upsert on zone pair)
  api/admin/zone-pricing/[id]/route.ts     PATCH + DELETE — pricing update/delete
  api/admin/zone-delivery-time/route.ts    GET + POST — delivery-days CRUD (upsert on zone pair)
  api/admin/zone-delivery-time/[id]/route.ts DELETE — clear a lane's estimate
  api/riders/[id]/active/route.ts     PATCH — toggle rider active status
  api/payouts/route.ts                GET list, POST request (merchant self-service)
  api/payouts/[id]/approve/route.ts   PATCH — super admin approves
  api/payouts/[id]/reject/route.ts    PATCH — super admin rejects
  api/payouts/[id]/paid/route.ts      PATCH — super admin marks as paid
  api/team/route.ts                   GET list, POST create (staff accounts)
  api/team/[id]/active/route.ts       PATCH — toggle active
  api/team/[id]/warehouse/route.ts    PATCH — reassign warehouse
  api/announcements/active/route.ts   GET active announcements for current role (each with isNew)
  api/announcements/seen/route.ts     POST - stamp the reader's feed watermark (badge drains)
  api/audit-logs/route.ts             GET list (Admin/Super Admin only)
  api/email-logs/route.ts             GET list (Admin/Super Admin only)
  api/email-logs/[id]/route.ts        GET detail (bodies), PATCH mark failed email as sent
  api/admin/mail-config/test/route.ts POST — send a test email from unsaved Add Config credentials (Super Admin)
  api/cron/cleanup-sessions/route.ts  DELETE expired sessions (hourly)
  api/cron/cleanup-audit-logs/route.ts  DELETE old audit log entries (daily)
  api/cron/cleanup-email-logs/route.ts  DELETE old sent email logs (daily)
  <role>/<page>/page.tsx             a screen for a role (dashboard|merchant|warehouse|rider)
  landing/                            public landing page
  login/                              login screen
  register/                           merchant registration screen (no session)
  terms/page.tsx                      public terms and conditions (rendered from src/content/terms.md)
  privacy/page.tsx                    public privacy policy (rendered from src/content/privacy.md)
  track/page.tsx                      public order tracking search form
  track/[id]/page.tsx                 public order tracking detail page
  announcements/[id]/page.tsx         shared announcement detail page (authenticated,
                                       role-gated server-side; markdown body, "Go back"
                                       = one history entry; writes nothing on open)
                                       + layout.tsx chrome (AuthProvider + TopNav)
  dashboard/announcements/new/page.tsx        create page (SUPER_ADMIN gate, form in
                                       features/announcements/components/announcement-form.tsx)
  dashboard/announcements/[id]/edit/page.tsx  edit page (same gate + form, prefilled)
  uploads/[...path]/route.ts          local storage file serving
  manifest.ts                         PWA web app manifest (served at /manifest.webmanifest)
  pwa-icon/[size]/route.tsx           PWA icons — 192/512 PNG generated from the brand SVG
  icon.tsx, apple-icon.tsx            favicon + apple touch icon (ImageResponse)
src/features/<name>/
  components/                        presentational pieces for this domain
  dialogs/                           dialogs that drive this domain's mutations
  hooks/use-<resource>.ts            the SWR resource hook (the ONLY data source)
  transitions.ts                     orders only — the state machine
src/components/                          generic, feature-agnostic UI only
  confirm-dialog.tsx                 reusable confirmation dialog (title/desc/variant/loading)
  data-table.tsx                     generic data table with pagination, search, sort, CSV export
  data-error-banner.tsx              global error banner aggregating SWR errors per resource
  date-range-picker.tsx              date range filter with native inputs + quick presets
  quick-filters.tsx                  multi-select filter dropdown (or modal for large filter sets)
  form-dialog.tsx                    reusable form dialog for create/edit flows
  image-upload.tsx                   image upload with compression
  image-zoom.tsx                     image zoom modal
  page-header.tsx                    page title / description
  search-input.tsx                   search input wrapper
  stat-card-list.tsx                 stat card grid
  status-badge.tsx                   generic status badge
  markdown.tsx                       client component wrapping react-markdown with app styling
  public-header.tsx                  minimal public header (brand logo + theme toggle)
  public-footer.tsx                  reusable public footer (terms, privacy, track links)
  role-badge.tsx                     role display badge
  theme-provider.tsx, theme-toggle.tsx  dark mode support
  service-worker-register.tsx          PWA service worker registration (production only)
  charts/                            recharts wrappers (area-chart.tsx, bar-chart.tsx, pie-chart.tsx)
  ui/                                shadcn-style primitives (button, dialog, switch, skeleton, progress, etc.)
  navigation/                        app chrome per role: role-sidebar.tsx (brand + nav only),
                                     top-nav.tsx (all breakpoints: menu search, announcements
                                     bell, theme, avatar — absorbs the old mobile-header.tsx),
                                     right-nav.tsx (avatar → account slide-over: identity,
                                     Help & resources links, theme, sign out),
                                     command-palette.tsx (menu search,
                                     ⌘K/Ctrl+K), sidebar wrappers per role
src/proxy.ts                             edge proxy — role isolation + upload rate limiting + per-request CSP nonce (merged from middleware.ts)
src/lib/
  auth.ts, auth-client.ts            Better Auth server + client config
  env.ts                             environment variable validation (validated at boot via src/instrumentation.ts)
  types.ts                           re-exports entity types from schema
  validation.ts                      zod schemas + parseBody; all shared validation schemas
  api-auth.ts                        requireSession() — single JOIN across session + user + profile
  api-response.ts                    standardized error responses (unauthorized, forbidden, notFound, etc.)
  audit.ts                           logAudit() — the only audit_log writer
  announcements.ts                   shared announcement queries (live + role-targeted
                                     predicate, isNew against the reader's
                                     `profile.announcementsSeenAt` watermark) — one
                                     definition for the API route, feed pages,
                                     and detail page
  markdown.ts                        stripMarkdown() — one-line plain-text excerpts for previews
  pagination.ts                      PaginatedResponse<T>, parsePagination(), parseStatusFilter(), parseSort(), applySort(), parseDateRange()
  rate-limit.ts                      sliding-window rate limiter + getClientIp()
  csv.ts                             CSV generation and download helpers
  nav-config.ts                      sidebar entries per role + announcementsPathForRole() /
                                     navConfigForUser() helpers. Items may carry
                                     `placement: "rightnav"` (Help, and Support
                                     for the self-service roles): they stay in `items`
                                     for grants/guard/palette but render in RightNav —
                                     see sidebarVisibleItems()/rightNavItems()
  constants.ts, pricing.ts           cross-cutting domain logic (status/role arrays, label/tone maps)
  mailer.ts, mail-templates.ts       transactional email (+ email_log history)
  utils.ts                           general utilities (cn helper, etc.)
  upload-image.ts                    client-side image upload with compression
  db/index.ts                        Drizzle client — initialises pg pool, exports db (primary/writes), dbRead (read-replica, falls back to primary), and pool
  db/schema.ts                       re-exports schema.postgres (kept for import-path compat)
  db/schema.postgres/                PostgreSQL table definitions (pg-core types), split by domain:
                                     enums.ts, helpers.ts, auth.ts, warehouses.ts, logistics.ts,
                                     merchants.ts, orders.ts, finance.ts, platform.ts + index.ts barrel
  db/seed/                           per-entity seed modules (riders, orders, merchant-balances, etc.)
  db/seed.ts                         main seed runner
  db/seed-credentials.ts             credential seeding
  storage/                           file upload backends (local / R2)
  hooks/fetcher.ts                   SWR fetcher, RESOURCE_KEYS, swrOptions
  hooks/use-debounced-value.ts       shared debounce hook used by all search hooks
  hooks/use-data-error.ts            aggregates error state for the global banner
src/config/
  site.json, site.ts                 brand name, tagline
  content.ts                         page titles/descriptions (copy)
  stat-card-labels.ts                stat card labels & hints per area/page
  table-column-labels.ts             table column headers per entity
src/icons/
  SiteIcon.tsx                       brand icon SVG (exported constants & component)
src/content/
  terms.md, privacy.md               markdown files rendered at /terms and /privacy via react-markdown
drizzle/
  postgres/                          PostgreSQL migration files
scripts/
  check-auth.ts                      verifies the Better Auth session table is reachable
  init-extensions.sql                creates PostgreSQL extensions on first boot
src/lib/db/seed/seed-content.ts          deterministic seed constants — single source of truth for all seed entity data
```

---

## 1. Feature-based folder structure

Domain code lives under `src/features/<name>/`, **not** in kind-based folders like
`src/components/dialog/` or `src/components/badge/`. Each feature owns its UI, hooks, and
domain logic:

```
src/features/
  orders/
    components/    presentational pieces (badges, cells, timelines)
    dialogs/       dialogs that drive this domain's mutations
    hooks/         use-orders.ts (the resource hook — see §3)
    transitions.ts the order state machine (see §2)
  riders/
  merchants/       includes use-merchant-balance.ts hook + balance-payment-dialog.tsx
  warehouses/      hooks/use-warehouses.ts only (simple resource, no feature-specific UI)
  payouts/
  pickup-locations/
    components/    pickup-locations-manager.tsx
    hooks/         use-pickup-locations.ts
  team/            dialogs/create-team-member-dialog.tsx
  account/         hooks/use-auth.tsx (the auth context)
  audit-logs/      hooks/use-audit-logs.ts — read-only, Admin/Super Admin only
  email-logs/      hooks/use-email-logs.ts — read-mostly, Admin/Super Admin only
  announcements/
    components/    announcement-bell.tsx, announcement-form.tsx (the create/edit
                   page form), announcements-inbox.tsx, markdown-editor.tsx
                   (Write = CodeMirror 6 source with toolbar + Ctrl/Cmd+B·I,
                   Preview = the app's Markdown renderer), announcement-status-badge.tsx
    hooks/         use-announcements.ts, use-active-announcements.ts
    (no dialogs/ — create and edit are pages under
     dashboard/announcements/{new,[id]/edit}, not modals)
```

Not every feature needs all three subdirectories — a simple read-only resource
(e.g. `audit-logs`, `warehouses`) may only need `hooks/`. Add `src/components/` and
`dialogs/` only when the feature has UI beyond what the shared `DataTable`,
`StatCardList`, and `page-header` provide.

`src/components/` keeps **only generic, feature-agnostic** building blocks
(`ui/**`, `data-table.tsx`, `page-header.tsx`, `status-badge.tsx`,
`confirm-dialog.tsx`, `form-dialog.tsx`, `ui/skeleton.tsx`, `navigation/**`,
etc.). `src/lib/` keeps
cross-cutting concerns (`types.ts`, `constants.ts`, `db/**`, `validation.ts`,
`pricing.ts`, the SWR `hooks/fetcher.ts` and `hooks/use-debounced-value.ts`,
`hooks/use-data-error.ts`, auth glue, mailer, storage).

**One documented exception:** `src/components/data-table.tsx` imports
`useAuth()` from `src/features/account` to default its `pageSize` prop to the
signed-in account's saved rows-per-page preference
(`profile.tableRowsPerPage`, see Recipe A's example below). This was a
deliberate tradeoff — the alternative was threading `pageSize` through all 18+
page-level call sites — and it's the only place in `src/components/` allowed to
reach into `src/features/`. Don't use this as precedent for other components;
ask before adding a second one.

### Only split a component into a folder when there's real content

A component stays a single flat `.tsx` file. Promote it to a folder
(`index.tsx` + `types.ts`) **only when it has genuine local types or constants**
worth isolating. Do not create empty or near-empty `types.ts` files.

```
# Good: has a real local Props interface
src/features/riders/dialogs/edit-rider-dialog/
  index.tsx     component
  types.ts      EditRiderDialogProps

# Good: no local types/constants -> stays flat
src/features/merchants/dialogs/pricing-dialog.tsx
```

Constants/options shared by sibling components live in their own flat module
rather than being duplicated. For example, the rider task-type labels and
`<Select>` options used by both the create and edit rider dialogs live in
`src/features/riders/dialogs/task-type.ts`.

Entity types (`Order`, `Rider`, `Merchant`, …) are derived from
`src/lib/db/schema.ts` and re-exported from `src/lib/types.ts` — the single source of
truth. Only component-local Props/input shapes that don't already exist there
belong in a feature's `types.ts`. Do not fragment `src/lib/types.ts` or
`src/lib/constants.ts`.

---

## 2. Order state machine (`src/features/orders/transitions.ts`)

Every order lifecycle transition is a **declarative definition**, not a
hand-written route handler. A transition declares who may run it, what body it
accepts, what guards must hold, and what fields it writes:

```ts
const transitions = {
  approve: {
    authorize: (session) => session.role === "SUPER_ADMIN",
    schema: approveSchema, // optional zod schema for the body
    guard: async ({ order }) => {
      // ordered checks; first failure wins
      if (order.status !== "PENDING")
        return { error: "Order is not pending", status: 409 }
    },
    buildUpdate: ({ body, now }) => ({ status: "APPROVED", approvedAt: now }),
  },
  // ...14 transitions total:
  // approve, assign-pickup-rider, dispatch, out-for-pickup, picked-up, receive,
  // out-for-delivery, delivered, failed, reattempt, return,
  // set-expected-delivery, settle-cod, cancel
}
```

The shared runner `applyOrderTransition(name, orderId, req)` performs the
identical sequence for all of them: resolve session → authorize → parse body
→ **(inside one transaction)** load order with a row lock → run guard → write
update → return the updated order. **Route files are thin wrappers** — they
only name the transition:

```ts
// src/app/api/orders/[id]/approve/route.ts
import { applyOrderTransition } from "@/features/orders/transitions"
export const PATCH = (req, ctx) => applyOrderTransition("approve", req, ctx)
```

To add a lifecycle action: add one entry to `transitions`, add a one-line route
wrapper, and add a spec case in
`src/app/api/orders/[id]/transitions.spec.ts`. Never duplicate the
auth/parse/guard/update plumbing inline.

> **`receiver-note`** is deliberately outside the state machine — it is a
> public endpoint (no session) that lets a parcel recipient add a delivery
> note via the tracking page. It is not a lifecycle transition and does not
> appear in `transitions.ts`.

### Transaction boundary + row lock

The fetch → guard → write sequence inside `applyOrderTransition` runs inside
`db.transaction(async (tx) => { ... })`, and the initial fetch uses
`.for("update")` to lock the order row for the duration of the transaction:

```ts
return await db.transaction(async (tx) => {
  const [orderRow] = await tx
    .select()
    .from(order)
    .where(eq(order.id, orderId))
    .for("update")
    .limit(1)
  if (!orderRow)
    return NextResponse.json({ error: "Order not found" }, { status: 404 })

  const guardError = await def.guard({ order: orderRow, session: me, body })
  if (guardError)
    return NextResponse.json(
      { error: guardError.error },
      { status: guardError.status },
    )

  const [updated] = await tx
    .update(order)
    .set(await def.buildUpdate({ order: orderRow, session: me, body }))
    .where(eq(order.id, orderId))
    .returning()
  return NextResponse.json(updated)
})
```

Without this, two concurrent transitions on the same order (two admins
approving at once, a rider double-submitting a delivery outcome) could both
read the same pre-write status, both pass the guard, and both write —
corrupting state (e.g. double-incrementing `deliveryAttempts`, or an approve
and a reject both succeeding). The lock makes the second request block until
the first commits, then re-fetches the now-updated row, so its guard correctly
sees the new status and fails closed instead of racing.

This is the project's general pattern for any guard-then-write sequence, not
just orders — see the matching shape in `src/app/api/payouts/[id]/approve/route.ts`,
`.../paid/route.ts`, and `src/app/api/merchants/[id]/balance/payment/[txId]/confirm/route.ts`
(balance payment confirm). When you add a new endpoint that reads a row, checks
its status, and conditionally writes to it, wrap the read + guard + write in
one `db.transaction()` with `.for("update")` on the initial read. A plain
`db.transaction()` with no lock (as in `src/app/api/orders/route.ts`'s single-order
`POST` and `src/app/api/orders/bulk/route.ts`'s bulk insert, both of which read
`MAX(code)` and insert inside the same transaction, or the
payout-request/payout-reject multi-table writes) is enough when the only risk
is multiple _inserts_ racing on a derived value, not a stale-read guard on a
row that already exists.

**Mocked `db` in tests**: if a spec hand-mocks `@/lib/db` (see
`transitions.spec.ts`), the mock's `transaction` must run the callback against
the same mock object so it shares state with every `select`/`update`
assertion, and `.for()` on the select chain must be a no-op passthrough —
otherwise adding a transaction boundary breaks every test that exercises the
wrapped code path.

---

## 3. Per-resource SWR hooks

There is **no global data context**. Each resource has a focused hook in
`src/features/<name>/hooks/use-<resource>.ts` built on SWR. A hook owns: the fetch
key, the typed data, loading/error state, any derived selectors, the
mutation functions, and **the pagination/search/filter state** for server-side
paginated tables. All API endpoints return `PaginatedResponse<T>`
(`{ data, total, limit, offset }`) and the hook manages `page`, `limit`,
`query`, and `statuses` state, building the URL with query params.

```ts
export function useMerchants() {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_TABLE_ROWS_PER_PAGE)
  const [statuses, setStatuses] = useState<string[] | undefined>(undefined)
  const debouncedQuery = useDebouncedValue(query)

  const url = buildUrl(KEY, {
    limit,
    offset: (page - 1) * limit,
    q: debouncedQuery.trim() || undefined,
    statuses,
  })

  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR<PaginatedResponse<Merchant>>(
    currentUser ? url : null,
    jsonFetcher,
    swrOptions,
  )
  const merchants = response?.data ?? []
  const total = response?.total ?? 0

  async function approveMerchant(id: string) {
    // optimistic update + revalidate via mutate()
  }

  return {
    merchants,
    total,
    isLoading,
    error,
    approveMerchant,
    query,
    setQuery,
    page,
    setPage,
    limit,
    setLimit,
    statuses,
    setStatuses,
  }
}
```

Rules:

- **Read data only through these hooks** — never re-introduce `fetch()` +
  `useState`/`useEffect` loading plumbing in components. (The one exception is
  the pre-auth `src/app/register` flow, which runs before a session exists and so
  cannot use these session-scoped hooks.)
- **Cross-resource mutations** coordinate caches explicitly. When a mutation
  changes more than one resource (e.g. a payout request touches both payouts and
  orders), call `mutate()` on every affected key, not just the primary one.
- Authentication/session lives in `src/features/account/hooks/use-auth.tsx`
  (`useAuth()`), the one piece of shared state that remains a React context.
- The global "failed to load" banner is driven by `src/lib/hooks/use-data-error.ts`,
  which aggregates the error state of every resource key. Pass an optional
  `keys` array to scope it to specific resources.

### Server-side search and pagination

Every API GET endpoint supports `?q=`, `?limit=`, `?offset=`, and `?status=`
query params. Endpoints that support date-range filtering also accept
`?from=<ISO>&to=<ISO>` — use `parseDateRange()` from `src/lib/pagination.ts` to
parse them (it sets `to` to 23:59:59.999 for inclusive end-of-day matching).
The hook manages all of this state and passes it to the `DataTable` via props:

```tsx
<DataTable
  id="my-table"
  serverPaginated
  pinnedColumns={["order"]}
  columns={columns}
  data={merchants}
  total={total}
  page={page}
  pageSize={limit}
  onPageChange={setPage}
  onPageSizeChange={setLimit}
  searchQuery={query}
  onSearchChange={setQuery}
  getRowKey={(r) => r.id}
/>
```

### Server-side sorting

Endpoints that support sorting accept `?sort=<columnId>&sortDir=asc|desc`.
Use `parseSort()` and `applySort()` from `src/lib/pagination.ts`:

```ts
import { parseSort, applySort } from "@/lib/pagination"
import { dbRead } from "@/lib/db"

const sort = parseSort(req, {
  name: thing.name,
  createdAt: thing.createdAt,
})

let query = dbRead.select().from(thing).where(where)
if (sort) query = applySort(query, sort)
```

`parseSort` accepts a `columnMap` that maps client-side column IDs (from
`DataTable`) to Drizzle column references. Unknown column IDs are silently
ignored. If the hook exposes a `sort`/`setSort` pair, pass it through to the
`DataTable` the same way as `page`/`setPage`.

Rules:

- **Most tables get `id`** and use `serverPaginated` mode. The `DataTable`
  handles page navigation, search input, and CSV export. Column visibility is
  persisted in localStorage per table `id`. The exceptions are:
  - Merchant overview (`src/app/merchant/page.tsx`) — paginates client-side from
    the fetched list.
  - Warehouse COD settlement (`src/app/warehouse/cod-settlement/page.tsx`) —
    filters client-side by tab on the already-fetched orders list.
- **If tabs change the column set, scope `id` per tab** (e.g.
  `` `warehouse-dispatch-${tab.toLowerCase()}` ``), not one shared id for the
  page. `DataTable` keeps one column-visibility selection per `id`; if
  multiple tabs reuse the same `id` while passing different `columns` arrays,
  the visibility state from whichever tab mounted first gets intersected
  against the other tabs' column ids, silently hiding any column unique to
  them. A shared `id` is only correct when every tab renders the **same**
  columns and only the row filter (`statuses`) changes — see
  `src/app/dashboard/orders/page.tsx`. See `src/app/warehouse/completed/page.tsx`
  for a same-column, multi-tab case where the id is still shared.
- **Hooks own the pagination/search state.** The `DataTable` never manages its
  own page or search — it receives and reports via props.
- **Tab/status filters** pass a `statuses` array to the hook, which adds
  `?status=A,B,C` to the URL. The hook resets `page` to 1 on tab change.
- **Stat cards and tab counts** use the `all*` variants (unpaginated full
  lists) so they stay stable regardless of the current page or search.
- **Column definitions** for complex tables should be extracted to a feature
  component file (`src/features/<name>/components/<resource>-table-columns.tsx`)
  as a set of **column-builder factory functions**, each producing one
  `DataTableColumn<T>`. Factories that need page-scoped data (name lookups,
  etc.) take a small lookup function as a parameter rather than reaching into
  hooks themselves — keeping them pure and reusable across pages. A convenience
  hook (e.g. `useOrderColumns()`) may compose the standard set for one canonical
  page, but the factories themselves are the source of truth.
  **Column headers must always use `columnLabels` from
  `src/config/table-column-labels.ts`** rather than hardcoded strings — add
  a new entry there when introducing a new column. See
  `src/features/orders/components/order-table-columns.tsx` for the canonical
  example: it exports `orderCodeColumn()`, `merchantColumn()`,
  `recipientNameColumn()`, `riderColumn()`, `parcelWeightColumn()`,
  `warehouseColumn()`, `deliveryAddressColumn()`, `collectibleColumn()`,
  `merchantNoteColumn()`, and `statusColumn()`, which all six
  order-table pages import individually and compose into their own `columns`
  array. Page-specific columns (action menus, financial breakdowns, resolution
  notes) are not centralized — they stay inline in the page file.

### Order table patterns by role

All order tables share the same `useOrders()` hook and column factories,
but each view composes a different subset of columns and applies different
tab/status filters suited to that role's workflow. Two warehouse surfaces are
**not** tables at all — the Ongoing board and the Overview — noted below.

| View                     | File                                    | Tabs / filter                              | Column set                                                                                                                                                                             | Actions                                                                     |
| ------------------------ | --------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Admin orders**         | `src/app/dashboard/orders/page.tsx`     | PENDING · APPROVED · ALL                   | `useOrderColumns()` (all base columns) + inline actions                                                                                                                                | Approve (PENDING only), Cancel                                              |
| **Warehouse approval**   | `src/app/warehouse/orders/page.tsx`     | PENDING only (forced, no tabs)             | `orderCodeColumn`, `merchantColumn`, `recipientName(+Phone)`, `parcelWeightColumn`, `deliveryAddressColumn`, `deliveryTypeColumn`, `collectibleColumn`, fees, `merchantNoteColumn`, `createdAtColumn`, `statusColumn`, `riderColumn(pickup)`, `riderColumn(delivery)` | Approve (PENDING, own hub only — ownership guard in the transition) + Cancel                                                                 |
| **Warehouse completed**  | `src/app/warehouse/completed/page.tsx`  | ALL · DELIVERED · CANCELLED · RETURNED     | Read-only: order code + status, merchant, receiver, delivery address, closed-at, outcome, resolved-by, collectible. No actions column and **not** `selectable`            | None — a closed parcel has nothing left to do                                                                 |
| **Warehouse exceptions** | `src/app/warehouse/exceptions/page.tsx` | FAILED_ATTEMPT only (forced, no tabs)      | Subset focused on delivery outcome                                                                                                                                                     | Resolve (FAILED_ATTEMPT only, assigned warehouse)                           |
| **Rider pickup queue**   | `src/app/rider/pickup/page.tsx`         | TO_COLLECT · COLLECTED                     | Inline: order code, merchant, pickup location, parcel, warehouse, city, status                                                                                                         | Mark picked up (APPROVED only, assigned pickup rider)                       |
| **Rider delivery queue** | `src/app/rider/delivery/page.tsx`       | TO_DELIVER · COMPLETED                     | Inline: order code, recipient, delivery address, parcel, collectible, status                                                                                                           | Out for delivery (IN_TRANSIT only, assigned delivery rider), Record outcome |
| **Merchant overview**    | `src/app/merchant/page.tsx`             | None (client-filtered, unpaginated)        | Inline: tracking, pickup location, recipient, weight, delivery charge, collectible, notes, status                                                                                      | Cancel (PENDING only)                                                       |

The two warehouse surfaces that are not tables:

- **Warehouse overview** (`src/app/warehouse/page.tsx` → `overview-client.tsx`)
  is stats only: a `StatCardList` of one tile per status the admin can still act
  on, plus outstanding COD. It renders no `DataTable` at all, and its counts come
  from two cached aggregate queries on the server rather than from a fetched list.
- **Warehouse ongoing** (`src/app/warehouse/ongoing/`) is a kanban board, not a
  `DataTable`. Columns come from the pure helpers in
  `src/features/orders/kanban-grouping.ts` — group by status or by whoever holds
  the parcel's next leg — and each card carries its own action buttons. Rows are
  server-fetched with a hard cap (500) rather than paginated.

Key differences to know when adding a column or action:

- **Merchant overview** uses the paginated `orders` list filtered client-side
  to `currentMerchant.id`. It does **not** use `serverPaginated` — it is the
  one order table that paginates locally. It now also includes a `DateRangePicker`
  and a charts section (area/bar/pie) below the stat cards.
- **Merchant finance** and **rider pages** also include `DateRangePicker`
  filters — date state is managed server-side via `?from=`/`?to=` query params
  when using `useOrders`, or client-side via local `useState` for non-order
  data (merchant finance payable orders).
- **Rider views** define all columns inline and intentionally omit financial
  columns (`collectibleColumn`) and admin-only columns.
  Don't pull `useOrderColumns()` into rider pages.
- **Warehouse approval** renders both pickup and delivery rider columns side by
  side via `riderColumn("pickup", riderName)` and
  `riderColumn("delivery", riderName)`. The Admin view uses `useOrderColumns()`
  which composes the same factories as a convenience hook.
- **Single-status warehouse queues force their filter.** Approval and Exceptions
  call `setStatuses([...])` in a `useEffect` with no tab state to change it — the
  filter is a constant of the page, not a control. Completed is the one warehouse
  page with a tab bar, because it covers three statuses.
- **Tab counts** on rider views derive from `myPickups` / `myDeliveries` (client-side
  filtered by rider ID) and on Exceptions from `needsAction` (client-side filtered
  by warehouse ID). Badge numbers
  reflect only the rows relevant to that tab and role scope, not the raw API response.
  `setStatuses(...)` is called in a `useEffect` on tab change and always resets `page` to 1.
  The DataTable `data` prop receives the same filtered array, so the tab count badge
  and the visible row count always agree.
- **CSV export** is derived automatically on every table. Columns with a string
  header and a `sortValue` extractor are exported (all rows matching the
  current search/filter/sort), mirroring the user's column-visibility settings;
  the footer hides the "Download CSV" button when nothing is exportable (no
  such columns, or no rows). The Admin orders table keeps an explicit `csv` +
  `csvData` config for a curated column set — an explicit `csv` prop always
  wins over the derived one.

- **Merchant orders support CSV bulk import.** The merchant order table's
  toolbar has an **Import CSV** entry (`bulk-import-open`) that navigates to
  the dedicated page `/merchant/orders/import` (state machine in
  `src/app/merchant/orders/import/import-client.tsx`, with the pure
  parsing/resolution modules under `src/features/orders/bulk-import/`):
  download the template, upload or paste up to 50 rows, preview every row in an
  **editable** table (click any cell to fix it in place), then import
  **all-or-nothing** through the
  existing `POST /api/orders/bulk` — the v1 flow deliberately adds no server
  code, fees or IDs are never accepted from the file, and empty notes are
  auto-tagged `[CSV import YYYY-MM-DD]` for auditability. The column spec,
  header aliases, limits and test plan live in
  `src/features/orders/bulk-import/template.ts` — that file is the spec (there
  is no separate format document), and `template.spec.ts` pins it.
  Keep changes to this flow aligned with it.

- **Optimistic mutations use two-step revalidation.** The bound `mutate()`
  applies the optimistic update with `{ revalidate: false, populateCache: true }`
  so the UI responds instantly. Immediately after, call the SWR top-level
  `mutate` (imported as `globalMutate`) to revalidate the **pagination keys**
  and any **aggregate/derived endpoints**:

  ```ts
  import useSWR, { useSWRConfig, mutate as globalMutate } from "swr"

  const { mutate: _globalMutate } = useSWRConfig()
  const KEY = "/api/orders"

  // In the mutation function:
  await mutate(asyncFn, {
    optimisticData,
    revalidate: false,
    populateCache: true,
  })
  await globalMutate(KEY)
  _globalMutate((key: string) => key.startsWith(`${KEY}/counts`))
  _globalMutate((key: string) => key.startsWith(`${KEY}/payable`))
  ```

  Aggregate endpoints (`/api/orders/counts`, `/api/orders/payable`) carry
  server-computed values and must be revalidated explicitly since they are
  separate SWR keys from the list endpoint.

- **When using `useSWRConfig`'s `mutate`** (imported as `_globalMutate`), the
  same filter-function pattern applies — SWR's config-level `mutate` does
  prefix matching, so a bare string revalidates every key starting with that
  prefix. Use an exact-match filter to scope:

  ```ts
  const { mutate: _globalMutate } = useSWRConfig()

  // Scope to exact key only — avoids revalidating unrelated parameterised keys
  _globalMutate((key: string) => key === KEY)
  ```

  This matters especially when a hook has multiple SWR subscriptions (e.g.
  `useTeam` has both a paginated key and an `allTeam` key — both use
  `/api/team` as a prefix).

---

## 3.5. Audit log (`src/lib/audit.ts`)

Every state-changing mutation made by an Admin or Super Admin (and, where a
role shares a write path with them — e.g. Warehouse Admin riders, RIDER order
transitions) should be recorded to the `audit_log` table through the single
entry point:

```ts
import { logAudit } from "@/lib/audit"

await logAudit({
  actor: { userId: me.userId, name: me.name, role: me.role },
  action: "MERCHANT_APPROVED", // SCREAMING_SNAKE_CASE verb
  entityType: "merchant", // lowercase, matches the schema table name
  entityId: updated.id,
  description: `Approved merchant ${updated.businessName}`, // human-readable, shown directly in the table
  metadata: { ... }, // optional structured context (old/new values, etc.)
})
```

Rules:

- **Call it after the write succeeds**, not before — never log an action that
  didn't actually happen (e.g. a guard rejected it, or the row wasn't found).
  In a `db.transaction()` flow, capture the committed row into a plain
  variable/object _inside_ the transaction callback and check it for
  non-null _after_ the transaction resolves, then log — don't log from
  inside the callback itself, since a transaction can still be rolled back
  by the caller after the callback returns.
- **`logAudit()` never throws.** A logging failure must not break the request
  it's describing — it only writes to `console.error`. Don't wrap calls in
  your own `try/catch`; the helper already swallows errors.
- **One call per mutation**, placed in the route file (or, for orders, in
  `applyOrderTransition` itself — that single hook covers all ten
  transitions, so don't add per-transition calls).
- `action` is a short machine-readable verb in `SCREAMING_SNAKE_CASE`,
  generally `<ENTITY>_<VERB>` (`WAREHOUSE_CREATED`, `RIDER_DEACTIVATED`,
  `PAYOUT_REJECTED`). `entityType` is the lowercase, singular table name
  (`merchant`, `payout_request`, `order`) — used for search/filtering, not
  shown directly to the reader.
- Resources that are purely merchant/rider self-service (e.g.
  `pickup_location`) are **not** audited — this trail exists to track actions
  _by_ the privileged roles, not every write in the system.

The trail itself is read-only and visible only to Admin and Super Admin, at
`/dashboard/audit-logs` (`src/app/api/audit-logs/route.ts`,
`src/features/audit-logs/hooks/use-audit-logs.ts`). It has no create/update/delete
UI — `logAudit()` is the only writer, by design.

---

## 3.6. API response helpers (`src/lib/api-response.ts`)

Every API route uses standardized response helpers instead of raw
`NextResponse.json()` for error responses:

```ts
import {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  conflict,
} from "@/lib/api-response"

if (!me) return unauthorized()
if (me.role !== "SUPER_ADMIN") return forbidden()
if (!row) return notFound()
```

Available helpers: `unauthorized()` (401), `forbidden(msg?)` (403),
`notFound(msg?)` (404), `badRequest(msg)` (400), `conflict(msg)` (409),
`serverError(msg?)` (500), `errorResponse(msg, status)` (generic).

Use `NextResponse.json()` only for **successful** responses (200, 201) and
custom error shapes (e.g. validation errors with a `rows` array). All 401/403/404
responses must go through these helpers.

### Rate limiting (`src/lib/rate-limit.ts`)

Write-heavy endpoints (order creation, bulk creation, payout requests, etc.)
are protected by a sliding-window rate limiter:

```ts
import { rateLimit, getClientIp } from "@/lib/rate-limit"

const ip = getClientIp(req)
const { allowed } = rateLimit(`orders:${ip}`, { windowMs: 60_000, max: 10 })
if (!allowed) return errorResponse("Too many requests", 429)
```

The rate limiter is in-memory (single-instance). In the multi-instance Docker
deployment, each container enforces limits independently — a client hitting
different containers can exceed the intended cap. For multi-host deployments,
swap the internal `Map` for a Redis/Upstash store so limits are shared globally.

### Read replica (`src/lib/db/index.ts`)

`src/lib/db/index.ts` exports two Drizzle instances:

- **`db`** — always connects to `DATABASE_URL` (primary). Use in all write
  handlers (POST, PATCH, DELETE) and transactions.
- **`dbRead`** — connects to `DATABASE_URL_READ_ONLY` when set, otherwise
  falls back to the primary pool. Use in all GET handlers.

This is a zero-config pattern — in development with no replica configured,
`dbRead` behaves identically to `db`. In production, set
`DATABASE_URL_READ_ONLY` and all GET queries are automatically offloaded to
the replica.

**Rule:** GET handlers import `dbRead` (or alias it as `db` in read-only
files). Mixed files (GET + POST/PATCH/DELETE) import both and use the
appropriate instance per handler. Write-only files (no GET) continue using
only `db`.

---

## 3.7. Confirmation dialogs (`src/components/confirm-dialog.tsx`)

Reusable confirmation dialog for destructive or semi-destructive actions
(approve, suspend, cancel, settle, etc.). It wraps `@base-ui/react/dialog`
and renders a title, description, action button with loading spinner, and
cancel button.

```tsx
import { ConfirmDialog } from "@/components/confirm-dialog"
;<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Approve merchant"
  description={`Approve "${merchant.businessName}"? They will gain access to the platform.`}
  confirmText="Approve"
  loading={submitting}
  onConfirm={async () => {
    setSubmitting(true)
    const res = await approveMerchant(merchant.id)
    setSubmitting(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Merchant approved.")
    setOpen(false)
  }}
/>
```

Props: `open`, `onOpenChange`, `title`, `description`, `confirmText`,
`variant` (`"default"` | `"destructive"`), `loading`, `onConfirm`.

Rules:

- Use `ConfirmDialog` for **any action that changes state** — never rely on
  the browser's built-in `window.confirm()`.
- Place the dialog state (`open`/`setOpen`) in the page or parent component
  that owns the triggering button. The dialog receives the state as props.
- Always pass `loading={submitting}` so the confirm button shows a spinner
  and is disabled during the API call.
- **Never** nest `ConfirmDialog` inside a `DropdownMenu` — close the menu
  first (via state) or trigger from a standalone button. Nested popovers
  break focus management.

### DropdownMenu action columns

Table action columns use `DropdownMenu` from `@base-ui/react/dropdown-menu`
for consistency. The pattern:

```tsx
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"

{
  id: "actions",
  sticky: true,
  header: "",
  align: "right",
  headClassName: "w-12",
  cell: (row) => {
    const canEdit = row.status === "ACTIVE"
    return (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            {canEdit ? (
              <DropdownMenuItem onSelect={() => handleAction(row)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>No actions</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  },
}
```

Rules:

- Trigger is always `<MoreHorizontal>` icon in a ghost icon button, with a
  `<span className="sr-only">Actions</span>` for screen readers.
- `sticky: true` keeps the action column pinned to the **right** during
  horizontal scroll. For left-side pinning (primary identifier columns like
  order code or name), use the `pinnedColumns` prop on `<DataTable>` instead.
- `align="end"` so the menu opens to the left of the trigger on narrow
  screens.
- `w-48` on the content for consistent width across all action menus.
- **Always render the DropdownMenu** — never return `null` or hide the trigger
  when no actions apply. Instead, show a disabled `<DropdownMenuItem disabled>No actions</DropdownMenuItem>`
  so the column stays visually consistent across all rows.
- Items that open a destructive confirmation should close the menu first
  (via `onSelect` setting state) before showing the `ConfirmDialog`.

---

## 3.8. Merchant balance & platform fee

Every order creation atomically inserts an `ORDER_CHARGE` balance transaction and upserts the merchant's running total in `merchant_balance` (positive = merchant owes the platform). This happens inside the same `db.transaction()` as the order insert, in both `src/app/api/orders/route.ts` and `src/app/api/orders/bulk/route.ts`.

**Balance lifecycle:**

| Step                     | Who                           | What                                                                              |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------- |
| Order placed             | System (in order transaction) | `ORDER_CHARGE` row inserted; `merchant_balance` upserted                          |
| Merchant submits payment | Merchant                      | `PAYMENT_PENDING` row inserted; `pendingBalance` incremented; balance unchanged   |
| Admin confirms           | Admin/Super Admin             | Row flipped to `PAYMENT_CONFIRMED`; balance reduced; `pendingBalance` decremented |
| Admin rejects            | Admin/Super Admin             | Row flipped to `REJECTED`; balance unchanged; `pendingBalance` decremented        |
| Manual adjustment        | Super Admin only              | `ADJUSTMENT` row inserted; balance updated immediately                            |

**Key rules:**

- Only one `PAYMENT_PENDING` row with `status = "PENDING"` is allowed at a time per merchant. The submit endpoint (Step 8) enforces this.
- `balanceTransaction.amount` is **positive for charges** (merchant owes more) and **negative for payments/credits** (merchant owes less). The confirm endpoint adds `current.amount` (already negative) to reduce the running balance.
- `merchant_balance.pendingBalance` is a denormalized column tracking the sum of unconfirmed `PAYMENT_PENDING` amounts. Updated atomically alongside balance transaction mutations — this eliminates the correlated subquery that previously ran per merchant row in the merchants list (`GET /api/merchants`).
- The `merchant_balance` table holds the live running total and is locked with `.for("update")` during confirm/adjust to prevent double-processing.
- `BALANCE_TX_TYPES` and `BALANCE_TX_STATUSES` const arrays are re-exported from `src/lib/constants.ts` (aliased from the schema's `balanceTxTypes`/`balanceTxStatuses`) for use in components without importing from the schema directly.

**UI surfaces:**

- `src/app/merchant/finance/page.tsx` — "Outstanding balance" stat card + "How to pay" card + fee history table (uses `useMerchantBalance`)
- `src/app/dashboard/merchants/page.tsx` — "Pending" and "Balance" columns (from LEFT JOIN in GET `/api/merchants`; `balance` is the raw outstanding, `pendingBalance` is the sum of unconfirmed payments)
- `src/app/dashboard/merchants/[id]/balance/page.tsx` — admin view: pending payments to confirm/reject, full transaction history, adjust balance (Super Admin only)

**Hook:** `src/features/merchants/hooks/use-merchant-balance.ts` (`useMerchantBalance(merchantId)`) — owns balance, transactions, pagination/sort state, and all mutation functions (`submitPayment`, `confirmPayment`, `rejectPayment`, `adjustBalance`).

**Seed:** `src/lib/db/seed/merchant-balances.ts` derives opening balances from seeded orders and runs after `seedPayoutLinkedOrders()`.

---

## 3.85. Multi-zone pricing

Delivery fees are determined by a **zone-to-zone N×N pricing matrix**. Each
delivery city belongs to a zone, and each warehouse is in a city (and thus a
zone). The delivery fee depends on both the origin zone (warehouse's city) and
the destination zone (order's delivery city).

### Entity relationships

```
delivery_zone → zone_pricing (N×N) ← delivery_zone
                     ↑
delivery_city → zoneId (FK)
delivery_city → warehouseId (FK)
pickup_location → cityId (FK) → delivery_city → warehouse → city → zone (origin)
order → deliveryCityId (FK) → delivery_city → zone (destination)
```

### Pricing lookup flow

1. **Origin zone**: `pickup_location.cityId → delivery_city.warehouseId → warehouse.city (text) → match to delivery_city.name → zoneId`
2. **Destination zone**: `order.deliveryCityId → delivery_city.zoneId`
3. **Pricing**: `zone_pricing[fromZoneId][toZoneId]` — falls back to merchant's flat-rate pricing if no match

### Key tables

| Table | Purpose |
|-------|---------|
| `delivery_zone` | Zone names (e.g., "Dhaka Metro", "Divisional Cities") |
| `zone_pricing` | N×N matrix — one row per (fromZone, toZone) pair with pricing fields |
| `delivery_city` | Cities with `zoneId` FK and `warehouseId` FK |
| `pickup_location` | Merchant pickup locations with `cityId` FK (warehouse derived from city) |

### Admin management

- **Delivery Zones** page (`/dashboard/delivery-zones`) — CRUD for zones
- **Zone Pricing** page (`/dashboard/zone-pricing`) — manage N×N pricing matrix
- **Zone Delivery Times** page (`/dashboard/zone-delivery-time`) — days from order creation to delivery, per zone pair; an unconfigured lane shows no estimate rather than blocking an order
- **Delivery Cities** page (`/dashboard/delivery-cities`) — assign cities to zones and warehouses

### Fallback

If no zone-to-zone pricing is found, the system falls back to the merchant's
flat-rate pricing (`baseRate`, `extraRatePerKg`, `freeWeightKg`, `maxWeightKg`
on the `merchant` table). This ensures backward compatibility.

---

## 3.75. Announcement bell (`src/features/announcements/components/announcement-bell.tsx`)

A link-with-badge in the TopNav (`src/components/navigation/top-nav.tsx`),
mounted once per role shell — it replaced the old page-top `AnnouncementBanner`
and the `AnnouncementDetailModal`.

```tsx
// Inside TopNav's right-hand action group (mounted once per shell):
<AnnouncementBell />
```

**Announcements are a board, not a notification feed.** The bell is a plain
link to the feed — no dropdown tray, no per-item list, no "mark all read":
those are notification mechanics and they belong to R4.1, which will host its
tray when real notifications exist.

Behaviour:

- Reads from `useActiveAnnouncements()` — no additional API call or hook
  needed; the single SWR key is fetched once per session because the bell
  mounts once.
- Shows a "new" badge (`9+` cap). The count is `isNew` on each row: published
  after `profile.announcementsSeenAt`, the reader's last feed visit. One
  watermark column — **never** per-item read rows, never localStorage; the
  `announcement_read` table and the mark-read endpoints were built and removed
  (tombstone in `schema.postgres/platform.ts`).
- Clicking navigates to the reader's feed
  (`announcementsPathForRole(role)` in `src/lib/nav-config.ts`).
- The **feed** (`useAnnouncementFeed`) stamps the watermark on mount, which
  drains the badge; rows published since the last visit carry a NEW pill for
  that visit only. The bell itself never writes.

Rules:

- The bell lives in **TopNav**, not in individual pages — it appears on every
  screen within a role (and on `/announcements/[id]`) without per-page wiring.
- Do not add a second `useActiveAnnouncements()` call in page components; the
  TopNav already triggers the SWR fetch and caches it for the whole session.
- The sidebar Announcements link, the bell, and both feed pages share the same
  hook and the same watermark — visiting the feed anywhere drains the badge
  everywhere on the next mutate.
- The detail page (`/announcements/[id]`) writes **nothing** on open: viewing
  one announcement must not advance the watermark (it would mark everything
  else as seen too). Only visiting the feed stamps.
- Do not rebuild the tray: if R4.1 lands in-app notifications, the tray
  hosts *those* and the announcement link keeps its current shape.
- Detail rendering is `<Markdown>` (react-markdown + remark-gfm, same as
  `/terms`): announcements are authored as markdown on the create/edit pages
  (`markdown-editor.tsx` — Write pane is CodeMirror 6 with a formatting
  toolbar and Ctrl/Cmd+B·I, Preview renders through the app's `Markdown`, so
  preview == what readers get) and listed with `stripMarkdown()` excerpts
  (`src/lib/markdown.ts`). Never show raw markdown source in a one-line
  preview, and never render announcement HTML directly.

## 3.9. DataTable loading skeleton

The `DataTable` component accepts a `loading` boolean prop. When `true`, it
renders skeleton placeholder rows instead of data rows, matching the current
column layout:

```tsx
const { data, isLoading } = useSWR<PaginatedResponse<Thing>>(...)

<DataTable
  id="things"
  serverPaginated
  loading={isLoading}
  columns={columns}
  data={data}
  ...
/>
```

The skeleton uses `src/components/skeleton.tsx` (a `<div>` with a shimmer
animation via Tailwind). Each cell gets a skeleton `<div>` whose width is
proportional to a random fraction, so the loading state looks like real
content at a glance.

Rules:

- **Every `DataTable` must pass `loading={isLoading}`** from its SWR hook.
  This gives users immediate visual feedback while data fetches, instead of
  a blank table or a full-page spinner.
- The `loading` prop is distinct from `serverPaginated` — both can be true
  simultaneously (server-paginated table on initial load).
- Don't use the skeleton for sub-second transitions (tab switches on cached
  data) — SWR's `isLoading` is `true` only on the initial fetch or when the
  key changes. When a hook wraps `isLoading || isValidating` (as `useOrders`
  does), background revalidations also trigger the skeleton. Use `bulkLoading`
  (see §3.10) to cover the table with an overlay during bulk operations.

---

## 3.10. DataTable bulk selection

The `DataTable` supports row-level checkboxes and a bulk-actions toolbar via
the `selectable` and `bulkActions` props:

```tsx
const [selected, setSelected] = useState<Set<string>>(new Set())
const [bulkBusy, setBulkBusy] = useState(false)

async function handleBulkDelete(ids: string[]) {
  setBulkBusy(true)
  let ok = 0
  for (const id of ids) {
    const res = await deleteSomething(id)
    if (res.ok) ok++
  }
  toast.success(`${ok} of ${ids.length} items deleted.`)
  setBulkBusy(false)
}

<DataTable
  id="my-table"
  selectable
  selectedKeys={selected}
  onSelectionChange={setSelected}
  bulkLoading={bulkBusy}
  bulkActions={[
    {
      label: "Delete",
      variant: "destructive",
      icon: <Trash2 className="size-4" />,
      disabled: bulkBusy,
      onClick: async (rows, clear) => {
        await handleBulkDelete(rows.map((r) => r.id))
        clear()
      },
    },
  ]}
  ...
/>
```

Rules:

- **`selectable`** adds a checkbox column as the first column. A select-all
  checkbox in the header supports indeterminate state when a subset of the
  current page is selected.
- **`selectedKeys`** (`Set<string>`) and **`onSelectionChange`** are a
  controlled pair — the parent owns the selection set. Omit `selectedKeys`
  for uncontrolled mode (selection accumulates locally).
- **Selection keys** are derived from `getRowKey(row, index)`. Selection
  persists across page navigation since keys are stable row identifiers.
- **`bulkActions`** receives the full array of selected row objects and a
  `clearSelection` callback as the second argument. Call `clear()` after
  the action completes to reset selection. Each selectable table should
  have a corresponding **bulk API endpoint** (under the same resource's
  `bulk/` path) that accepts `{ ids }` and processes all items server-side
  in one request. The handler calls the hook's bulk function once and
  revalidates once — no `for...of` loops on the client.
- **`bulkLoading`** (boolean) — when `true`, a semi-transparent overlay
  with a centered spinner appears over the table and the action buttons are
  disabled. Wire it to a `bulkBusy` state that you toggle before/after the
  loop. The overlay hides skeleton-row flicker caused by per-item cache
  revalidation (the skeleton is suppressed while `bulkLoading` is active).
- **`disabled`** on a `DataTableBulkAction` prevents clicks on that button.
  Use it in combination with `bulkLoading` to guard against double-clicks
  during processing (the button is also disabled when `bulkLoading` is true
  regardless of the individual `disabled` value).
- **Do not use `selectable` on read-only tables or tables where the only
  action is a per-row dropdown menu.** It's for pages where users need to
  operate on multiple rows at once (batch approve, batch delete, etc.).
- When selected rows exist, a toolbar appears between the search bar and
  the table showing "N selected" and the provided action buttons.
- **Bulk actions that need user input** (e.g. assign rider) open a dialog
  instead of executing directly. See `src/app/dashboard/orders/page.tsx` for
  the dialog pattern — the action's `onClick` sets dialog open state, and
  the dialog calls the bulk API once on confirm. Selection is cleared via
  `onComplete` / `onOpenChange` callbacks rather than `clear()`.

---

## 3.12. Date range filtering (`src/components/date-range-picker.tsx`)

The `DateRangePicker` provides a date-from / date-to filter with quick preset
buttons (Today, Last 7 days, Last 30 days, This month, Last month). It uses
native `<input type="date">` elements styled to match the app theme.

```tsx
import { DateRangePicker } from "@/components/date-range-picker"
;<DateRangePicker
  from={dateFrom}
  to={dateTo}
  onFromChange={setDateFrom}
  onToChange={setDateTo}
/>
```

Usage pattern:

- The date state lives in the resource hook (`useOrders` exposes
  `dateFrom/setDateFrom/dateTo/setDateTo` which flow to `?from=&to=` on the API).
- Local-only filtering (e.g. merchant finance payable orders) uses local
  `useState` and filters the client-side list with `useMemo`.
- When `from`/`to` are both `undefined`, no filter is applied.

## 3.13. Chart components (`src/components/charts/`)

Three thin recharts wrappers for common chart types:

| Component   | File                                   | Use case                                       |
| ----------- | -------------------------------------- | ---------------------------------------------- |
| `AreaChart` | `src/components/charts/area-chart.tsx` | Trends over time (orders/day, weekly activity) |
| `BarChart`  | `src/components/charts/bar-chart.tsx`  | Categorical comparisons (financial snapshot)   |
| `PieChart`  | `src/components/charts/pie-chart.tsx`  | Status/outcome breakdown (delivery outcomes)   |

All three accept `loading` (renders skeleton placeholders), `height`, and
`className`. They use CSS variable references (`var(--color-chart-[1-5])`) for
colours to stay consistent with the theme.

```tsx
import { AreaChart, BarChart, PieChart } from "@/components/charts"
;<AreaChart
  data={chartData}
  dataKey="value"
  xKey="label"
  height={250}
  loading={isLoading}
  color="var(--color-chart-1)"
/>
```

Data is `Record<string, string | number>[]`. The `dataKey` and `xKey` props
select which fields to plot. For multi-series data (e.g. charges vs payments),
pass both keys in the same object and use `dataKey` to select the primary
series — recharts renders all numeric fields as separate lines automatically.

## 3.14. Progress bar (`src/components/ui/progress.tsx`)

Simple determinate progress bar used on the rider dashboard to show daily
pickup/delivery completion:

```tsx
import { Progress } from "@/components/ui/progress"
;<Progress value={75} className="h-2" />
```

`value` is a percentage (0–100). The bar animates on change via CSS transition.

## 3.11. Switch toggle loading UI

Active-status switches (team members) show a spinner
next to the switch while the API call is in flight:

```tsx
const [togglingId, setTogglingId] = useState<string | null>(null)

async function handleToggleActive(item: Thing) {
  setTogglingId(item.id)
  const res = await updateThing(item.id, { isActive: !item.isActive })
  setTogglingId(null)
  if (!res.ok) return toast.error(res.error)
  toast.success(`${item.name} ${item.isActive ? "disabled" : "enabled"}.`)
}

// In the column cell:
;<div className="flex items-center gap-2">
  <Switch
    checked={item.isActive}
    disabled={togglingId === item.id}
    onCheckedChange={() => handleToggleActive(item)}
  />
  {togglingId === item.id ? (
    <Loader2 className="text-muted-foreground size-3 animate-spin" />
  ) : (
    <Badge variant={item.isActive ? "default" : "secondary"}>
      {item.isActive ? "Active" : "Disabled"}
    </Badge>
  )}
</div>
```

Rules:

- Track which row is toggling with `togglingId` state (or equivalent).
- **Disable the switch** during the API call to prevent double-submits.
- Show a `<Loader2 className="animate-spin" />` spinner next to the switch,
  replacing the text label/badge. The spinner is `size-3` (12px) to stay
  proportional to the switch.
- **Do not wrap switches in `ConfirmDialog`** — switches are designed for
  quick toggles. If the action needs confirmation, use a button that opens
  the dialog instead.

---

## 3.15. Quick Filters (`src/components/quick-filters.tsx`)

The `QuickFilters` component provides multi-select filtering via a dropdown
(or modal for large filter sets). It renders in the toolbar area next to
`<Tabs>` for refining data within the active tab view.

```tsx
import { QuickFilters } from "@/components/quick-filters"

// In the page component:
const [statuses, setStatuses] = useState<string[]>([])
const [roles, setRoles] = useState<string[]>([])

const sections = [
  {
    label: "Status",
    filters: [
      { label: "Active", value: "ACTIVE", active: statuses.includes("ACTIVE"), onToggle: () => toggleFilter(setStatuses, "ACTIVE") },
      { label: "Inactive", value: "INACTIVE", active: statuses.includes("INACTIVE"), onToggle: () => toggleFilter(setStatuses, "INACTIVE") },
    ],
  },
  {
    label: "Role",
    filters: [
      { label: "Pickup", value: "PICKUP", active: roles.includes("PICKUP"), onToggle: () => toggleFilter(setRoles, "PICKUP") },
      { label: "Delivery", value: "DELIVERY", active: roles.includes("DELIVERY"), onToggle: () => toggleFilter(setRoles, "DELIVERY") },
    ],
  },
]

function toggleFilter(setter: Dispatch<SetStateAction<string[]>>, value: string) {
  setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value])
}

const activeCount = statuses.length + roles.length

<div className="flex items-center justify-between">
  <Tabs>...</Tabs>
  <QuickFilters
    sections={sections}
    activeCount={activeCount}
    onClearAll={() => { setStatuses([]); setRoles([]) }}
  />
</div>
```

Props:
- `sections` — array of `{ label, filters: [{ label, value, active, onToggle }] }`
- `activeCount` — number of currently active filters (shows badge on trigger)
- `onClearAll` — resets all filter state
- `modalThreshold` — (optional, default 15) total items above which a modal is used instead of dropdown

Rules:

- **Tabs remain for major mode switches** that change the column set or data
  source (e.g., Incoming/Received, All/In Progress/Delivered). Quick Filters
  are for multi-select refinement within the active tab view.
- **Placement:** use `toolbarLeft` on `<DataTable>` so tabs and Quick Filters
  render in the same toolbar row as the search bar (left = filters, right = search):
  ```tsx
  <DataTable
    searchable
    toolbarLeft={
      <div className="flex items-center gap-3">
        <Tabs>...</Tabs>
        <QuickFilters ... />
      </div>
    }
  />
  ```
- **Each page owns its filter state.** Quick Filters is purely presentational —
  it renders the sections you pass and calls `onToggle`/`onClearAll`. The page
  manages the filter arrays and passes filtered data to `<DataTable>`.
- **Modal fallback:** if total filter items exceed `modalThreshold`, a
  `<Dialog>` with checkbox-style buttons is rendered instead of a dropdown.
- **Active indicator:** each active filter shows a check icon and highlighted
  background via the `bg-accent` class.

---

## 3.16. DataTable cell content conventions

All `DataTable` cell renderers must follow these rules for visual consistency:

### Font size

All cells inherit `text-sm` from the `TableCell` in `DataTable`. Do **not** add
`text-sm` or `text-xs` to individual cell spans — the base size is handled
centrally.

### Two-row pattern (primary + secondary)

When a column shows two lines (e.g., name + phone), use `CellTwoRow`:

```tsx
import { CellTwoRow } from "@/components/data-table"

cell: (row) => (
  <CellTwoRow
    primary={<span className="font-medium">{row.name}</span>}
    secondary={row.phone}
  />
)
```

- **Primary line:** default color, optionally `font-medium`.
- **Secondary line:** automatically `text-muted-foreground` (transparent).
- Both lines truncate with `…` on overflow.

### Single-value text

For single-value cells that may overflow, use `CellContent`:

```tsx
import { CellContent } from "@/components/data-table"

cell: (row) => <CellContent>{row.city}</CellContent>
```

- Renders a `<span>` with `block truncate` and a native `title` tooltip on
  hover showing the full text.
- Pass `className` for additional styles (e.g., `tabular-nums`, `text-muted-foreground`).

### Tooltip on hover

Both `CellContent` and `CellTwoRow` set a native `title` attribute for
overflow text. The full value appears as a browser tooltip on hover. No
additional tooltip component is needed.

### What NOT to do

- Don't wrap every cell in `<div className="flex flex-col">` manually — use
  `CellTwoRow`.
- Don't add `text-xs` to secondary lines — `CellTwoRow` handles this via
  `text-muted-foreground`.
- Don't add `title={...}` manually for truncation — `CellContent` handles this.
- Don't use `line-clamp` or `whitespace-normal` on table cells — always use
  single-line truncation (`truncate`).

---

## 4. Storage (`src/lib/storage/`)

File uploads go through a single entry point — **never import the local or R2
drivers directly**:

```ts
import { saveFile } from "@/lib/storage"

const { publicUrl } = await saveFile(relativePath, buffer, mimeType)
```

The active backend is selected by the `STORAGE_PROVIDER` env var (`"local"` or
`"r2"`). `"local"` writes to disk and serves files via `/api/uploads`; `"r2"`
uploads to Cloudflare R2. Defaults to `"local"` when the var is unset.

On the client side, use `uploadImage()` from `src/lib/upload-image.ts`. It compresses
the file before sending and targets the correct folder (avatar vs. photo). The
`<ImageUpload>` component in `src/components/image-upload.tsx` wraps this for form use.

Never write backend-specific upload logic outside `src/lib/storage/`.

### Upload rate limiting

`src/proxy.ts` runs as the edge proxy and rate-limits `POST /api/uploads` to 20
requests per minute per IP using an in-process sliding-window counter. In the
multi-instance Docker deployment, each container enforces the limit
independently — for multi-host deployments, swap the in-memory `Map` for a
Redis/Upstash store so the cap is enforced globally across all containers.
The matcher is configured in `src/proxy.ts`'s `config` export — it covers every
page route PLUS `/api/uploads`. The wide page matcher is intentional: the proxy
generates a per-request CSP nonce (see `src/app/layout.tsx`) that every HTML page
must receive. Only add/remove matcher entries with a reason — API routes and
`_next/*` assets intentionally stay excluded.

---

## 5. Environment validation (`src/lib/env.ts`)

All required env vars are declared and validated in `src/lib/env.ts`. The
`src/instrumentation.ts` hook calls `validateEnv()` at server startup so the app
**refuses to boot** with a clear error rather than failing mid-request.

When you add a new env var:

1. Add a `required()` / `oneOf()` / `minLength()` call in `src/lib/env.ts`.
2. Document it in `docs/ENV.md`.

Never read `process.env` for a required variable without a corresponding entry
in `validateEnv()`.

Key env vars:

- `NEXT_PUBLIC_SITE_URL` — the app's canonical public URL for auth callbacks,
  SEO metadata, OG tags, and sitemaps. Falls back to `site.json` if unset.
- `BETTER_AUTH_ALLOWED_URLS` — optional comma-separated list of additional
  origins that Better Auth should accept for callbacks and CSRF. Use this
  in multi-instance deployments where each role portal has its own subdomain.

---

## 6. Email (`src/lib/mailer.ts`)

Transactional email goes through `sendMail()` from `src/lib/mailer.ts`. It uses
nodemailer without retries — every email is attempted exactly once. SMTP config
is read from the `mail_config` DB table (managed via Super Admin settings;
changing a config takes effect immediately — the SMTP transporter is cached per
credential set). Every send attempt is recorded to the `email_log` table (SENT
or FAILED) — this is the Admin/Super Admin "Email logs" history at
`/dashboard/email-logs`. Failed mails are kept in the DB (the cleanup cron only
deletes successful rows) so they can be reviewed or manually re-sent. Only the
plain-text version of the body is stored — HTML is not persisted. HTML
templates live in `src/lib/mail-templates.ts`.

```ts
import { sendMail } from "@/lib/mailer"

await sendMail({
  to: "user@example.com",
  subject: "Your order",
  html: template,
})
```

For emails that must survive a crashed/frozen request, persist a row through
`enqueueEmail(payload, tx)` from `src/lib/email-outbox.ts` inside the same
transaction as the domain change, then `flushEmailOutbox()` after commit. The
drain worker (`POST /api/cron/drain-email-outbox`) delivers rows left behind by
a crash. A failed outbox row is marked `FAILED` and kept — it is never retried.

Never call nodemailer (or any SMTP client) directly outside `src/lib/mailer.ts`,
and never insert into `email_log` from anywhere else — `sendMail()` is the only
writer. The one allowed exception is
`src/app/api/email-logs/[id]/route.ts`, which lets an Admin/Super Admin manually
flip a `FAILED` row to `SENT` after confirming delivery or resending by hand —
that mutation calls `logAudit()` (see [§3.5](#35-audit-log-libauditts)) so the
override itself is traceable.

The Add Mail Config dialog ("Send test email" button) hits
`POST /api/admin/mail-config/test` (Super Admin only). It calls
`sendTestMail()` from `src/lib/mailer.ts`, which builds a throwaway transporter
from the *unsaved* form values — never reading the DB — so the admin can verify
host/user/password before committing. The dialog's **Send test to** field names
the recipient (prefilled with the signed-in admin's address); it belongs to the
test send, never to the stored config. Unlike `sendMail()`, `sendTestMail()`
does **not** write an `email_log` row (it is a pre-save diagnostic, and the
unsaved credentials must not appear in the delivery history). SMTP *responses*
surface verbatim (e.g. nodemailer's `535 … Username and Password not accepted`)
as a 400 so the admin can correct the form; connection failures stay generic —
their message would leak internal host:port (pinned by `mail-config.spec.ts`).

---

## 7. Site identity (`src/config/site.json` + `src/config/site.ts` + `src/icons/SiteIcon.tsx`)

Brand name, tagline, and description live in `src/config/site.json`. The brand icon
lives in `src/icons/SiteIcon.tsx` (SVG path constants + React component). Import the
typed `siteConfig` or the `SiteIcon` alias from `@/config/site` — do not read
the JSON directly in components.

**Favicon & Apple touch icon** are auto-generated at request time from the same
SVG constants via `src/app/icon.tsx` (32×32 PNG) and `src/app/apple-icon.tsx` (180×180
PNG). To change the brand icon edit `src/icons/SiteIcon.tsx` — the UI, favicon, and
apple icon update automatically.

---

## 7.5. PWA — installable app shell

The app is a Progressive Web App. Installability needs three pieces that all
read from the existing site identity (`src/config/site.ts` + `src/icons/SiteIcon.tsx`):

1. **Manifest** — `src/app/manifest.ts` generates `/manifest.webmanifest`
   (name, description, standalone display, theme/background colors, icons).
   Next.js auto-injects the `<link rel="manifest">` tag once the file exists.
2. **Icons** — `src/app/pwa-icon/[size]/route.tsx` renders the brand glyph as a
   PNG at `/pwa-icon/192` and `/pwa-icon/512` via `ImageResponse`. The glyph is
   centered at 56% of the canvas inside the 80% maskable safe zone on a white
   background, so the same image works for both `any` and `maskable` purposes.
3. **Service worker** — `public/sw.js` (static, no build step). Registered only
   in production by `src/components/service-worker-register.tsx`, which is
   mounted once in `src/app/layout.tsx`.

Service worker behaviour:

- Precache `/` and `/manifest.webmanifest` on install; network-first for
  navigations with the cached shell as offline fallback.
- Stale-while-revalidate for same-origin static assets (`/_next/static`,
  `/icon`, `/apple-icon`) — content-hashed URLs are immutable.
- **API routes (`/api/*`) and uploads (`/uploads/*`) are never intercepted** —
  responses are session- and role-scoped, so caching them would leak data
  across users. Do not add them to the fetch handler.
- Bump `VERSION` in `public/sw.js` to invalidate old caches on deploy; the
  `activate` handler prunes superseded `chalan-*` caches automatically.

Rules:

- To change the installable icon, edit `src/icons/SiteIcon.tsx` only — the
  manifest, favicon, apple icon, and PWA icons all derive from it.
- Add any new cache-worthy static path to `public/sw.js` deliberately; when in
  doubt, let it go to the network.
- The manifest is cached by default by Next.js (it uses no request-time APIs),
  so a deploy with a changed app name/description needs the CDN/browser cache
  cleared to pick it up.

---

## 8. Recipes — step-by-step playbook

### Recipe A — Add a field to an existing entity

Example: the `rider.taskType` column added recently.

1. **Schema** — add the column to the right domain module in `src/lib/db/schema.postgres/`
   (e.g. `auth.ts` for user/profile columns, `orders.ts` for order columns — the barrel
   `index.ts` re-exports everything, so import paths never change).
   Use a `text(... { enum })` for enums and export the values array if the UI needs it:
   ```ts
   export const riderTaskTypes = ["PICKUP", "DELIVERY", "BOTH"] as const
   // ...
   taskType: text("taskType", { enum: riderTaskTypes })
     .notNull()
     .default("DELIVERY")
   ```
2. **Type** — if a named union helps, add it to `src/lib/types.ts`:
   ```ts
   export type RiderTaskType = (typeof rider.$inferSelect)["taskType"]
   ```
3. **Validation** — add the field to the relevant zod schema in
   `src/lib/validation.ts` (create schema, and an update schema if editable).
4. **API** — read/write the new field in the matching route(s).
5. **Hook** — add it to the create/update input types in `use-<resource>.ts`.
6. **UI** — surface it in the dialog(s) and any table columns / detail views.
7. **Seed** — add the field to the relevant seed file under `src/lib/db/seed/`
   (e.g. `src/lib/db/seed/riders.ts`).
8. **Apply the DB change** — see [Applying schema changes](#applying-schema-changes).

> If the column is `NOT NULL` and existing rows would violate it, either give it
> a `.default(...)` or backfill before pushing (the push will otherwise fail).

**Variant — a field on `profile` the user edits about themselves** (not a
resource entity): example, `profile.tableRowsPerPage`. The shape differs from
the above in three ways:

- There's no per-resource hook to extend — the field is read/written through
  `src/features/account/hooks/use-auth.tsx` and `src/app/api/users/me/route.ts`
  instead, alongside the existing name/avatar fields.
- `src/app/api/users/me/route.ts`'s `PATCH` writes to **two tables**
  (`user` for name/image, `profile` for everything else). Once a second field
  lives on `profile`, that handler is a genuine multi-table write — wrap it in
  `db.transaction()` per [§2's transaction subsection](#transaction-boundary--row-lock),
  even though today's UI only ever sends one field group per request.
- Skip the seed step if the column has a sane `.default(...)` — Drizzle
  applies it on insert when the seed script doesn't set the field explicitly,
  so there's nothing to backfill in `src/lib/db/seed/`.

### Recipe B — Add a brand-new resource (full CRUD)

Example structure to mirror: **merchants** (rich).

1. **Schema** — add the `pgTable` to the right domain module in `src/lib/db/schema.postgres/`
   (pick the module matching the domain; watch FK dependency order — a new parent table goes
   in an earlier module than its dependents), with `createId()` PK and
   relations via `.references()`.
2. **Type** — re-export from `src/lib/types.ts`:
   `export type Thing = typeof thing.$inferSelect`.
3. **Validation** — add `thingCreateSchema` / `thingUpdateSchema` in
   `src/lib/validation.ts`.
4. **API routes**:
   - `src/app/api/things/route.ts` → `GET` (list) + `POST` (create). Start every
     handler with `requireSession()`; gate writes by `me.role`.
   - `src/app/api/things/[id]/route.ts` → `PATCH` / `DELETE` as needed.
   - Scope reads/writes by `me.warehouseId` (or owner id) when the resource is
     role-scoped — **enforce it server-side; Neon has no RLS.**
   - If this is a resource Admin/Super Admin manage (not pure
     merchant/rider self-service), call `logAudit()` after each write
     succeeds — see [§3.5](#35-audit-log-libauditts).
5. **Hook** — `src/features/things/hooks/use-things.ts`. Copy the shape of
   `use-pickup-locations.ts`: SWR keyed on the API path (gated on `currentUser`),
   `data ?? []`, and `useCallback` mutations that do an optimistic
   `mutate(..., { revalidate: false })`. If the resource needs search/pagination,
   copy `use-orders.ts` instead and follow [§3's server-side search subsection](#server-side-search-and-pagination).
6. **UI** — a page (Recipe C) and dialogs (Recipe D).
7. **Seed** — add sample rows to the relevant file under `src/lib/db/seed/`. For time-sensitive resources (anything with `publishedAt`, `expiresAt`, or similar timestamp columns), express dates relative to `now` using a `daysFromNow(n)` helper rather than hard-coded ISO strings — this keeps the seed realistic on every re-run without manual maintenance. See `src/lib/db/seed/announcements.ts` for the canonical example.

### Recipe C — Add a page / screen

1. Create `src/app/<role>/<name>/page.tsx`. `<role>` is `dashboard`, `merchant`,
   `warehouse`, or `rider`. Mirror a sibling page in the same role folder.
2. Use `PageHeader` for the title/description and pull copy from
   `src/config/content.ts` (add a key there rather than hard-coding strings):
   ```tsx
   <PageHeader
     title={pageContent.warehouse.riders.title(firstName)}
     description={pageContent.warehouse.riders.description(warehouseName)}
   />
   ```
   Same for **StatCard labels** — pull from `src/config/stat-card-labels.ts`
   and add a key there for any new card, never inline a string. Likewise for
   **table column headers** — use `columnLabels` from
   `src/config/table-column-labels.ts` for every `DataTable` header.
3. Get data from the resource hook(s) — never fetch in the page directly.
4. Use shared building blocks: `DataTable`, `StatCardList`, `StatusBadge`,
   `FormDialog`. Every `<DataTable>` uses server-side pagination:

   ```tsx
   <DataTable
     id="warehouse-orders"
     serverPaginated
     pinnedColumns={["order"]}
     columns={columns}
     data={orders}
     total={total}
     page={page}
     pageSize={limit}
     onPageChange={setPage}
     onPageSizeChange={setLimit}
     searchQuery={query}
     onSearchChange={setQuery}
     getRowKey={(o) => o.id}
   />
   ```

   - **`id`** — a unique string that enables column visibility settings
     (persisted to localStorage) and shows a settings gear in the toolbar.
   - **`serverPaginated`** — enables server-side pagination. The hook manages
     `page`, `limit`, `query`, and `statuses` state; the DataTable handles
     page navigation, search input, and CSV export. The CSV export is derived
     from the rendered columns (string header + `sortValue`) unless the page
     passes an explicit `csv` prop, and the footer hides the button when
     nothing is exportable.
   - **`pinnedColumns`** — array of column IDs to pin to the left side.
     Pinned columns stay fixed during horizontal scroll, are always visible,
     and cannot be hidden via the settings dialog. Always pin the first
     (primary identifier) column: `"order"`, `"name"`, `"tracking"`, etc.

   `DataTable`'s toolbar places the search input on the top-right and the
   settings gear + CSV download (when the table has anything exportable) in
   the footer. Don't rebuild that layout per
   page. Don't pass a `pageSize` prop unless this table genuinely needs a
   different size than the rest of the app — it already defaults to the
   signed-in account's saved preference (Account settings → Tables, 1-250,
   default 20). An explicit `pageSize` is for deliberately small, fixed
   widgets (see the dashboard summary lists in `src/app/rider/page.tsx`,
   `pageSize={5}`), not a substitute for the account setting.
   - **`selectable`** + **`bulkActions`** — enable row-level checkboxes and
     a bulk-actions toolbar. See §3.10 for full documentation.

5. **Add the nav entry** in `src/lib/nav-config.ts` under the correct role array
   (`href`, `label`, `icon`, `exact`). Pick an icon already imported there or
   add the import.

### Recipe D — Add a dialog (create / edit / confirm)

1. Put it in `src/features/<name>/dialogs/`. Flat file
   (`create-thing-dialog.tsx`) unless it needs a local Props interface or
   constants — then a folder with `index.tsx` + `types.ts`.
2. Build on `src/components/form-dialog.tsx`, not the raw dialog primitive.
3. Drive all mutations through the resource hook; show errors via `toast` and
   the hook's `{ ok, error }` result.
4. **Shared options/labels** used by sibling dialogs go in a flat module beside
   them (e.g. `src/features/riders/dialogs/task-type.ts`), never duplicated.
5. For role-conditional controls, take a prop (e.g.
   `canReassignWarehouse?: boolean`) rather than reading the role inside the
   dialog.

### Form validation error display

Forms use a two-layer error strategy - pick the right one per field:

| Layer | When to use | Pattern |
|---|---|---|
| **Inline field error** | Where the message has to sit next to the control: selects (no native `required`), anything on a long or multi-section form where the summary is a screenful away, and anything the control itself does not already show. | `Input`'s `error` prop - it renders the message and wires `aria-invalid` + `aria-describedby` for you. For controls with no such prop (the `Select` trigger), `<p className="text-destructive text-xs">` below it. |
| **Toast** | Submit-time validation for text inputs where the `required` attribute + browser UX is sufficient, or server errors from the API. | `toast.error("message")` - already the norm. |
| **Form-level banner** | Multiple fields fail at once and you want one summary. It is also the focus target on a failed submit. | `<FormErrors errors={...} />` from `src/components/form-errors.tsx`. |

**Rules of thumb:**

- **Freeze errors on submit; never derive them per keystroke.** `FormErrors`
  takes focus whenever its error count changes, so live validation would pull
  focus out of the field the user is halfway through correcting. Compute the
  messages in the submit handler, keep them in state, and recompute on the next
  submit. `src/app/merchant/orders/new/types.ts` (`ParcelValidation`) records
  this, and that page is the reference implementation.
- On a long form, show the failure twice: once in the summary (so it is
  announced) and once under the control (so it can be acted on). Prefix each
  summary entry with its group - "Parcel 2: " - only when there is more than one.
- Always set `aria-invalid` on the failing control and link the error via
  `aria-describedby` when possible - `Input`'s `error` prop does both.
- Keep error text short - one sentence, no icons.
- Say why a *disabled* button is disabled. A disabled submit with no
  explanation is a dead end; render the reason beside it.

### API error contract (backend → hook → UI)

Every mutation follows a three-step error pipeline. New hooks must preserve
this contract so the UI can display field-specific messages.

**1. API route — return a consistent shape**

Validation errors from `parseBody` return a 400 with two keys:

```json
{
  "error": "Invalid request body",
  "issues": [
    { "path": ["recipientPhone"], "message": "Invalid Bangladeshi phone number. Format: 01XXXXXXXXX" },
    { "path": ["orders", 0, "parcelWeightKg"], "message": "Parcel weight must be greater than 0" }
  ]
}
```

- `error` — a generic human-readable string (shown as fallback).
- `issues` — an array of `{ path: (string | number)[], message: string }`.
  `path` is a Zod path array: string segments for object keys, numbers for
  array indices (e.g. `["orders", 0, "parcelWeightKg"]`).

Business-logic errors (inactive merchant, rider not found, etc.) use the
standard helpers (`badRequest()`, `forbidden()`, etc.) and return only
`{ error: "..." }` — no `issues` key.

**2. Hook — extract and format**

The hook reads `resData` and passes it through a formatter:

```ts
const resData = await res.json()
if (!res.ok) {
  const msg = formatOrderError(resData)   // or your own formatter
  return { ok: false, error: msg }
}
```

The formatter's job:

1. If `issues` exists and is non-empty, flatten it into a single readable
   string — join string path segments, humanise camelCase, append the message.
2. Fall back to `resData.error` if there are no issues.
3. Return a final fallback string if both are missing.

Example formatter (matches `src/features/orders/hooks/use-orders.ts`):

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

**3. UI — display**

The page calls the hook and shows the error via toast:

```ts
const result = await createOrders(payload)
if (!result.ok) {
  toast.error(result.error)
  return
}
```

For per-field inline errors, the hook can return the `issues` map directly
instead of a formatted string, and the page can render
`<FormErrors errors={...} />` or map over fields individually.

**Summary of valid error shapes:**

| Source | Shape | `issues` key? |
|---|---|---|
| `parseBody` validation | `{ error: "Invalid request body", issues: [{ path: ["field"], message: "msg" }] }` | Yes |
| `badRequest("msg")` | `{ error: "msg" }` | No |
| `forbidden("msg")` | `{ error: "msg" }` | No |
| `notFound("msg")` | `{ error: "msg" }` | No |
| Rate limit | `{ error: "Too many requests" }` | No |

### Recipe E — Add a server endpoint (non-order)

Every handler follows the same template:

```ts
import { requireSession } from "@/lib/api-auth"
import { unauthorized, forbidden, notFound } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { thing } from "@/lib/db/schema"
import { thingCreateSchema, parseBody } from "@/lib/validation"
import {
  paginateResponse,
  parseDateRange,
  parsePagination,
  parseStatusFilter,
} from "@/lib/pagination"
import { and, gte, ilike, lte, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { limit, offset } = parsePagination(req)
  const statuses = parseStatusFilter(req)
  const dateRange = parseDateRange(req)
  if (dateRange) {
    const dateClause = and(
      gte(thing.createdAt, dateRange.from.toISOString()),
      lte(thing.createdAt, dateRange.to.toISOString()),
    )
    where = where ? and(where, dateClause) : dateClause
  }

  // Scope role-limited readers server-side.
  let where = undefined
  if (me.role === "WAREHOUSE_ADMIN") {
    if (!me.warehouseId) return NextResponse.json(paginateResponse([], 0))
    // ...build the role-scoped where
  }

  // Optional free-text search, layered on top of the role-scoped where.
  const search = new URL(req.url).searchParams.get("q")?.trim()
  if (search) {
    const likeQ = `%${search}%`
    const searchClause = or(ilike(thing.name, likeQ) /* ...other fields */)
    where = where ? and(where, searchClause) : searchClause
  }

  const [{ count }] = await dbRead
    .select({ count: sql<number>`count(*)` })
    .from(thing)
    .where(where)
  const rows = await dbRead
    .select()
    .from(thing)
    .where(where)
    .limit(limit)
    .offset(offset)
  return NextResponse.json(paginateResponse(rows, count, limit, offset))
}

export async function POST(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()
  const parsed = await parseBody(req, thingCreateSchema)
  if (parsed.error) return parsed.error
  // ...insert + return NextResponse.json(created, { status: 201 })
}
```

Rules: `requireSession()` first; use `unauthorized()`/`forbidden()` for
auth errors; validate the body with `parseBody` + a zod schema; return the
created/updated row so the hook can update its cache. **`parseBody`
normalises a missing or unparseable request body to `{}`** before running the
schema — so schemas where every field is optional (e.g. `orderCancelSchema`)
parse successfully even when the client sends no body at all. This is a Zod 4
requirement: `z.object({...}).safeParse(undefined)` fails even if all fields
are optional, so the normalisation happens in `parseBody` rather than in each
schema. **If the
handler reads a row, checks its status, and conditionally writes to it**
(an approve/reject/mark-paid style endpoint), wrap the read + guard + write in
`db.transaction()` with `.for("update")` on the initial read — see
[§2's transaction subsection](#transaction-boundary--row-lock) for why and the
exact shape. Plain inserts or multi-table writes that don't re-check a status
still want `db.transaction()`, just without the lock.

### Recipe F — Add an order lifecycle action

**Do not** write a custom route handler. Orders use the declarative state
machine in `src/features/orders/transitions.ts`.

1. Add one entry to the `transitions` object: `authorize`, optional `schema`,
   ordered `guard`, and `buildUpdate`.
2. Add a route wrapper at `src/app/api/orders/[id]/<action>/route.ts`.
   Next.js 15 makes `params` a `Promise`, so you must await it before
   passing the id:

   ```ts
   import { applyOrderTransition } from "@/features/orders/transitions"

   export async function PATCH(
     req: Request,
     { params }: { params: Promise<{ id: string }> },
   ) {
     const { id } = await params
     return applyOrderTransition("<action>", id, req)
   }
   ```

3. Add a spec case in
   `src/app/api/orders/[id]/transitions.spec.ts`.
4. Expose it through `use-orders.ts` and the relevant UI.

Never duplicate the auth/parse/guard/update plumbing inline — the shared
runner already handles the transaction boundary and row lock (see
[§2](#transaction-boundary--row-lock)), so a new transition only needs to
define its `guard`/`buildUpdate`, never its own `db.transaction()` call. It's
also already audited: `applyOrderTransition` calls `logAudit()` once, after
the transaction commits, for every transition — add the new name's
human-readable label to `TRANSITION_LABELS` in `transitions.ts` and you're
done; don't add a second `logAudit()` call in the route wrapper.

---

## Applying schema changes

The DB connection string lives in `.env.development.local` (not `.env`). The
project uses `dotenv-cli` to load it when running DB scripts — the `db:migrate`,
`db:generate`, `setup`, etc. npm scripts load the env automatically:

```bash
pnpm db:migrate
pnpm db:admin
```

If you need to run a raw command that requires the env, use `dotenv-cli`:

```bash
pnpm dotenv -e .env.development.local -- drizzle-kit generate
```

**When you add or change a column, update the matching module in `src/lib/db/schema.postgres/`**
— the folder (with its `index.ts` barrel) is the single source of truth; import paths stay
`@/lib/db/schema`.

```bash
# Generate a migration file from the schema diff
pnpm db:generate

# Apply pending migrations (versioned, idempotent, advisory-locked)
pnpm db:migrate

# Open Drizzle Studio (visual DB browser)
pnpm db:studio
```

- `pnpm db:generate` writes the new `drizzle/postgres/000N_*.sql`; commit it
  together with the schema change, then `pnpm db:migrate` applies it. `db:push`
  diffs the live schema and is **local-dev only** — never run it against a
  deployed database.
- A `NOT NULL` add fails if existing rows violate it — backfill in the migration
  (or give the column a default).
- The seed is **idempotent** — it skips rows that already exist. After changing
  seed values for existing ids, either reset the data or run a targeted `UPDATE`.
- `pnpm db:admin` creates a superadmin account — run after `pnpm db:migrate`.
- **After every schema edit**, run `pnpm ci:check` and `pnpm ci:test` (typecheck,
  lint, format, unit tests, build, E2E tests) to catch any errors from the schema change.

### Database invariants

What the database enforces, and what it deliberately does not.

**Enforced in the schema, proved in `src/lib/db/integration.spec.ts`:**

- **Uniqueness** — unique indexes/partial indexes (one active bundle per
  merchant, one `zone_pricing` row per zone pair, deduped tokens).
- **Referential actions** — `ON DELETE RESTRICT` on anything whose loss is a
  data-loss trap (ledger rows, rate cards); `CASCADE` only for derived or auth
  state that is *supposed* to die with its parent (`merchant_balance`,
  `profile`, `session`).
- **Conditional CHECKs** — pairings that name one specific value, e.g.
  `status <> 'DELIVERED' OR deliveredAt IS NOT NULL`, and `money >= 0`.

**Deliberately not enforced:**

- **A `status IN (…)` whitelist.** Status is free text by design — a new status
  needs no DDL beyond its own columns, so it costs zero DDL. The database trusts
  the writer: the app is the only process allowed to write `order`. Adding a
  whitelist would cost a migration per status to restate a rule the transition
  guards already enforce. This is why the CHECKs are *conditional* and never
  generic: adding a status cannot invalidate any of them, so their cost per
  status stays at zero.
- **Business rules.** Guards read the session, call `resolveRoutePricing` and
  post to the ledger — they live in `src/features/orders/transitions.ts`.
  Nothing in `order` may depend on who is making the request.
- **Signed columns are exempt from `>= 0`.** `balance_transaction.amount` is
  signed by design; ~15% of live rows are negative reversals.

**Before adding a CHECK, measure.** `ALTER TABLE … ADD CONSTRAINT` validates
every existing row, so run `pnpm db:audit-invariants` against the target
database first. A rule that measures violations gets a data decision — fix the
rows or drop the rule — *before* any DDL. Never rewrite history to satisfy a
constraint.

**Measuring existing rows is not the same as proving every writer is
consistent.** Unit tests mock `@/lib/db`, so they cannot trip a constraint; only
real SQL does. Application writes go through `transitions.ts`, but E2E fixtures
write raw SQL — after adding a CHECK, grep the `e2e/` specs for hand-written
`UPDATE`s that set the constrained columns, and make them reproduce what the
transition writes. (This is how `order_out_for_delivery_needs_out_for_delivery_at`
first fired: a fixture set the status without its timestamp.)

**Proofs are opt-in locally.** `integration.spec.ts` is skipped unless
`INTEGRATION_DATABASE_URL` points at a migrated database
(`pnpm db:migrate && pnpm test:integration`); `pnpm test:unit:run` does not run
it. CI's `integration` job does — it starts a postgres service, migrates, then
runs the suite — so these constraints are exercised on every push.

---

## Service worker cache issues

After code changes you may see errors like:

```
Module [project]/node_modules/.pnpm/lucide-react@…/node_modules/lucide-react/dist/esm/icons/coins.mjs
was instantiated because it was required from module [project]/src/lib/nav-config.ts, but the module
factory is not available.
```

This happens because the PWA service worker (`public/sw.js`) caches Next.js
static assets (`/_next/static/*`) using a stale-while-revalidate strategy.
After a code change the dev server produces new chunk hashes, but the service
worker still serves the old cached chunk which references module IDs that no
longer exist.

**Quick fix:**

1. Hard-reload the page (**Ctrl + Shift + R** / **Cmd + Shift + R**).
2. Or clear the site cache: DevTools > **Application** > **Storage** > **Clear
   site data** (or unregister the service worker under **Service Workers**).

**Permanent fix (after deploying):**

Bump the `VERSION` constant in `public/sw.js` on every deploy that changes
static assets. Run `pnpm bump-sw` to increment it automatically. The
`activate` handler prunes any cache whose name does not match the current
version, so old chunks are discarded automatically.

> **Note:** The service worker only registers in production
> (`NODE_ENV === "production"`). If you see this error in development, a
> previously installed service worker is still active — clear it using the
> steps above.

---

## PostgreSQL extensions

The project uses several PostgreSQL extensions to improve query performance and
enable native scheduling. They are created by `scripts/init-extensions.sql` on first
database init (Docker) or must be enabled manually on managed services (Neon,
Supabase, RDS).

| Extension            | Purpose                                                                         | Bundled in PG 17?                           |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------- |
| `pg_trgm`            | Trigram GIN indexes for fuzzy `ILIKE '%...%'` search across 25+ columns         | Yes                                         |
| `unaccent`           | Strip accents from search terms (used with `pg_trgm`)                           | Yes                                         |
| `pgcrypto`           | `gen_random_uuid()` and cryptographic helpers                                   | Yes                                         |
| `btree_gin`          | Additional GIN operator classes for composite index queries                     | Yes                                         |
| `pg_stat_statements` | Tracks execution statistics of all SQL queries (find slow queries)              | No (built via `docker/Dockerfile.postgres`) |
| `pg_cron`            | Native cron scheduler inside PostgreSQL — replaces HTTP-based cleanup endpoints | No (built via `docker/Dockerfile.postgres`) |

### Enabling extensions

**Docker (`compose.postgres.yml`)** — extensions are created automatically by
`scripts/init-extensions.sql` on first init. pg_cron jobs are scheduled by
`scripts/setup-pg-cron.sql`. The `docker/Dockerfile.postgres` builds pg_cron from source
on top of `postgres:17` (pg_stat_statements is already included).

```bash
# Start the database (extensions + cron jobs created automatically)
docker compose -f compose.postgres.yml up -d --build
```

**Neon** — enable extensions via the SQL Editor (Dashboard → SQL Editor):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gin;
-- pg_stat_statements and pg_cron require Neon Pro (paid add-on)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

**pg_cron setup** (after schema migration):

```bash
# Run as superuser (postgres role)
psql $DATABASE_URL -f scripts/setup-pg-cron.sql
```

The script schedules three cleanup jobs (sessions, audit logs, email logs) that
replace the HTTP-based cron endpoints. The HTTP endpoints are preserved as a
fallback for Vercel deployments and manual one-off runs.

### Querying pg_stat_statements

Find slow queries:

```sql
SELECT
  query,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(total_exec_time::numeric, 2) AS total_ms,
  rows
FROM extensions.pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### pg_cron job management

```sql
-- List scheduled jobs
SELECT jobid, jobname, schedule, command FROM cron.job;

-- Check run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Remove a job
SELECT cron.unschedule('cleanup-sessions');
```

---

## Docker deployment

The `docker/Dockerfile` produces a multi-stage, minimal image based on Node 24 Alpine.
Two compose files support different deployment modes from the same image:

| Mode            | Compose file                  | Database                                          |
| --------------- | ----------------------------- | ------------------------------------------------- |
| Local dev       | `compose.postgres.yml`        | `postgres-pg-cron:17` (custom image with pg_cron) |
| Single-instance | `docker/compose.monolith.yml` | Bitnami repmgr 2-node cluster                     |
| Multi-instance  | `docker/compose.cluster.yml`  | Bitnami repmgr 2-node cluster + cloudflared       |

**Local development** — single PostgreSQL instance with pg_cron for native
cleanup scheduling. Build the custom image first:

```bash
docker compose -f compose.postgres.yml up -d --build
```

**Single-instance** — one `app` container + PostgreSQL replica cluster. Start
with:

```bash
docker compose -f docker/compose.monolith.yml up -d --build
```

**Multi-instance** (role-isolated) — one container per role portal, each
restricted by `ALLOWED_ROLE` enforced in `src/proxy.ts`. Also includes the
database cluster, `cloudflared`, and `cron`. Start with:

```bash
docker compose -f docker/compose.cluster.yml up -d --build
```

Uploaded files are persisted in a named Docker volume (`uploads_data`)
mounted at `/src/app/uploads` — shared across all role containers so every
instance sees the same files. Without this volume, every redeploy would wipe
avatars, delivery proofs, and pickup-location photos.

Environment variables are loaded from `.env`. For the multi-instance setup,
list all role subdomains in `BETTER_AUTH_ALLOWED_URLS`:

```env
BETTER_AUTH_ALLOWED_URLS=https://admin.yourdomain.com,https://merchant.yourdomain.com,https://rider.yourdomain.com,https://warehouse.yourdomain.com
CLOUDFLARE_TUNNEL_TOKEN=<your-tunnel-token>
```

The `CLOUDFLARE_TUNNEL_TOKEN` env var is required for the `cloudflared`
service. Configure your Cloudflare Zero Trust tunnel to route each subdomain
to the corresponding container's internal port (`dashboard:3000`,
`merchant:3000`, etc.). If you're running locally without a tunnel, you can
remove the `cloudflared` service block from the compose file.

Copy `config.example.yml` to `config.yml` and edit it to match your actual
Cloudflare Tunnel configuration. `config.yml` is gitignored — it carries your
tunnel UUID and hostname, which is why it is never committed (ROADMAP R3.4).
The token-based flow (`CLOUDFLARE_TUNNEL_TOKEN`, see `docs/DEPLOYMENT.md`) is
what the compose deployment uses.

---

## Naming & style conventions

- Files: `kebab-case.tsx` / `kebab-case.ts`. Hooks: `use-<resource>.ts`
  exporting `useResource()`. Dialogs: `<verb>-<thing>-dialog.tsx`.
- Components/types: `PascalCase`. Variables/functions: `camelCase`.
- Prefer `type` aliases derived from the schema over hand-written interfaces.
- Comment the **why**, not the **what** — match the terse, intent-explaining
  comment style already in the routes and hooks.
- Tailwind: follow the project's design tokens — 3–5 colors drawn from the
  theme palette, flexbox-first layout, spacing scale values only, no inline
  hex colors.

---

## Performance patterns for list routes

Every paginated GET route in this codebase follows a set of established
patterns. When adding or modifying a list route, match all of them.

### Parallel COUNT + SELECT

The COUNT and the data query are always independent. Run them with
`Promise.all` so both hit the database concurrently instead of sequentially:

```ts
const [[{ count }], rows] = await Promise.all([
  db
    .select({ count: sql<number>`count(*)` })
    .from(order)
    .where(where),
  dbQuery,
])
```

Never write the sequential form (`const [{ count }] = await …; const rows = await …`) —
it pays two serial round-trips where one concurrent pair would do.

### Multi-bucket counts: single-pass aggregate FILTER

When an endpoint returns several independent counts that **share the same base
predicate** (e.g. warehouse exception counts by status in
`src/app/api/orders/counts/route.ts`), don't run one `count(*)` query per bucket —
even in parallel. Collapse them into a single query with aggregate `FILTER`
clauses so Postgres does one index scan and one round-trip:

```ts
const [row] = await db
  .select({
    failedAttempt: sql<number>`count(*) filter (where ${order.status} = 'FAILED_ATTEMPT')`,
    unsettled: sql<number>`count(*) filter (where ${order.status} = 'DELIVERED' and ${order.codSettledAt} is null)`,
    returned: sql<number>`count(*) filter (where ${order.status} = 'RETURNED')`,
  })
  .from(order)
  .where(eq(order.warehouseId, warehouseId))
```

This is better than `Promise.all`-ing N count queries: each bucket would
otherwise probe the index separately, while `FILTER` reads the matching rows
once and buckets them in memory. Use it whenever the buckets share the WHERE
clause; fall back to parallel COUNT + SELECT when the predicates are disjoint.

### JOIN instead of subselect for cross-table search

When search needs to filter on a related table's column (e.g. merchant name,
warehouse city), use an explicit `LEFT JOIN` on the main query and add the
`ilike` condition against the joined column. This lets Postgres plan a hash
join rather than potentially materialising a correlated subquery:

```ts
// Good — explicit JOIN, planner can choose hash/merge join
let dbQuery = db
  .select(listColumns)
  .from(order)
  .leftJoin(merchant, eq(order.merchantId, merchant.id))
  .leftJoin(warehouse, eq(order.warehouseId, warehouse.id))
  .$dynamic()
// …then add ilike(merchant.businessName, likeQ) to the where clause

// Avoid — subselect may be materialised as a correlated scan at scale
const merchantIds = db.select({ id: merchant.id }).from(merchant).where(ilike(...))
conditions.push(inArray(order.merchantId, merchantIds))
```

The COUNT query should include the same JOINs **only when the WHERE clause
references columns from the joined tables** (e.g. a search across
`merchant.businessName`). When the WHERE only touches columns on the primary
table, omit the JOINs from the COUNT to avoid unnecessary work:

```ts
const countQuery = search
  ? db
      .select({ count: sql<number>`count(*)` })
      .from(order)
      .leftJoin(merchant, eq(order.merchantId, merchant.id))
      .leftJoin(warehouse, eq(order.warehouseId, warehouse.id))
      .where(where)
  : db
      .select({ count: sql<number>`count(*)` })
      .from(order)
      .where(where)
```

### Lean column projection on list endpoints

List endpoints should select only the columns rendered by the table view.
Define a `listColumns` object and pass it to `db.select(listColumns)`.
Wide or rarely-used fields (`deliveryImageLinks`, lifecycle timestamps not
shown in the table, etc.) are omitted from the list projection and kept only
in single-record detail endpoints (`GET /api/orders/[id]`).

```ts
const listColumns = {
  id: order.id,
  status: order.status,
  createdAt: order.createdAt,
  // … only what the table renders
}
let dbQuery = db.select(listColumns).from(order).$dynamic()
```

### Single-query authentication (`requireSession`)

Every authenticated route calls `requireSession()` before any handler logic
runs. The implementation resolves the caller's identity in **two DB
round-trips** that are sequenced inside a single helper:

1. `auth.api.getSession()` — validates the session via Better Auth (queries
   the `session` table).
2. A `SELECT` joining `profile` to `user` on the resolved `session.user.id` —
   loads the user's role, warehouse, merchant, and preference context.

```ts
// src/lib/api-auth.ts (simplified)
export const requireSession = cache(async () => {
  const session = await auth.api.getSession({ headers: hdrs })
  if (!session?.user) return null

  const [row] = await db
    .select({
      userId: profile.userId,
      role: profile.role,
      warehouseId: profile.warehouseId,
      // … other profile + user.name fields
    })
    .from(profile)
    .innerJoin(user, eq(user.id, profile.userId))
    .where(eq(profile.userId, session.user.id))
    .limit(1)

  return row ?? null
})
```

React's `cache()` wrapper on `requireSession` means multiple calls within the
same RSC render still only hit the DB once, which limits the practical cost of
the two-query path.

> **Planned improvement (see TODOS #4):** store profile fields in the session
> via a Better Auth session plugin so `getSession()` returns everything in one
> call and the second query is eliminated entirely. Do **not** try to replace
> `auth.api.getSession()` with a raw token cookie parse and manual session
> JOIN — that would bypass Better Auth's session validation logic.

### Read replica for GET queries (`dbRead`)

Every GET handler uses `dbRead` (from `src/lib/db/index.ts`) instead of `db`:
all paginated list endpoints, detail endpoints, counts, and aggregate queries
are offloaded to the read replica when `DATABASE_URL_READ_ONLY` is configured.
Write handlers (POST, PATCH, DELETE) continue using `db`, which always
connects to the primary:

```ts
// src/lib/db/index.ts
export const db = drizzle(pool, { schema }) // primary — writes
export const dbRead = drizzle(readPool, { schema }) // replica — reads
```

In development with no replica configured, `dbRead` falls back to the same
primary pool — zero-config, identical behaviour. In production, set
`DATABASE_URL_READ_ONLY` and all reads hit the replica automatically.

### Indexing patterns

The schema uses three kinds of indexes beyond single-column B-trees:

- **Composite covering indexes** on `order(warehouseId, status, createdAt)` and
  `order(merchantId, status, createdAt)` — cover the most common sorted list
  queries so Postgres can satisfy them with an index-only scan without touching
  the heap.
- **GIN indexes** on `payout_request(orderIds)` and `announcement(targetRoles)`
  — accelerate jsonb containment queries (`@>`). Add a GIN index whenever you
  add a `jsonb` column that will be queried with containment operators.
- **Denormalized aggregate columns** — `merchant_balance.pendingBalance` tracks
  the sum of unconfirmed `PAYMENT_PENDING` amounts, updated atomically in the
  same transaction as the balance transaction mutations. This eliminates the
  correlated subquery that previously ran per row in the merchants list.

### Cache-Control on stable resources

Routes whose data changes infrequently (warehouses, pickup locations) should include a `Cache-Control` header so the browser and
Next.js fetch cache can serve repeat navigations without a round-trip:

```ts
return NextResponse.json(data, {
  headers: {
    "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
  },
})
```

`private` prevents shared/CDN caching of user-scoped responses. The 30-second
`max-age` + 60-second `stale-while-revalidate` window gives fast repeat loads
while keeping data reasonably fresh. Do **not** add this header to routes whose
data changes frequently or that are role-sensitive in ways that differ per user
within the same browser session.

### Server-side data fetching for dashboard pages

Dashboard pages should **server-fetch aggregate data** instead of making
multiple client-side SWR calls on mount. The pattern: the page is an `async`
server component that queries the DB directly, then passes scalar values as
props to a smaller `"use client"` component that handles interactivity.

**When to apply:** any page that primarily **reads** data (counts, lists,
details) rather than drives mutations. The overview page, stat-heavy landing
pages, and detail views are good candidates. Pages that are mostly interactive
(dialogs, forms, real-time tables) stay fully client-rendered.

**Why:**

- Eliminates the client waterfall (5+ sequential API calls → 1 server query)
- Data is in the HTML on first paint — no loading spinners for initial render
- Reduces `/api/*` traffic — server queries hit `dbRead` directly
- Auth check happens server-side via `requireSession()` — no client auth flash

**Pattern:**

```tsx
// src/app/dashboard/page.tsx — server component (no "use client")
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { sql } from "drizzle-orm"
import { overviewTable } from "@/lib/db/schema"
import { OverviewPageClient } from "./overview-client"

export default async function OverviewPage() {
  const me = await requireSession()
  if (!me) redirect("/login")

  // Parallel aggregate queries — single round-trip
  const [[{ total }], [{ active }]] = await Promise.all([
    dbRead
      .select({ total: sql<number>`count(*)::int` })
      .from(overviewTable),
    dbRead
      .select({ active: sql<number>`count(*) filter (where ${overviewTable.isActive} = true)::int` })
      .from(overviewTable),
  ])

  // Pass scalars to client component
  return <OverviewPageClient total={total} active={active} />
}
```

```tsx
// src/app/dashboard/overview-client.tsx — client component
"use client"

import { useAuth } from "@/features/account/hooks/use-auth"

interface Props {
  total: number
  active: number
}

export function OverviewPageClient({ total, active }: Props) {
  const { currentUser } = useAuth() // only for interactive logic
  return (
    // ... render with pre-fetched counts, useAuth for checklist etc.
  )
}
```

**Rules:**

- **Use `dbRead`** (read replica) for all server-side queries in page
  components — never `db`.
- **Use `Promise.all`** for independent queries — never sequential awaits.
- **Pass only scalars or serialisable data** as props — no class instances,
  no functions, no `Date` objects (use ISO strings from the schema's
  `mode: "string"` columns).
- **Keep `"use client"` components small** — they exist for interactivity
  (SWR revalidation after mutations, event handlers, browser APIs), not for
  data fetching. If a client component needs fresh data after a mutation,
  use the existing SWR hooks and call `mutate()` — the server-fetched data
  serves as the initial state.
- **Auth gating** happens in the server component via `requireSession()` +
  `redirect()`. The client component does **not** need to check auth for
  rendering — it only calls `useAuth()` for interactive features (e.g.
  showing the current user's name in a checklist).
- **Don't server-fetch full paginated lists** — those belong in SWR hooks
  with client-side pagination/filter/sort. Server-fetch only the aggregate
  counts or small fixed datasets that the page needs on first render.
- **Colocate the client component** as `<name>-client.tsx` next to the page
  (e.g. `overview-client.tsx` beside `page.tsx`).

---

## Testing

Tests run with Vitest. The config (`vitest.config.ts`) uses the **`node`
environment**, not jsdom — meaning browser globals like `window` and
`document` are not available by default. Component tests that need them
should set `@vitest-environment jsdom` in a file-level docblock, or use
`@testing-library/react` which handles the DOM environment itself via the
`test-setup.ts` cleanup hook.

Spec files follow the `*.{test,spec}.{ts,tsx}` glob and can live anywhere in
the tree. API route specs are co-located with the routes they test (e.g.
`src/app/api/orders/orders.spec.ts` tests `src/app/api/orders/route.ts`).

Every spec mocks `@/lib/db`, `@/lib/api-auth`, and `@/lib/audit` via
`vi.mock()` factory functions. The mock database uses an array-based queue
(`selectQueue`) to supply predetermined results to sequential select calls,
plus result arrays (`updateResult`, `insertResult`) for writes — same pattern
used across all route specs (see `src/app/api/pickup-locations/pickup-locations.spec.ts` for the
canonical example). Session state is controlled through a shared
`sessionState.value` object set per-test. `beforeEach` resets all queues and
session state.

Current specs:

| File                                                    | Tests | What it covers                                                                         |
| ------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------- |
| `src/app/api/announcements/announcements.spec.ts`       | 14    | List, create, active, update, delete                                                   |
| `src/app/api/audit-logs/audit-logs.spec.ts`             | 3     | List (admin only)                                                                      |
| `src/app/api/cron/cron.spec.ts`                         | 6     | Session, audit-log, and email-log cleanup cron jobs                                    |
| `src/app/api/delivery-cities/delivery-cities.spec.ts`   | 17    | List, create, update, delete                                                           |
| `src/app/api/email-logs/email-logs.spec.ts`             | 7     | List, mark failed as sent                                                              |
| `src/app/api/health/health.spec.ts`                     | 1     | Health check                                                                           |
| `src/app/api/merchants/merchants.spec.ts`               | 72    | List, create, profile, approve, suspend, reactivate, pricing, balance, payment, adjust |
| `src/app/api/orders/orders.spec.ts`                     | 24    | List, create, bulk create, counts, payable, detail, receiver note                      |
| `src/app/api/orders/[id]/transitions.spec.ts`           | 60    | All 12 order transitions end-to-end                                                    |
| `src/app/api/orders/bulk/settle-cod/settle-cod.spec.ts` | 9     | Bulk COD settlement                                                                    |
| `src/app/api/payouts/payouts.spec.ts`                   | 18    | List, create, approve, mark paid, reject                                               |
| `src/app/api/pickup-locations/pickup-locations.spec.ts` | 16    | List (role-scoped), create, update, delete                                             |
| `src/app/api/rider-applications/rider-applications.spec.ts` | 21 | List, approve, reject                                                               |
| `src/app/api/riders/riders.spec.ts`                     | 21    | List, create, detail, update, toggle active                                            |
| `src/app/api/team/team.spec.ts`                         | 14    | List, create, toggle active, pricing permission, warehouse assignment                  |
| `src/app/api/uploads/uploads.spec.ts`                   | 3     | File upload                                                                            |
| `src/app/api/users/me/me.spec.ts`                       | 3     | Get and update current user profile                                                    |
| `src/app/api/warehouses/warehouses.spec.ts`             | 24    | List, create, detail, update, delete                                                   |
| `src/components/data-table.spec.tsx`                    | 19    | DataTable rendering, column visibility, and bulk selection                             |
| `src/lib/csv.spec.ts`                                   | 9     | CSV generation helpers                                                                 |
| `src/lib/pricing.spec.ts`                               | 15    | Delivery charge calculations                                                           |

Run the full suite with `pnpm test:unit:run`. For watch mode during development,
`pnpm test:unit` keeps Vitest running and re-runs affected tests on save. Use
`pnpm test:unit:report` to run with the HTML reporter instead.

### E2E tests (Playwright)

E2E tests live in `e2e/specs/` and run with Playwright against a real browser.

#### Prerequisites

- PostgreSQL running (use `docker compose -f compose.postgres.yml up -d --build`)
- `.env.development.local` with `DATABASE_URL`, `BETTER_AUTH_SECRET`
- `pnpm exec playwright install chromium` (first-time setup)

#### Directory structure

```
e2e/
  helpers.ts             # shared CREDS + login() (cookie reset → fill → waitForURL)
  selectors.ts           # data-testid selectors, grouped by domain
  specs/
    01-core-flows.spec.ts       # login per role, order lifecycle, warehouse/rider flows
    02-business-flows.spec.ts   # order ops, warehouse dispatch/intake/exceptions
    03-onboarding.spec.ts       # merchant onboarding + registration gate
    04-tracking-identity.spec.ts   # merchant sidebar identity + tracking token
    05-two-factor.spec.ts       # 2FA enrollment + TOTP login for admins
    06-support.spec.ts          # support ticket create → admin reply
```

**51 tests total** across 6 spec files. Every `test.describe` carries a unique
scenario id in `S<number>. <Name>` format (currently **S1–S37**, no gaps, no
duplicates).

#### Configuration

See [`playwright.config.ts`](./playwright.config.ts). The `webServer` runs
`pnpm db:seed:full && pnpm start` — it **reseeds the database** with the
deterministic seed data (truncating existing rows) before starting the server,
so every run begins from the same known state.

- **Build required:** `pnpm build` before the first run (rebuild after app code
  changes). Test-only changes (`*.spec.ts`, `selectors.ts`, `helpers.ts`) need no
  rebuild.
- **Single project:** `chromium`, `workers: 1`, `fullyParallel: false`.
- **Reporter:** `list` (`playwright-report/` is not generated by default).
- **Env overrides:** `AUTH_RATE_LIMIT_DISABLED=1` only — Better Auth's limiter
  otherwise starves the suite's repeated `getSession` calls and bounces shells
  back to `/login`. `MAIL_DISABLED` is **not** set by the config.
- **Windows + Turbopack:** Set `NEXT_DISABLE_TYPED_ROUTES=1` in `.env`.

#### Credentials

There is **no** storage-state project and **no** `auth.setup.ts`. Every test signs
in through the UI via the shared `login()` helper, which clears cookies first
(a second login in the same test would otherwise be redirected away by the
already-authed login page).

All seeded accounts share the password `12qwaszx`:

| Role           | Email                        | Password       |
| -------------- | ---------------------------- | -------------- |
| Super admin    | `admin1@email.com`          | `12qwaszx`     |
| Warehouse admin| `warehouse.admin1@email.com`| `12qwaszx`     |
| Merchant       | `merchant1@email.com`          | `12qwaszx`    |
| Rider          | `rider1@email.com`             | `12qwaszx`    |
| Demo merchant  | `demo@kikuya.com`            | `12qwaszx`      |

These mirror `src/lib/db/seed/seed-content.ts`.

#### Three core principles

1. **Deterministic seed data** (`src/lib/db/seed/seed-content.ts`) — every entity
   has a stable ID and predictable values. No faker, no randomness. `helpers.ts`
   re-exports the credentials the suite needs.

2. **Use `data-testid` selectors wherever possible** — add a `data-testid`
   attribute to the component under test and a constant in `e2e/selectors.ts`
   before writing a test against a new page. `getByRole`/`getByText` are
   fallbacks only for elements that cannot carry a test id (headings, generic
   text) — never for buttons, inputs, rows, or dialogs you can tag.

3. **Independent tests** — each test sets up its own preconditions via
   `page.request`. No test depends on the outcome of another.

> **Watch for side effects across spec files.** Tests that mutate shared
> entities (suspending a merchant, expiring a session) can break later specs.
> Prefer entities created for the specific test.

#### Running tests

The webserver starts automatically via Playwright's `webServer` config:

```bash
# Run full suite (auto-starts the production server)
pnpm test:e2e
```

**Work with one test at a time while iterating:**

```bash
pnpm test:e2e -g "renders rider management"   # single test by name
pnpm test:e2e e2e/specs/03-onboarding.spec.ts # single file
pnpm test:e2e e2e/specs/03-onboarding.spec.ts:34  # single test at line
```

#### Debugging

```bash
pnpm exec playwright test --ui    # UI debugger (watch mode)
```

#### CI/CD pipeline

CI (`.github/workflows/ci.yml`) runs eight jobs on every push/PR: `typecheck`,
`lint`, `format`, `test` (unit), `build`, `security` (`pnpm audit
--audit-level=high` + PR dependency review), `coverage` (`pnpm test:coverage`
against the floors in `vitest.config.ts`), and `integration` (`pnpm test:integration`
against a `postgres:17` service, after `pnpm db:migrate`). **E2E is intentionally
not in the CI pipeline** — the Playwright suite runs locally only (`pnpm test:e2e`
after `pnpm build`); its webServer needs a local Postgres + reseed that the CI
runners don't provision. Run it yourself before merging anything that changes
auth, money, roles or the order lifecycle.

#### Writing a new E2E test — checklist

1. **Sign in with the shared helper** — `await login(page, CREDS.merchant)` from
   `e2e/helpers.ts`. Never re-implement the fill/press/wait sequence.
2. **Name the describe `S<number>. <Scenario>`** — unique serial id; continue
   from the highest existing number (grep `test.describe("S` across
   `e2e/specs/` for the current max — currently S1–S37). Never reuse or skip
   numbers, and never leave a describe unprefixed.
3. **Use `CREDS` / seed constants** — don't hardcode emails, passwords, codes,
   or IDs in a spec; take them from `e2e/helpers.ts` or
   `src/lib/db/seed/seed-content.ts`.
4. **Use `data-testid` selectors where possible** — add a `data-testid` to the
   element and a constant to `e2e/selectors.ts`. Fall back to
   `getByRole`/`getByText` only for elements without a test id (headings,
   generic text); tag buttons, inputs, rows, and dialogs instead of relying on
   role/text matching.
5. **Make it independent** — the test must work alone, in any order, and
   without depending on another test's side effects.
6. **Avoid `waitForTimeout`** — use `waitForURL`, `waitForSelector`, or
   `waitForResponse` instead. The suite currently has zero fixed sleeps.
7. **Assert on visible elements** — after a mutation, assert the resulting row,
   status badge, or toast text rather than just the click succeeding.
8. **Reuse seeded read-only entities** — for scenarios that change state, create
   your own data via `page.request` instead of mutating shared seed rows.

---

## Dependency security

The CI `security` job gates on `pnpm audit --audit-level=high` — the **whole**
dependency tree, prod and dev. Local equivalent:

```bash
pnpm audit --audit-level=high
```

Do not silence a red audit by switching the gate to `pnpm audit --prod`. `--prod`
reports **0 high** on this tree, so it hides the entire dev side — which is
exactly how a high advisory shipped unnoticed while the `overrides:` comment in
`pnpm-workspace.yaml` still claimed the gate was green.

### Fixing an advisory

Check that a fix actually exists before reaching for an override:

```bash
npm view <package> version
```

If one exists, pin it in `overrides:` in `pnpm-workspace.yaml` (pnpm 11 no longer
reads `pnpm.overrides` from `package.json`) rather than adding a direct
dependency you do not otherwise need.

If **no** fix exists, the only options are to drop the dependent or to record an
explicit exception in `auditConfig.ignoreGhsas`. Keep that list as short as
possible — every entry is a permanent hole in the gate, and a long list means the
gate is decorative. Each entry needs a comment saying why it is unreachable, and
`dependency-security.spec.ts` fails if a new one appears without one.

### Why `braces` is excepted

`braces@3.0.3` carries GHSA-vfj7-8cjw-p6xm (high — DoS through deeply nested
glob patterns). The advisory lists "patched >= 3.0.4", but **3.0.3 is still the
latest published release**, and neither `micromatch` (4.0.8, latest) nor
`fast-glob` (3.3.3, latest) drops the dependency — so there is no version to move
to and no override that could work.

It is reachable only through the **shadcn CLI**, and the CLI never runs in CI or
in `next build`. The dependency is kept for a different reason: `globals.css`
imports `shadcn/tailwind.css`, so `pnpm build` fails outright without the
package. Note this before "fixing" it by deleting `shadcn` from
`devDependencies` — that breaks the build, it does not clear the advisory. The
components under `src/components/ui/` are committed code, not generated at
install time.

Remove the exception as soon as `braces` 3.0.4 ships.

## Verification checklist

Run all five before opening a PR — they must pass with zero errors:

```bash
pnpm ci:check      # typecheck + lint:check + format:check
pnpm ci:test       # test:unit:run + build + test:e2e
pnpm build         # next build
```

`pnpm ci:check` chains all three check commands in sequence — same gates the
CI workflow runs. `pnpm ci:test` builds the app, then runs the unit and E2E
suites (build is required before E2E because the test server runs
`next start`). Use the individual commands if you want to narrow down a
failure.

The CI workflow (`.github/workflows/ci.yml`) runs the same gates on every push
and PR to `main`: typecheck, lint:check, format:check, test:unit:run, build.

For anything user-visible, also verify in the browser: load the page, exercise
the primary path, and confirm the behavior works. A clean compile is **not**
proof the behavior is correct.
