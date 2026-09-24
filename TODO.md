# TODO — CSV Bulk Order Import

> Status: **ready to implement** — all design decisions are resolved (see §11).
> Primary user: Merchant (`/merchant`). Pricing, balance ledger, guards and
> `MAX_BULK_ORDERS` stay in the existing `POST /api/orders/bulk` write path. This
> plan adds a CSV front-end to it, plus a small set of server hardening changes
> (idempotency, duplicate guard, one read-only duplicate-check endpoint — §7).

---

## 1. Goal & non-goals

**Goal:** A merchant downloads a CSV template, fills it with orders (or pastes rows
from a spreadsheet), previews/validates row-by-row, fixes every error inline, and
creates all the orders in one flow. **Nothing is imported until the whole file is error-free (all-or-nothing).**

**Non-goals (v1):**
- Excel (`.xlsx`) — CSV and paste only. Excel → "Save as CSV UTF-8" or copy/paste is the workaround.
- Admin/warehouse-initiated import — merchant-only, same as `POST /api/orders/bulk`.
- Editing existing orders / status changes — import always creates `PENDING` orders.
- Importing fees/status/IDs — every fee is computed server-side; status is always `PENDING`.
- More than 500 rows per import.

---

## 2. Current building blocks (reuse, don't rebuild)

| Piece                | Location                                                | Reused how                                                                                                                                                                                          |
|----------------------|---------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Bulk create endpoint | `src/app/api/orders/bulk/route.ts`                      | The **only** write path. MERCHANT-only, `rateLimitByIp("orders-bulk", 10, 60)`, `orderBulkCreateSchema` (1..`MAX_BULK_ORDERS`=50), zone pricing, `ORDER_CHARGE` + balance upsert in one transaction |
| Row schema           | `orderCreateSchema` (`src/lib/validation.ts:234`)       | Per-row client validation before submit; server re-validates                                                                                                                                        |
| Hook action          | `useOrders().createBulkOrders` (`use-orders.ts:257`)    | Submit path — wrapped by new `importOrders` (chunking, progress, checkpointing)                                                                                                                     |
| CSV out              | `toCsv` / `downloadCsv` (`src/lib/csv.ts`)              | Template download + error/remaining-rows download (BOM handled)                                                                                                                                     |
| Lookups              | `GET /api/pickup-locations`, `GET /api/delivery-cities` | Resolve human-readable names → IDs. Use the existing delivery-cities SWR hook if present, otherwise add `useDeliveryCities` in `src/features/orders/hooks/`                                        |
| Zone pricing         | `GET /api/zone-pricing`, `calcDeliveryCharge`/`calcCodFee` | Fee estimates in preview                                                                                                                                                                         |
| Dialog patterns      | `src/components/form-dialog.tsx`, `ConfirmDialog`       | Shell for the import dialog and its confirmations                                                                                                                                                   |
| Single-order form    | `src/app/merchant/orders/new/page.tsx`                  | Field semantics reference (phone, weight, COD)                                                                                                                                                      |

**Gap:** no CSV **parser** exists in the repo (`csv.ts` is export-only) → add `papaparse`.

---

## 3. CSV format spec

### 3.1 Template (downloadable from the dialog)

Header row + 1 sample row. The sample row is filled dynamically with the merchant's
**first real pickup location name** and an **active delivery city** (fetched when the
dialog opens). If the merchant has no pickup locations, the template uses the
placeholder `MY PICKUP LOCATION` and the dialog blocks importing (see §5 `idle`).

```csv
pickup_location,recipient_name,recipient_phone,delivery_city,delivery_address,parcel_weight_kg,product_cost,delivery_type,delivery_map_link,merchant_note
Merchant 1 Pickup,John Doe,01712345678,Dhaka,House 1 Road 1 Dhanmondi Dhaka,1.5,1200,STANDARD,,"fragile packaging"
```

### 3.2 Columns

