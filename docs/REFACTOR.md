# TODO: CSV Bulk Order Import

> Status: **v1 shipped.** M1–M3 are complete (template + parser + resolver,
> dialog + wiring, e2e `S40` + docs). v1.1, v1.2 and v2 are scoped but not
> started.
> Primary user: Merchant (`/merchant`). Pricing, balance ledger, guards and
> `MAX_BULK_ORDERS` stay in the existing `POST /api/orders/bulk` write path.
> v1 adds a CSV front-end to it with **no server changes**.

---

## 1. Goal, scope and versions

**Goal:** A merchant downloads a CSV template, fills it (or pastes rows from a
spreadsheet), previews and validates row by row, and creates all orders in one
request. **Nothing is imported until the whole file is error-free (all-or-nothing).**

**Key simplification:** v1 caps imports at `MAX_BULK_ORDERS` (50), so an import is a
single request to the existing endpoint. That gives real server-side atomicity (one
transaction) and removes chunking, idempotency keys, checkpoints, retry/backoff and
partial-failure screens. Those return in v1.2 only if larger imports are needed.

| Version | Theme                                   | Server changes            | Rows |
|---------|-----------------------------------------|---------------------------|------|
| v1      | Single-request import, validate + fix loop | none                   | 50   |
| v1.1    | Duplicate protection, faster fixing     | guard + read-only endpoint (no migration) | 50 |
| v1.2    | Large imports                           | idempotency + migration   | 500  |
| v2      | Polish and resilience                   | none                      | 500  |
| v3      | Only if requested                       | varies                    | n/a  |

**Non-goals (all versions up to v2):**
- Excel (`.xlsx`): CSV and paste only. Workaround: "Save as CSV UTF-8" or copy/paste.
- Admin/warehouse-initiated import: merchant-only, same as `POST /api/orders/bulk`.
- Editing existing orders or status changes: import always creates `PENDING` orders.
- Importing fees, status or IDs: every fee is computed server-side.

---

## 2. Building blocks (reuse, don't rebuild)

| Piece                | Location                                                  | Reused how                                                                           |
|----------------------|-----------------------------------------------------------|--------------------------------------------------------------------------------------|
| Bulk create endpoint | `src/app/api/orders/bulk/route.ts`                        | The only write path: MERCHANT-only, `rateLimitByIp("orders-bulk", 10, 60)`, `orderBulkCreateSchema` (1..50), zone pricing, `ORDER_CHARGE` + balance upsert in one transaction |
| Row schema           | `orderCreateSchema` (`src/lib/validation.ts`)             | Per-row client validation; server re-validates                                       |
| Hook action          | `useOrders().createBulkOrders` (`use-orders.ts`)          | The single submit call in v1; wrapped by `importOrders` in v1.2                      |
| CSV out              | `toCsv` / `downloadCsv` (`src/lib/csv.ts`)                | Template and error CSV downloads (BOM handled)                                       |
| Lookups              | `GET /api/pickup-locations`, `GET /api/delivery-cities`   | Resolve names to IDs. Use the existing delivery-cities SWR hook, or add `useDeliveryCities` in `src/features/orders/hooks/` |
| Zone pricing         | `GET /api/zone-pricing`, `calcDeliveryCharge`/`calcCodFee` | Fee estimates (v1.1)                                                                |
| Dialog patterns      | `src/components/form-dialog.tsx`, `ConfirmDialog`         | Shell for feature dialogs (the import flow itself is a page, see §5)                           |
| Single-order form    | `src/app/merchant/orders/new/page.tsx`                    | Field semantics reference (phone, weight, COD)                                       |

**Gap:** no CSV parser exists in the repo (`csv.ts` is export-only), so add `papaparse`.

---

# v1: Import up to 50 orders (client-only)

**Flow:** download template, upload CSV or paste rows, preview with validation, fix
and re-upload (or edit the pasted text) until clean, import in one request.

## 3. CSV format spec

### 3.1 Template (downloadable from the import page)

Header row plus 1 sample row. The sample row is filled dynamically with the merchant's
**first real pickup location name** and an **active delivery city** (fetched when the
import page loads). If the merchant has no pickup locations, the template uses the
placeholder `MY PICKUP LOCATION` and the import page blocks importing.

```csv
pickup_location,recipient_name,recipient_phone,delivery_city,delivery_address,parcel_weight_kg,product_cost,delivery_type,delivery_map_link,merchant_note
Merchant 1 Pickup,John Doe,01712345678,Dhaka,House 1 Road 1 Dhanmondi Dhaka,1.5,1200,STANDARD,,"fragile packaging"
```

### 3.2 Columns

| #  | Column              | Required | Format / rules                                              | Normalization before validation                                          |
|----|---------------------|----------|-------------------------------------------------------------|--------------------------------------------------------------------------|
| 1  | `pickup_location`   | yes      | Exact (case-insensitive) name of merchant's pickup location | trim, collapse inner whitespace                                          |
| 2  | `recipient_name`    | yes      | 1-200 chars                                                 | trim                                                                     |
| 3  | `recipient_phone`   | yes      | BD mobile `01XXXXXXXXX` (`isValidBdPhone`)                  | convert Bangla numerals; strip spaces/dashes/`+880`/`+88` to `01...`     |
| 4  | `delivery_city`     | yes      | Exact (case-insensitive) name of an active delivery city    | trim                                                                     |
| 5  | `delivery_address`  | yes      | Full address                                                | trim                                                                     |
| 6  | `parcel_weight_kg`  | yes      | number > 0, <= merchant `maxWeightKg`                       | convert Bangla numerals; parse `1,5`/`1.5` to `1.5`                      |
| 7  | `product_cost`      | yes      | number >= 0 (COD amount; 0 = prepaid)                       | convert Bangla numerals; strip `৳`/`TK`/currency and thousands commas    |
| 8  | `delivery_type`     | no       | `STANDARD` or `FRAGILE` (default `STANDARD`)                | upper-case, trim                                                         |
| 9  | `delivery_map_link` | no       | valid URL or empty                                          | trim                                                                     |
| 10 | `merchant_note`     | no       | <= 100 chars                                                | trim; when empty, set to `[CSV import YYYY-MM-DD]` (see §7)              |

Not columns (server-owned): `deliveryFee`, `codFee`, `merchantEarnings`,
`warehouseId`, `status`, any IDs.

### 3.3 Header aliases (forgiving headers)

Header normalization: lower-case, trim, replace spaces/hyphens with `_`. Then apply
this alias map (exact match on the normalized header). Defined once in `template.ts`
as `headerAliases`.

| Canonical           | Accepted aliases                                        |
|---------------------|---------------------------------------------------------|
| `pickup_location`   | `pickup`, `pickup_point`, `pickup_name`                 |
| `recipient_name`    | `name`, `customer_name`, `recipient`, `customer`        |
| `recipient_phone`   | `phone`, `mobile`, `recipient_mobile`, `customer_phone` |
| `delivery_city`     | `city`                                                  |
| `delivery_address`  | `address`, `recipient_address`                          |
| `parcel_weight_kg`  | `weight`, `weight_kg`, `parcel_weight`                  |
| `product_cost`      | `cod`, `cod_amount`, `amount`, `price`, `product_price` |
| `delivery_type`     | `type`                                                  |
| `delivery_map_link` | `map_link`, `map`, `location_link`                      |
| `merchant_note`     | `note`, `notes`, `remarks`                              |

### 3.4 Parsing rules

- **Inputs:** a `.csv` file **or** pasted text (TSV/CSV from Excel/Google Sheets).
  Both feed the same parser; Papa runs with `delimiter: ""` (auto-detect) and `header: true`.
- **Encoding (files only):** decode the `ArrayBuffer` with
  `new TextDecoder("utf-8", { fatal: true })`; strip BOM. Reject the file if decoding
  throws or the result contains U+FFFD. Message: *"This file doesn't look like valid
  UTF-8. Re-save it as 'CSV UTF-8' in Excel/Sheets."* Never render mojibake in preview.
- **Dialect:** RFC 4180 (quoted fields, `""` escapes, CRLF/LF). No hand-rolled parser.
- **Empty rows:** skip fully-empty rows but keep physical line numbers (`__line`,
  header = line 1) so errors say **"Row 14"** and match Excel.
- **File-level rejects:** more than `MAX_BULK_ORDERS` (50) data rows, over 2 MB, or
  not `.csv`. The message states the limit and the actual value.
- **Headers:** after aliasing, if any of the 7 required headers is missing, show one
  error listing the missing names and stay in `idle`. Unknown extra columns are ignored.

## 4. Architecture