| #  | Column              | Required | Format / rules                                              | Normalization before validation                                          |
|----|---------------------|----------|-------------------------------------------------------------|--------------------------------------------------------------------------|
| 1  | `pickup_location`   | yes      | Exact (case-insensitive) name of merchant's pickup location | trim, collapse inner whitespace                                          |
| 2  | `recipient_name`    | yes      | 1–200 chars                                                 | trim                                                                     |
| 3  | `recipient_phone`   | yes      | BD mobile: `01XXXXXXXXX` (`isValidBdPhone`)                 | convert Bangla numerals; strip spaces/dashes/`+880`/`+88` → `01…`        |
| 4  | `delivery_city`     | yes      | Exact (case-insensitive) name of an active delivery city    | trim                                                                     |
| 5  | `delivery_address`  | yes      | Full address                                                | trim                                                                     |
| 6  | `parcel_weight_kg`  | yes      | number > 0, ≤ merchant `maxWeightKg`                        | convert Bangla numerals (০-৯); parse `1,5`/`1.5` → `1.5`                 |
| 7  | `product_cost`      | yes      | number ≥ 0 (COD amount; 0 = prepaid)                        | convert Bangla numerals; strip `৳`/`TK`/currency and thousands commas    |
| 8  | `delivery_type`     | no       | `STANDARD` \| `FRAGILE` (default `STANDARD`)                | upper-case, trim                                                         |
| 9  | `delivery_map_link` | no       | valid URL or empty                                          | trim                                                                     |
| 10 | `merchant_note`     | no       | ≤ 100 chars                                                 | trim; when empty, set to `[CSV import YYYY-MM-DD]` (see §12)             |

Not columns (server-owned): `deliveryFee`, `codFee`, `merchantEarnings`,
`warehouseId`, `status`, any IDs.

### 3.3 Header aliases (forgiving headers)

Header normalization: lower-case, trim, replace spaces/hyphens with `_`. Then apply
this alias map (exact match on the normalized header). Defined once in `template.ts`
as `headerAliases`.

| Canonical           | Accepted aliases                                            |
|---------------------|-------------------------------------------------------------|
| `pickup_location`   | `pickup`, `pickup_point`, `pickup_name`                     |
| `recipient_name`    | `name`, `customer_name`, `recipient`, `customer`            |
| `recipient_phone`   | `phone`, `mobile`, `recipient_mobile`, `customer_phone`     |
| `delivery_city`     | `city`                                                      |
| `delivery_address`  | `address`, `recipient_address`                              |
| `parcel_weight_kg`  | `weight`, `weight_kg`, `parcel_weight`                      |
| `product_cost`      | `cod`, `cod_amount`, `amount`, `price`, `product_price`     |
| `delivery_type`     | `type`                                                      |
| `delivery_map_link` | `map_link`, `map`, `location_link`                          |
| `merchant_note`     | `note`, `notes`, `remarks`                                  |

### 3.4 Parsing rules

- **Inputs:** a `.csv` file **or** pasted text (TSV/CSV from Excel/Google Sheets).
  Both feed the same parser; Papa runs with `delimiter: ""` (auto-detect) and `header: true`.
- **Encoding (files only):** decode the `ArrayBuffer` with
  `new TextDecoder("utf-8", { fatal: true })`; strip BOM. Reject the file up front if
  decoding throws, the result contains U+FFFD (`�`), or it matches `/à¦|à§/`
  (UTF-8 Bangla read as Latin-1). Message: *"This file doesn't look like valid
  UTF-8 — re-save it as 'CSV UTF-8' in Excel/Sheets."* Never render mojibake in preview.
- **Dialect:** RFC 4180 — quoted fields, `""` escapes, CRLF/LF.
- **Parser:** `papaparse`. No hand-rolled parser.
- **Empty rows:** skip fully-empty rows but keep physical line numbers
  (`__line`, header = line 1) so errors say **"Row 14"** and match Excel.
- **File-level rejects** (`MAX_IMPORT_ROWS = 500` data rows, 2 MB, `.csv` extension/MIME):
  message states the limit and the actual value.
- **Header outcome** (after aliasing, counting the 7 required columns):
    - all 7 present → proceed to `preview` (even if every row has errors);
    - 3–6 present → stay in `idle`, file-level error listing the **missing** header names;
    - ≤ 2 present → `idle-mismatch` ("wrong file entirely").
      Unknown extra columns are ignored.

---

## 4. Architecture: client-side parse + existing JSON endpoint

```
CSV file / pasted text ──decode+parse──▶ rows[]
   ──resolve──▶ IDs (pickup location, delivery city)          [GET lookups, cached SWR]
   ──validate──▶ per-row { ok } | { errors: ["Row 14: …"] }   [orderCreateSchema]
   ──dedupe──▶ in-file (local) + cross-import (POST /api/orders/bulk/check-duplicates)
   ──preview──▶ table + fee estimates (GET /api/zone-pricing)
   ──confirm──▶ freeze plan: chunks ≤50, one Idempotency-Key each, checkpoint saved
              ──▶ POST /api/orders/bulk ×N (sequential)
              ──▶ success toast + link to orders list; failed chunk → remaining-rows CSV
```