```
CSV file / pasted text ──decode+parse──▶ rows[]
   ──resolve──▶ IDs (pickup location, delivery city)     [GET lookups, cached SWR]
   ──validate──▶ per-row { ok } | { errors: ["Row 14: ..."] }   [orderCreateSchema]
   ──preview──▶ table + summary
   ──confirm──▶ POST /api/orders/bulk (one request, ≤ 50 rows)
   ──result──▶ success toast, or error with server row errors mapped to CSV rows
```

**Why client-side, not a new multipart endpoint:**
1. No new write surface: auth, merchant guards, overweight checks, zone pricing and
   the balance ledger stay in the existing route.
2. Row errors surface **before** anything is written (preview gate).
3. The file never leaves the browser; recipient PII is only sent as structured JSON
   to an authenticated merchant endpoint.
4. Follows the repo's 3-step error pipeline unchanged.

## 5. UI spec (v1)

**Entry point:** both **"Import CSV"** buttons — the merchant orders list
toolbar and the `/merchant/orders/new` header — navigate to the dedicated page
**`/merchant/orders/import`**. There is no modal anymore.

**Page:** `src/app/merchant/orders/import/`. `page.tsx` owns the header (Back
to `/merchant/orders`) plus the inactive/verification gating, `import-client.tsx`
owns the state machine, and `components/` holds `import-input-card.tsx` (file,
paste, template, lookup lists), `import-preview-card.tsx` (summary + actions)
and `import-preview-table.tsx` (the editable table). Never render the flow
inline in another page file.

Sections, top to bottom: **input card → preview (or parsing spinner) → error
banner area**.

States: `idle → parsing → preview → submitting → done | error`.

| State      | Content                                                                                                                                                                                                                                  |
|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| idle       | Input card: file input (accept `.csv`), "Paste rows from Excel/Google Sheets" textarea, **Download template**, constraints hint (50 rows, 2 MB), plain list of the merchant's valid pickup locations and active cities. No pickup locations: show "Add a pickup location first" with a link, and disable file/paste inputs. Parse errors render in the error banner area. |
| parsing    | spinner (`bulk-import-loading`) in place of the preview card; the input card stays mounted so pasting never loses focus.                                                                                                                   |
| preview    | Preview card: summary (`bulk-import-summary`): `N valid · M errors`. **Editable table** (`bulk-import-preview`, no virtualization at 50 rows): row #, recipient, phone, pickup, city, address, weight, COD, type, map link, note, per-row errors in red. **Every data cell is inline-editable:** click a cell → its control appears → the edit writes back into the row's raw values and re-runs `resolveRow` for that row only, so the row re-validates and the summary counts update immediately; Enter/blur commits a text edit, Escape cancels; `delivery_city`, `delivery_type` and `pickup_location` use selects (active cities / STANDARD-FRAGILE / the merchant's locations). Invalid rows stay marked with a red border + message until fixed, `__line` and row order never change, and server-error rows keep their server message until re-submitted. Footer: **Download error CSV** (only if M>0), **Import N orders** (**disabled until M=0 and N>0**), **Cancel** (navigates back to `/merchant/orders`). Pasted text stays in the textarea so it can be edited and re-parsed in place. |
| submitting | Import button disabled, spinner. A `useRef` "submitting" flag is set synchronously on first click, before any state update, to block double-submit.                                                                                       |
| done       | Success toast "N orders created", mutate SWR keys (`/api/orders`, `.../counts`, `.../payable`), then `router.push("/merchant/orders")` so the merchant lands on the freshly-created list.                                                   |
| error      | Toast via `formatOrderError`; the page stays open with a banner in the error banner area. Server `rows: [...]` errors (e.g. overweight) are mapped back to CSV row numbers and shown. Retry is **not** offered for validation failures. On network error or timeout, show: *"We couldn't confirm the import. Check your orders list before retrying."* |

**Error messages** are instructions, never raw schema paths:
`Row 14: phone must be a Bangladeshi number like 01712345678`.

**Error CSV:** original columns plus an `error` column. The merchant fixes it and
re-uploads. Because nothing is imported while errors exist, a fixed file re-imports
cleanly with no partial state.

**data-testid constants** (add to `e2e/selectors.ts` under `orders`):