**Why client-side, not a new multipart endpoint:**

1. No new write surface — auth, merchant guards, overweight checks, zone pricing and
   the balance ledger stay in the existing route.
2. Row errors surface **before** anything is written (preview gate).
3. The file itself never leaves the browser (recipient PII is only sent as structured JSON to authenticated merchant endpoints).
4. Follows the repo's 3-step error pipeline unchanged.

### 4.1 Submission behavior

- **Plan freeze:** on confirm, all included rows (import is only enabled when none has errors) are split into chunks of
  `MAX_BULK_ORDERS` (50) in file order. Each chunk gets a UUID v4 idempotency key
  sent as the `Idempotency-Key` header. The plan and keys never change afterwards.
- **Sequential execution.** Rate limit is 10 requests/min, so 500 rows = 10 chunks
  fits in one window. Stop at the first non-retryable chunk failure; the remaining
  chunks are "not attempted".
- **429 handling:** honor `Retry-After` (fallback 10 s, cap 65 s), max 2 retries per
  chunk, UI shows "Waiting for rate limit, retrying…". Still 429 after retries →
  chunk failure.
- **Network error / timeout:** retry the same chunk with the **same key** (max 2
  retries, 2 s then 5 s backoff). The server either replays the stored result or
  creates it once — no "unknown outcome".
- **409 `LIKELY_DUPLICATE` (server backstop):** the chunk was not created. Map
  `duplicates[].index` back to CSV rows and stop with a result screen offering
  **"Skip these rows and continue"** (re-chunk without them, new key) or
  **"Import anyway"** (resend same chunk with `allowDuplicates: true`).
- **400 with `rows: [...]`** (e.g. overweight, `bulk/route.ts:76-88`): map back to CSV
  row numbers via chunk order and show those errors on the result screen. The chunk is
  failed and **Retry is not offered** for validation failures; the merchant fixes the rows
  in the remaining-rows CSV (which includes an `error` column) and re-imports it. Client-side
  validation blocks the import first, so this should be rare.
- **`allowDuplicates`:** the client sends `allowDuplicates: true` on every chunk only
  when the merchant's included set contains at least one duplicate-flagged row
  (§6.3). Otherwise it is omitted and the server guard acts as a safety net.
- **Confirmation for large imports:** more than 100 included rows → `ConfirmDialog`:
  *"Create 320 orders in 7 batches? This takes about a minute."* ETA = remaining
  chunks × moving average of measured chunk latency (initial guess 2 s/chunk) plus any
  active rate-limit wait.
- **Double-submit protection:** the confirm handler sets a `useRef` "submitting" flag
  and disables the button synchronously on the first click, before any state update.
- **Checkpoint / resume (sessionStorage):** key `bulk-import:{merchantId}`. Written at
  plan freeze and after every chunk:
  `{ importId, createdDate, fileName, chunks: [{ key, lines[], status: pending|done|failed,
  payload?, rawRows? }], doneTupleHashes[] }`.
  `payload` and `rawRows` are kept only for non-`done` chunks (needed to retry and to
  build the remaining-rows CSV in template format). `doneTupleHashes` are SHA-256
  hashes of normalized `(phone, address, cost)` tuples of created rows (no plain PII).
  Cleared on full success, explicit discard/cancel, or sign-out. Survives a page
  refresh; it does **not** survive closing the tab (sessionStorage is per-tab and
  intentionally clears PII). After a tab close, re-uploading the original file is
  covered by cross-import duplicate detection (§6.3).
- **Partial failure result:** "✅ 80 created · ⚠️ chunk 7 failed (reason) · ⏸ 20 not
  attempted", with **Download remaining rows CSV** (only un-created rows, template
  format, plus `error` column where known) and **Retry** (resubmits exactly the
  pending chunks with their original keys).

---

## 5. UI spec

**Entry points** (both open the same dialog):
- Merchant orders list page — toolbar button **"Import CSV"**
- `/merchant/orders/new` — secondary link "Bulk import CSV instead"

**Dialog:** `src/features/orders/dialogs/bulk-import-dialog.tsx` (flat file; promote to
a folder only if local types grow). Built on `FormDialog`. Never rendered inline in a
page file. Confirmations go through `ConfirmDialog`.

States: `idle → parsing → preview → submitting → done | error`, plus
`idle-mismatch` (wrong file entirely) and `resuming` (interrupted import found on open).

| State           | Content                                                                                                                                                                                                                                                                                                                                                                                                                       |
|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| idle            | Drop/browse file input (accept `.csv`), "Paste rows from Excel/Google Sheets" textarea, **"Download template"**, constraints hint (500 rows, 2 MB), sidebar listing the merchant's valid pickup locations and active cities with click-to-copy. If the merchant has **no pickup locations**: show "Add a pickup location first" with a link to pickup locations, and disable file/paste inputs.                                      |
| idle-mismatch   | Header outcome ≤ 2 recognized required headers: *"This doesn't look like an order file — download the template and try again"* + template button. No error wall.                                                                                                                                                                                                                                                              |
| parsing         | spinner (`bulk-import-loading`)                                                                                                                                                                                                                                                                                                                                                                                               |
| preview         | Summary header (`bulk-import-summary`): `N valid · M errors · D possible duplicates · Est. fees ৳X · Total COD ৳Y`. Controls: "Show only errors" toggle; "Skip all likely duplicates" (only when strong duplicates exist). Virtualized table (`bulk-import-preview`): row #, recipient, city, weight, COD, include checkbox on duplicate-flagged rows, per-row errors (red), duplicate flag (amber / red-amber). Error cells are click-to-edit. Footer: **"Download error CSV"** (only if M>0), **"Import N orders"** (**disabled until M=0 and N>0**), **Cancel**. Import is blocked while any row has an error; nothing is excluded silently. |
| submitting      | progress `x / total chunks` + ETA (`bulk-import-progress`), `aria-live="polite"` announcements, cancel-after-current-chunk button                                                                                                                                                                                                                                                                                            |
| resuming        | "We found an import that didn't finish (80/320 created)" → **Resume**, **Download remaining rows**, **Discard**                                                                                                                                                                                                                                                                                                              |
| done            | success toast "N orders created", mutate SWR keys (`/api/orders`, `…/counts`, `…/payable`), clear checkpoint, close                                                                                                                                                                                                                                                                                                           |
| error           | toast via `formatOrderError`; dialog stays open showing the partial-failure result (§4.1) with remaining-rows CSV and Retry                                                                                                                                                                                                                                                                                                   |

**data-testid additions** (add constants to `e2e/selectors.ts` under `orders`):

| testid                       | Element                                            |
|------------------------------|----------------------------------------------------|
| `bulk-import-open`           | toolbar entry button                               |
| `bulk-import-template`       | Download template button                           |
| `bulk-import-file`           | file input                                         |
| `bulk-import-paste`          | paste textarea                                     |
| `bulk-import-mismatch`       | wrong-file message container                       |
| `bulk-import-summary`        | preview summary header                             |
| `bulk-import-preview`        | preview table container                            |
| `bulk-import-row-{line}`     | one preview row (line = physical CSV line)         |
| `bulk-import-include-{line}` | include checkbox on a duplicate-flagged row        |
| `bulk-import-skip-duplicates`| "Skip all likely duplicates" button                |
| `bulk-import-filter-errors`  | "show only errors" toggle                          |
| `bulk-import-error-export`   | Download error CSV button                          |
| `bulk-import-confirm`        | Import button                                      |
| `bulk-import-progress`       | progress indicator                                 |
| `bulk-import-remaining-export`| Download remaining rows CSV button                |
| `bulk-import-retry`          | Retry button                                       |
| `bulk-import-resume`         | Resume button (`resuming` state)                   |
| `bulk-import-discard`        | Discard button (`resuming` state)                  |

---

## 5b. Ease-of-use requirements (all v1)