| testid                      | Element                          |
|-----------------------------|----------------------------------|
| `bulk-import-open`          | toolbar entry button             |
| `bulk-import-template`      | Download template button         |
| `bulk-import-file`          | file input                       |
| `bulk-import-paste`         | paste textarea                   |
| `bulk-import-loading`       | parsing spinner                  |
| `bulk-import-summary`       | preview summary                  |
| `bulk-import-preview`       | preview table container          |
| `bulk-import-row-{line}`    | one preview row (physical line)  |
| `bulk-import-error-export`  | Download error CSV button        |
| `bulk-import-confirm`       | Import button                    |
| `bulk-import-cancel`        | Cancel button (back to the list) |
| `bulk-import-cell-{line}-{field}`       | one editable cell (display state) |
| `bulk-import-cell-input-{line}-{field}` | the cell's input/select while editing |

## 6. Mapping and validation (v1)

1. **Lookups** (once per import page mount, via SWR):
    - `pickup_location` to `pickupLocationId` (merchant's own only). Mismatch: row
      error `Unknown pickup location "X"`.
    - `delivery_city` to `deliveryCityId` (active cities only), same pattern.
2. **Row validation:** build the exact `orderCreateSchema` input, `safeParse`, flatten
   `issues` through the `formatOrderError` pattern, prefixed `Row N:`.
3. **Overweight:** compare against merchant `maxWeightKg` client-side. The server also
   checks; map its `rows: [...]` back to CSV rows by submission order.

## 7. Auditability

No import-tracking table. When `merchant_note` is empty, the import sets it to
`[CSV import YYYY-MM-DD]`. This lets a merchant search their order list to answer
"did that batch go through?", which is also the recovery path for the v1 network-timeout
gap. A merchant-provided note is never modified.

## 8. Files (v1)

| Action | Path                                                 | Notes                                                                                         |
|--------|------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| add    | `src/features/orders/bulk-import/template.ts`        | `orderImportHeaders`, `headerAliases`, `buildTemplateCsv()`, `buildErrorCsv(rows)` using `toCsv` |
| add    | `src/features/orders/bulk-import/csv-parse.ts`       | Papa wrapper to typed `RawOrderRow[]` with `__line`; encoding/BOM/header/row-limit/size guards (pure) |
| add    | `src/features/orders/bulk-import/resolve-rows.ts`    | name-to-ID mapping + normalization + `orderCreateSchema` validation (pure)                    |
| add    | `src/features/orders/bulk-import/*.spec.ts`          | colocated unit tests                                                                          |
| add    | `src/app/merchant/orders/import/page.tsx`            | dedicated import page: header + Back link, inactive/verification gating (§5)                  |
| add    | `src/app/merchant/orders/import/import-client.tsx`   | the `idle → error` state machine, lookups, submit + navigation (§5)                            |
| add    | `src/app/merchant/orders/import/components/*`        | `import-input-card.tsx`, `import-preview-card.tsx`, `import-preview-table.tsx` (editable §5)   |
| edit   | `src/app/merchant/orders/page.tsx`                   | `bulk-import-open` toolbar button → links to `/merchant/orders/import`                        |
| edit   | `src/app/merchant/orders/new/page.tsx`               | `bulk-import-open` header button → links to `/merchant/orders/import`                         |
| edit   | `e2e/selectors.ts`                                   | constants from §5                                                                             |
| edit   | `package.json`                                       | add `papaparse` (+ `@types/papaparse` if not bundled)                                         |
| edit   | `CONTRIBUTING.md`                                    | one paragraph in the orders section pointing at the import flow                               |
| edit   | `docs/REFACTOR.md` header                            | flip status to "v1 shipped" when milestones are green                                         |

## 9. Security and limits (v1)

- No new write path and no server changes. The existing route's auth, merchant ACTIVE +
  `canPlaceOrders` guards, and `rateLimitByIp("orders-bulk", 10, 60)` apply unchanged.
- Limits: 50 rows / 2 MB per import (client-enforced); server enforces 50/request.
- PII: no file upload; JSON only, to an authenticated merchant endpoint. No import
  state is persisted client-side in v1.
- No `dangerouslySetInnerHTML` in the preview; render cells as text.
- Error CSV download reuses `downloadCsv` (BOM + timestamped name).

## 10. Test plan (v1)

**Unit (Vitest, colocated):**
- `csv-parse.spec.ts`: happy path; quoted commas/newlines; BOM; non-UTF-8 detection
  (fatal decode, U+FFFD); missing-header error; alias mapping; TSV paste; row limit;
  size limit; empty-row skip; `__line` with a multi-line quoted field.
- `resolve-rows.spec.ts`: name resolution (case/whitespace); phone normalization
  (`+88017...`, `017-1234-5678`, Bangla numerals); numeric parsing (`1,5`, `৳1,200`,
  Bangla numerals); note auto-tag only when empty; zod flattening with row numbers;
  overweight flag.
- `template.spec.ts`: headers match §3.2; template round-trips through `csv-parse` to
  1 valid row; error CSV re-parses cleanly.

**E2E (Playwright, data-testid policy)**, new `e2e/specs/09-bulk-import.spec.ts`
(describe block `S40. CSV bulk import` — S39 is the current max; continue the
`S<number>` serial from there):
- Upload path: login as merchant, open `/merchant/orders/import`, `setInputFiles` with an in-memory CSV
  (1 valid + 1 invalid row). Preview shows 1 valid / 1 error and `bulk-import-confirm`
  is disabled. Re-upload a fixed file, counts read 2 valid / 0 errors, confirm enabled,
  import, toast and orders appear in the list. Template button visibility asserted.
- Paste path: paste rows into `bulk-import-paste`, same preview.
- Blocked import: with at least 1 error the confirm button stays disabled and the
  error CSV still downloads.
- Inline edit: click the invalid row's cell (`bulk-import-cell-{line}-{field}`),
  type the fix, and the summary flips to 2 valid / 0 errors with confirm enabled.
- Each test creates its own rows via the import page; no shared-seed mutation.

**Verification checklist (before PR):** `pnpm ci:check` + `pnpm ci:test`.

## 11. Milestones (v1)

| #  | Milestone                | Scope                                                                                         | Effort | Done when                                         |
|----|--------------------------|-----------------------------------------------------------------------------------------------|--------|---------------------------------------------------|
| M1 | Template + parser + resolver | `template.ts`, `csv-parse.ts`, `resolve-rows.ts`, papaparse dep, unit tests               | M      | All specs green; template round-trips             |
| M2 | Dialog + wiring          | State machine `idle → done`, lookups, preview table, error CSV, submit, entry button, testids | M      | Upload/paste, preview, import works end to end    |
| M3 | E2E + docs               | Playwright spec (§10), `CONTRIBUTING.md` pointer, status flip in this file's header, `pnpm ci:check` + `pnpm ci:test` | S      | E2E green; docs updated                           |

## 12. Accepted v1 risks

1. **Network timeout after submit has an unknown outcome.** Mitigated by the warning
   message and the `[CSV import]` tag; fixed by idempotency in v1.2.
2. **Re-uploading the same file creates duplicate orders.** Mitigated by the count on
   the Import button; fixed in v1.1.

---

# v1.1: Duplicate protection and faster fixing

Ship this first after v1: accidental double-imports are the biggest real-world risk.
No migration needed.

**Server**
- **Duplicate guard** in `POST /api/orders/bulk`: unless `allowDuplicates: true`, check
  the merchant's orders from the last `BULK_DUPLICATE_GUARD_MINUTES` (5). Any match
  returns `409 { code: "LIKELY_DUPLICATE", duplicates: [{ index, orderId, createdAt }] }`
  and creates nothing.
- Add optional `allowDuplicates: boolean` (default `false`) to `orderBulkCreateSchema`.
- **Read-only endpoint** `POST /api/orders/bulk/check-duplicates`
  (`src/app/api/orders/bulk/check-duplicates/route.ts`): MERCHANT-only, session-scoped,
  `rateLimitByIp("orders-bulk-check", 30, 60)`. Body `{ rows: [{ index, recipientPhone,
  deliveryAddress, productCost }] }` (1..50). Response `{ matches: [{ index, orderId,
  createdAt }] }` for orders in the last `BULK_DUPLICATE_LOOKBACK_HOURS` (24). Query
  narrowed by `merchantId` + `recipientPhone IN (...)` + `createdAt >= since`; address
  and cost compared in memory (use the schema's real field names).
- **Shared code:** `src/lib/order-dedupe-key.ts` (`normalizeDedupeKey`: phone to `01...`,
  address lower-cased with collapsed whitespace, cost rounded to 2 decimals) and
  `src/lib/order-duplicates.ts` (`findRecentDuplicateOrders(merchantId, rows, since)`).
  Constants (`BULK_DUPLICATE_GUARD_MINUTES=5`, `BULK_DUPLICATE_LOOKBACK_HOURS=24`,
  `STRONG_DUPLICATE_MINUTES=10`) live next to `MAX_BULK_ORDERS`.

**Client**
- Duplicate tuple: `(recipient_phone, delivery_address, product_cost)`, advisory only.

  | Layer        | Compared against                                    | Severity                                                       |
    |--------------|-----------------------------------------------------|----------------------------------------------------------------|
  | In-file      | Other rows in the same import                       | Soft (amber); all but the first occurrence flagged             |
  | Cross-import | Merchant's orders from the last 24 h via `check-duplicates` (one batched call after resolve) | Soft if older than 10 min; **strong** if within 10 min |

- Each flagged row gets an include checkbox (default included). "Skip all likely
  duplicates" button when strong duplicates exist. Included flagged rows send
  `allowDuplicates: true`; otherwise it is omitted and the server guard is the safety net.
- Summary becomes `N valid · M errors · D possible duplicates`.
- Handle `409 LIKELY_DUPLICATE` from the server (two-tabs case): map `duplicates[].index`
  to CSV rows and offer **Skip these rows** or **Import anyway**.
- **Inline fix:** error cells are click-to-edit and revalidate live.
- **Show only errors** toggle.
- **Fee estimates:** `estimate-fees.ts` fetches `GET /api/zone-pricing` once per dialog
  open and computes estimated fees per valid row with `calcDeliveryCharge`/`calcCodFee`.
  Summary adds `Est. fees ৳X · Total COD ৳Y`, labeled "Est."; omitted if the fetch
  fails, never blocks import.
- **Entry point:** "Bulk import CSV instead" link on `/merchant/orders/new`.

**New files:** `bulk-import/dedupe.ts`, `bulk-import/estimate-fees.ts`, the two shared
`src/lib` files, the check-duplicates route, plus specs. **Tests:** dedupe (in-file,
soft vs strong at the 10 min boundary, normalization equivalence), fee estimates, API
specs for the guard (409 within 5 min, `allowDuplicates: true` creates, outside 5 min
creates) and `check-duplicates` (24 h window, merchant scoping, rejects non-merchants
and over-limit rows), plus an E2E duplicate flow (re-import the same file, warnings
appear, rows remain importable).

---

# v1.2: Large imports (up to 500 rows)

The only version that needs a migration. The pieces are tightly coupled; ship together.

**Server**
- **Drizzle table `bulk_order_request`** (new module under
  `src/lib/db/schema.postgres/` + barrel export; apply with `pnpm db:push` and
  regenerate with `pnpm db:generate`): `id` (text PK, `createId()`), `merchantId`
  (text), `idempotencyKey` (text), `requestHash` (sha256 of canonical JSON body),
  `response` (jsonb snapshot), `createdAt` (ts); **unique index** on
  `(merchantId, idempotencyKey)` + index on `createdAt`. Written **only on
  success**, in the same transaction as the orders.
- **`POST /api/orders/bulk` order of checks:** auth/guards, rate limit, idempotency
  replay, validation, duplicate guard, create.
    1. Optional `Idempotency-Key` header (UUID); malformed returns `400`.
    2. Stored record for `(merchantId, key)`: same hash returns the stored response with
       `replayed: true`; different hash returns `422 { code: "IDEMPOTENCY_KEY_REUSED" }`.
       Replay is checked before validation and balance checks, so a replay never fails
       because prices or balance changed.
    3. A unique violation on the key (concurrent identical request) re-reads and returns
       a replay.
    4. Best-effort purge of `BulkOrderRequest` rows older than 7 days, outside the
       transaction, errors ignored.

**Client**
- `useOrders().importOrders(plan, callbacks)`:
    - **Plan freeze:** on confirm, split included rows into chunks of 50 in file order,
      one UUID v4 key per chunk sent as `Idempotency-Key`. Plan and keys never change.
    - **Sequential execution.** 500 rows = 10 chunks fits the 10/min rate limit. Stop at
      the first non-retryable failure; remaining chunks are "not attempted".
    - **429:** honor `Retry-After` (fallback 10 s, cap 65 s), max 2 retries per chunk,
      UI shows "Waiting for rate limit, retrying...".
    - **Network error/timeout:** retry the same chunk with the **same key** (max 2
      retries, 2 s then 5 s backoff). The server replays the stored result or creates
      once, so there is no unknown outcome.
    - **409 `LIKELY_DUPLICATE`:** result screen with **Skip these rows and continue**
      (re-chunk, new key) or **Import anyway** (resend with `allowDuplicates: true`).
    - **400 with `rows: [...]`:** map to CSV row numbers via chunk order; Retry not offered.
- **Confirmation:** more than 100 included rows opens `ConfirmDialog` ("Create 320
  orders in 7 batches? This takes about a minute."). ETA = remaining chunks × moving
  average chunk latency (initial guess 2 s) plus any rate-limit wait.
- **Progress:** `x / total chunks` + ETA (`bulk-import-progress`), cancel after the
  current chunk.
- **Partial-failure result:** "80 created · chunk 7 failed (reason) · 20 not attempted",
  with **Download remaining rows CSV** (only un-created rows, template format, plus
  `error` column where known) and **Retry** (resubmits pending chunks with original keys).
- **Cap:** raise `MAX_IMPORT_ROWS` to 500 and virtualize the preview with
  `@tanstack/react-virtual`. Add `buildRemainingCsv(rows)` to `template.ts`.
- New testids: `bulk-import-progress`, `bulk-import-remaining-export`, `bulk-import-retry`.

**Tests:** API specs for idempotency (same key + same body twice creates one set and
replays; same key + different body returns 422; concurrent identical requests create
one set). E2E: 500-row import completes; forced mid-import failure recovers with no
duplicates.

---

# v2: Polish and resilience

- **Checkpoint and resume:** `sessionStorage` key `bulk-import:{merchantId}`, written at
  plan freeze and after every chunk: `{ importId, createdDate, fileName, chunks: [{ key,
  lines[], status, payload?, rawRows? }], doneTupleHashes[] }`. Payloads/raw rows kept
  only for non-`done` chunks; SHA-256 hashes (no plain PII) for created rows. Cleared on
  success, discard or sign-out; does not survive tab close.
- **`resuming` state:** "We found an import that didn't finish (80/320 created)" with
  **Resume**, **Download remaining rows**, **Discard** (`bulk-import-resume`,
  `bulk-import-discard`).
- **"Already imported" flag:** rows whose tuple hash is in `doneTupleHashes` are
  excluded by default (unchecked; the merchant can re-check to force).
- **Accessibility:** keyboard editing of error cells (Enter to edit, Escape to cancel,
  Tab to move); `aria-live="polite"` progress announcements; focus moves to the summary
  when parsing completes and to the result heading when submission ends.
- **Mobile:** horizontal scroll with sticky row #/error column; buttons at least 44 px.
- **Ease-of-use extras:** `example` column in the error CSV (correct format), click-to-copy
  pickup locations and cities, any-cell inline editing.
- **Encoding and file checks:** mojibake regex `/à¦|à§/`, and the separate
  `idle-mismatch` "wrong file entirely" screen when 2 or fewer required headers are
  recognized (3-6 recognized keeps the missing-headers error).

---

# v3: Only if requested

- `.xlsx` support
- Admin or warehouse-initiated import
- Import-history table replacing the `[CSV import]` note tag

---

## Decisions (final for v1)

| Question                     | Decision                                                                                             |
|------------------------------|------------------------------------------------------------------------------------------------------|
| Where does parsing run?      | Client-side; all writes go through `POST /api/orders/bulk`                                           |
| Parser library               | `papaparse`                                                                                          |
| Who can import?              | Merchant only                                                                                        |
| Fees in CSV?                 | Never; server computes all fees and the balance ledger                                               |
| Invalid-row policy           | All-or-nothing: import blocked until every row is valid                                              |
| Row cap                      | v1: 50 rows / 2 MB (single request). v1.2: 500 rows via chunking                                     |
| Fee estimates                | v1.1; omitted gracefully if zone pricing can't be fetched                                            |
| Template sample row          | Dynamic (merchant's first pickup location + an active city)                                          |
| Excel                        | Not supported; CSV + paste-from-spreadsheet only                                                     |
| Duplicate policy             | v1.1: warn, never hard-block; server guard 5 min, cross-import lookback 24 h, strong within 10 min   |
| Retry safety                 | v1: none (accepted risk). v1.2: client-generated `Idempotency-Key` per chunk + `BulkOrderRequest`    |
| Resume storage               | v2: `sessionStorage` checkpoint                                                                      |
| Audit tagging                | Auto-tag empty notes with `[CSV import YYYY-MM-DD]`; no import-tracking table                        |