| #    | Requirement                              | Detail                                                                                                                                                                                                                                     |
|------|------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| U1   | **Paste-from-spreadsheet**               | Idle state offers a `.csv` file **or** a paste textarea. Both feed the same parser. No file-save step for small batches.                                                                                                                   |
| U2   | **Forgiving parsing**                    | Phone/number/Bangla-numeral normalization per §3.2; header aliases per §3.3.                                                                                                                                                                |
| U3   | **Template that can't be wrong**         | Dynamic sample row (§3.1) + sidebar of valid pickup locations and cities with click-to-copy.                                                                                                                                                |
| U4   | **Self-healing error loop**              | Error CSV = original columns + `error` column + `example` column (correct format). Because nothing is imported while errors exist, a fixed file re-imports cleanly with no partial state.                                                              |
| U5   | **Duplicate warning, not block**         | Flagged in preview, importable, never hard-blocked (§6.3).                                                                                                                                                                                  |
| U6   | **Inline fix in preview**                | Error cells click-to-edit; the row revalidates live (resolver + single-row duplicate check). This is the primary way to reach zero errors, since import is blocked until then. v1: only rows with errors are editable; any-cell editing is out of scope.                                                                     |
| U7   | **Trust before commit**                  | Summary shows counts, estimated fees and total COD. Import button repeats the count ("Import 47 orders"). If the zone-pricing fetch fails, omit the fee figure — never block the import.                                                    |
| U8   | **One-screen flow**                      | Single dialog, no wizard. Cancel discards preview state; re-open is cheap.                                                                                                                                                                  |
| U9   | **Obvious recovery on partial failure**  | Result screen + remaining-rows CSV + Retry with the original keys (§4.1).                                                                                                                                                                   |
| U10  | **Mobile friendly**                      | Horizontal scroll with sticky row #/error column; buttons ≥ 44 px; virtualized rendering (`@tanstack/react-virtual`) for smooth 500-row scroll.                                                                                             |
| U11  | **Plain language**                       | Every error is an instruction: `Row 14: phone must be a Bangladeshi number like 01712345678` — never `issues[0].path`.                                                                                                                      |
| U12  | **Filter to what needs attention**       | "Show only errors" toggle; long address/note cells truncate with a tooltip so rows don't reflow.                                                                                                                                            |
| U13  | **Encoding safety net**                  | Non-UTF-8 files rejected before preview with a fix instruction (§3.4).                                                                                                                                                                      |
| U14  | **Resilience to interruption**           | Refresh mid-import is recoverable via the checkpoint and `resuming` state (§4.1).                                                                                                                                                           |
| U15  | **Accessibility**                        | Keyboard editing of error cells (Enter to edit, Escape to cancel, Tab to move); `aria-live="polite"` progress announcements; focus moves to the preview summary when parsing completes and to the result heading when submission ends.      |

---

## 6. Mapping & validation detail

1. **Lookups** (once per dialog open, via SWR):
    - `pickup_location` → `pickupLocationId` (merchant's own only). Mismatch → row
      error `Unknown pickup location "X"`; the error CSV's `example` column lists
      the valid names.
    - `delivery_city` → `deliveryCityId` (active cities only), same error pattern.
2. **Row validation:** build the exact `orderCreateSchema` input, `safeParse`, flatten
   `issues` through the `formatOrderError` pattern, prefixed `Row N:`.
3. **Duplicate detection (advisory only, never blocks).** The tuple is
   `(recipient_phone, delivery_address, product_cost)` normalized by the shared
   `normalizeDedupeKey()` (§7): phone → `01…`, address lower-cased with whitespace
   collapsed, cost rounded to 2 decimals.

   | Layer                       | Compared against                                             | Severity / default                                                                                                                 |
      |-----------------------------|--------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
   | In-file                     | Other rows in the same import                                | Soft (amber). Included by default (all but the first occurrence are flagged).                                                      |
   | Cross-import                | Merchant's orders from the last **24 h** (`POST /api/orders/bulk/check-duplicates`, one batched call after resolve; single-row call after an inline edit) | Soft (amber) if older than **10 min**; **strong** (red-amber) if created within the last 10 min. Both included by default; strong also offers "Skip all likely duplicates". |
   | This-session re-submission  | `doneTupleHashes` in the sessionStorage checkpoint (§4.1)    | Flagged "already imported" and **excluded by default** (unchecked). Merchant can re-check to force-import.                        |

   Each flagged row has an include checkbox. Included flagged rows trigger
   `allowDuplicates: true` on submit (§4.1).

   **Server backstop:** 5-minute duplicate guard inside `POST /api/orders/bulk` (§7),
   which covers two-tabs and retry-outside-the-key cases the client can't see.
4. **Overweight:** compare against merchant `maxWeightKg` client-side; the server
   also checks — map its `rows: [...]` back to CSV rows by chunk submission order.
5. **Fee estimates (v1):** `estimate-fees.ts` fetches `GET /api/zone-pricing` once
   per dialog open and computes `deliveryFee`/`codFee` per valid row with
   `calcDeliveryCharge`/`calcCodFee`, using the same zone inputs as `bulk/route.ts`.
   Labeled "Est." — the server recomputes authoritatively.

---

## 7. Server changes (M3)

The write path stays `POST /api/orders/bulk`; these changes make it safe to call
repeatedly from a client-driven loop.

**A. Schema (Prisma migration).** New model `BulkOrderRequest`:
`id`, `merchantId`, `idempotencyKey` (string), `requestHash` (sha256 of the canonical
JSON body), `response` (Json snapshot of the success response), `createdAt`;
`@@unique([merchantId, idempotencyKey])`, `@@index([createdAt])`.
Rows are written **only on success**, in the same transaction as the orders.

**B. `POST /api/orders/bulk` changes.** Check order: auth/guards → existing rate limit
→ idempotency replay → validation → duplicate guard → create.
1. Read optional `Idempotency-Key` header (UUID). Malformed → `400`.
2. If a stored record exists for `(merchantId, key)`: same `requestHash` → return the
   stored `response` with `replayed: true` (same status as original). Different hash →
   `422 { code: "IDEMPOTENCY_KEY_REUSED" }`. Replay is checked **before** validation and
   balance checks so a replay can never fail because prices or balance changed.
3. Add optional `allowDuplicates: boolean` (default `false`) to `orderBulkCreateSchema`.
4. Unless `allowDuplicates`: run the duplicate guard against the merchant's orders from
   the last `BULK_DUPLICATE_GUARD_MINUTES` (5). Any match →
   `409 { code: "LIKELY_DUPLICATE", duplicates: [{ index, orderId, createdAt }] }` and
   nothing is created.
5. Create orders + balance upsert + insert `BulkOrderRequest` in one transaction. A
   unique-violation on the key (concurrent identical request) → re-read and return as a replay.
6. Best-effort purge of `BulkOrderRequest` rows older than 7 days (`deleteMany`,
   outside the transaction, errors ignored).

**C. New read-only endpoint** `POST /api/orders/bulk/check-duplicates`
`src/app/api/orders/bulk/check-duplicates/route.ts`:
- MERCHANT-only, scoped to the session merchant, `rateLimitByIp("orders-bulk-check", 30, 60)`.
- Body: `{ rows: [{ index, recipientPhone, deliveryAddress, productCost }] }` (1..500).
- Response: `{ matches: [{ index, orderId, createdAt }] }` for orders in the last
  `BULK_DUPLICATE_LOOKBACK_HOURS` (24).
- Query narrowed by `merchantId` + `recipientPhone IN (…)` + `createdAt >= since`; address
  and cost compared in memory with `normalizeDedupeKey()`. (Use the schema's real
  field names.)

**D. Shared code.** `src/lib/order-dedupe-key.ts` (`normalizeDedupeKey`) and
`src/lib/order-duplicates.ts` (`findRecentDuplicateOrders(merchantId, rows, since)`),
used by the client, the check endpoint and the bulk route. Constants
(`MAX_IMPORT_ROWS=500`, `BULK_DUPLICATE_GUARD_MINUTES=5`,
`BULK_DUPLICATE_LOOKBACK_HOURS=24`, `STRONG_DUPLICATE_MINUTES=10`) live next to
`MAX_BULK_ORDERS`.

---

## 8. Files to add/change

| Action | Path                                                        | Notes                                                                                                                              |
|--------|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| add    | `src/features/orders/bulk-import/template.ts`               | `orderImportHeaders`, `headerAliases`, `buildTemplateCsv()`, `buildErrorCsv(rows)`, `buildRemainingCsv(rows)` using `toCsv`         |
| add    | `src/features/orders/bulk-import/csv-parse.ts`              | Papa wrapper → typed `RawOrderRow[]` with `__line`; encoding/BOM/header-outcome/row-limit/size guards (pure)                       |
| add    | `src/features/orders/bulk-import/resolve-rows.ts`           | name→ID mapping + normalization + `orderCreateSchema` validation → `ResolvedRow \| RowError[]` (pure)                              |
| add    | `src/features/orders/bulk-import/dedupe.ts`                 | in-file + cross-import + session classification (pure; cross-import takes a `matches` input)                                       |
| add    | `src/features/orders/bulk-import/estimate-fees.ts`          | fee estimates from zone pricing (pure given the pricing data)                                                                      |
| add    | `src/features/orders/bulk-import/checkpoint.ts`             | sessionStorage read/write/clear, tuple hashing                                                                                     |
| add    | `src/features/orders/bulk-import/*.spec.ts`                 | unit tests, colocated                                                                                                              |
| add    | `src/features/orders/dialogs/bulk-import-dialog.tsx`        | dialog UI (§5), virtualized preview, resume handling                                                                               |
| add    | `src/lib/order-dedupe-key.ts`, `src/lib/order-duplicates.ts`| shared normalizer and lookup (§7D)                                                                                                 |
| add    | `src/app/api/orders/bulk/check-duplicates/route.ts`         | read-only duplicate check (§7C)                                                                                                    |
| add    | `prisma/schema.prisma` (+ migration)                        | `BulkOrderRequest` model (§7A)                                                                                                     |
| edit   | `src/app/api/orders/bulk/route.ts`                          | idempotency + duplicate guard + `allowDuplicates` (§7B)                                                                            |
| edit   | `src/lib/validation.ts`                                     | `allowDuplicates` on `orderBulkCreateSchema`; check-duplicates body schema                                                         |
| edit   | `src/features/orders/hooks/use-orders.ts`                   | `importOrders(plan, callbacks)` — chunking, keys, retries/backoff, checkpointing, partial-failure result                            |
| edit   | `src/app/merchant/orders/page.tsx`                          | `bulk-import-open` button + dialog wiring                                                                                          |
| edit   | `src/app/merchant/orders/new/page.tsx`                      | "bulk import instead" link                                                                                                         |
| edit   | `e2e/selectors.ts`                                          | constants from §5                                                                                                                  |
| edit   | `package.json`                                              | add `papaparse`, `@tanstack/react-virtual` (+ `@types/papaparse` if not bundled)                                                   |
| edit   | `docs/REFACTOR.md` §10                                      | replace open question with "decided: CSV v1 client-side import (see TODO.md)"                                                      |
| edit   | `CONTRIBUTING.md`                                           | one paragraph in the orders section pointing at the import flow                                                                    |

---

## 9. Security & limits

- No new write path. New server surface is limited to: an optional header/field on
  the existing route and one read-only, merchant-scoped endpoint (own rate limit).
- Limits: **500 rows / 2 MB** per import (client-enforced); server keeps 50/request;
  `rateLimitByIp("orders-bulk", 10, 60)` applies per chunk.
- Merchant ACTIVE + `canPlaceOrders` guards unchanged (server).
- Idempotency keys are scoped per merchant; a key can never read another merchant's result.
- PII: no file upload; JSON only, to authenticated merchant endpoints. The session
  checkpoint holds pending payloads/raw rows in `sessionStorage` (cleared on finish,
  discard, sign-out, tab close) and only hashes for created rows.
- No `dangerouslySetInnerHTML` in preview — render cells as text.
- Error/remaining CSV downloads reuse `downloadCsv` (BOM + timestamped name).

---

## 10. Test plan

**Unit (Vitest, colocated):**
- `csv-parse.spec.ts`: happy path; quoted commas/newlines; BOM; non-UTF-8 detection
  (fatal decode, U+FFFD, mojibake regex); header outcomes (all / 3–6 / ≤2 recognized);
  alias mapping; TSV paste; row limit; size limit; empty-row skip; `__line` with a
  multi-line quoted field.
- `resolve-rows.spec.ts`: name resolution (case/whitespace), phone normalization
  (`+88017…`, `017-1234-5678`, Bangla numerals), numeric parsing (`1,5`, `৳1,200`,
  Bangla numerals), note auto-tag only when empty, zod flattening with row numbers,
  overweight flag.
- `dedupe.spec.ts`: in-file duplicates, cross-import soft vs strong (10 min boundary),
  session re-submission default-skip, normalization equivalence.
- `estimate-fees.spec.ts`: known zone-pricing fixtures → expected estimates; missing
  pricing → no estimate.
- `template.spec.ts`: headers match §3.2; template round-trips through `csv-parse` to 1
  valid row; error/remaining CSVs re-parse cleanly.
- `checkpoint.spec.ts`: write/read/clear, only non-done chunks retain payloads.

**API (`src/app/api/orders/orders.spec.ts` + new):**
- Existing bulk cases keep passing.
- Idempotency: same key + same body twice → one set of orders, second call `replayed: true`;
  same key + different body → 422; concurrent identical requests → one set of orders.
- Duplicate guard: same tuple within 5 min → 409 with `duplicates[]`, nothing created;
  with `allowDuplicates: true` → created; outside 5 min → created.
- `check-duplicates`: returns matches within 24 h, respects merchant scoping, rejects
  non-merchants and > 500 rows.

**E2E (Playwright, data-testid policy)** — new `e2e/specs/05-bulk-import.spec.ts`:
- Happy path: login as merchant → open dialog → `setInputFiles` with an in-memory CSV
  (valid + 1 invalid row) → preview shows 1 valid / 1 error and `bulk-import-confirm` is disabled →
  fix the invalid row inline → confirm enabled → import → toast + order in list. Template download asserted via `bulk-import-template` visibility.
- Paste path: paste rows into `bulk-import-paste` → same preview.
- Blocked import: with ≥1 error the confirm button stays disabled and the error CSV still downloads; after inline fix the counts read 2 valid / 0 errors.
- Duplicate flow: import a file, re-import it → duplicate warnings appear and rows
  remain importable.
- Interruption: start a multi-chunk import, reload mid-way, reopen dialog →
  `resuming` shows the correct remaining count; Resume completes without duplicates.
- Each test creates its own rows via the dialog; no shared-seed mutation.

**Verification checklist (before PR):** `pnpm ci:check` + `pnpm ci:test`.

---

## 11. Decisions (final)

| Question                            | Decision                                                                                                                                              |
|-------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| Where does parsing run?             | Client-side; all writes go through `POST /api/orders/bulk`                                                                                            |
| Parser library                      | `papaparse`                                                                                                                                           |
| Who can import?                     | Merchant only                                                                                                                                         |
| Fees in CSV?                        | Never — server computes all fees and the balance ledger                                                                                               |
| Invalid-row policy                  | All-or-nothing: import is blocked until every row is valid; errors are fixed inline or via the error CSV                                                                  |
| Row cap                             | 500 rows / 2 MB per import; 10 chunks fit the 10/min rate limit, so no rate-limit change                                                              |
| Fee estimates in preview            | In v1 (M4); omitted gracefully if zone pricing can't be fetched                                                                                       |
| Template sample row                 | Dynamic (merchant's first pickup location + an active city)                                                                                           |
| Excel                               | Not supported; CSV + paste-from-spreadsheet only                                                                                                      |
| Cross-import duplicate window       | 24 h lookback; strong warning within 10 min; via new read-only `check-duplicates` endpoint                                                            |
| Server duplicate guard window       | 5 min, overridable with `allowDuplicates: true`                                                                                                       |
| Duplicate policy                    | Warn, never hard-block. Included by default except "already imported this session" (excluded by default)                                              |
| Retry safety                        | Client-generated `Idempotency-Key` per chunk, persisted in a `BulkOrderRequest` table (unique per merchant+key, stored on success, 7-day retention)   |
| Resume storage                      | `sessionStorage` checkpoint (pending payloads only; hashes for created rows); tab-close recovery relies on cross-import duplicate detection            |
| Audit tagging                       | Auto-tag empty notes with `[CSV import YYYY-MM-DD]`; no import-tracking table                                                                          |
| Large-import confirmation           | `ConfirmDialog` above 100 included rows                                                                                                                |

---

## 12. Milestones

| #  | Milestone                    | Scope                                                                                                                                                                                                      | Effort | Done when                                                                                             |
|----|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|-------------------------------------------------------------------------------------------------------|
| M1 | Spec + template              | `template.ts` (headers, aliases, template/error/remaining CSV builders), unit tests                                                                                                                        | S      | `template.spec.ts` green; template round-trips                                                        |
| M2 | Parser, resolver, dedupe     | `csv-parse.ts`, `resolve-rows.ts`, `dedupe.ts`, `order-dedupe-key.ts`, papaparse dep, encoding detection, unit tests                                                                                        | M      | All parse/resolve/dedupe specs green                                                                  |
| M3 | Server hardening             | Prisma migration, idempotency, duplicate guard, `allowDuplicates`, `check-duplicates` endpoint, shared helpers, API tests. Independent of M2 — can run in parallel                                          | M      | New API specs green; existing bulk specs unchanged                                                    |
| M4 | Import dialog (preview)      | State machine through `preview`, lookups, virtualized preview, inline fix, dedupe UI, fee estimates, U1–U3, U5–U8, U10–U13, U15, testids, entry points                                                     | M      | Upload/paste → accurate preview with summary, filters, inline edit; Import stays disabled while errors exist; wired to M5 stub    |
| M5 | Chunked submit + recovery    | `importOrders`, keys, backoff, checkpoint, ETA, 409/400 handling, partial-failure result, remaining-rows CSV, Retry, `resuming` state, large-import confirm (U9, U14)                                       | M      | 500-row import completes; forced mid-import failure recovers with no duplicates                       |
| M6 | E2E + docs                   | Playwright spec (§10), `REFACTOR.md` §10, `CONTRIBUTING.md`, `pnpm ci:check` + `pnpm ci:test`                                                                                                              | S      | E2E green; docs updated                                                                               |

Order: M1 → (M2 ∥ M3) → M4 → M5 → M6. M1–M3 have no UI and can ship first.

---

## 13. Auditability

No import-tracking table in v1. When `merchant_note` is empty, the import sets it to
`[CSV import YYYY-MM-DD]` (date fixed at plan freeze, so resumed imports keep the
original date). This lets a merchant search their order list afterwards to answer
"did that batch go through?". A merchant-provided note is never modified.
