/**
 * Centralized selectors for E2E tests.
 * Use data-testid attributes for stable, intent-revealing selectors.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth = {
  loginEmail: "[data-testid='login-email']",
  loginPassword: "[data-testid='login-password']",
  loginSubmit: "[data-testid='login-submit']",
  loginError: "[data-testid='login-error']",
  registerForm: "[data-testid='register-form']",
  // Lives in the RightNav panel now: open topnav.userMenu first.
  logout: "[data-testid='logout']",
  accountTwoFactorTab: "[data-testid='account-tab-two-factor']",
}

// ─── Rider application (public) ──────────────────────────────────────────────
export const riderApplication = {
  print: "[data-testid='rider-apply-print']",
  name: "[data-testid='rider-name']",
  email: "[data-testid='rider-email']",
  phone: "[data-testid='rider-phone']",
}

// ─── Merchant registration (public) ──────────────────────────────────────────
export const register = {
  form: "[data-testid='register-form']",
  businessName: "[data-testid='register-business-name']",
  email: "[data-testid='register-email']",
}

// ─── Two-factor authentication ─────────────────────────────────────────
export const twoFactor = {
  status: "[data-testid='two-factor-status']",
  policy: "[data-testid='two-factor-policy']",
  enableButton: "[data-testid='two-factor-enable']",
  passwordInput: "[data-testid='two-factor-password-input']",
  passwordSubmit: "[data-testid='two-factor-password-submit']",
  secret: "[data-testid='two-factor-secret']",
  qr: "[data-testid='two-factor-qr']",
  codeInput: "[data-testid='two-factor-code-input']",
  verifySubmit: "[data-testid='two-factor-verify-submit']",
  recoveryCodes: "[data-testid='two-factor-recovery-codes']",
  recoveryCopy: "[data-testid='two-factor-recovery-copy']",
  recoveryDownload: "[data-testid='two-factor-recovery-download']",
  recoveryDone: "[data-testid='two-factor-recovery-done']",
  disableButton: "[data-testid='two-factor-disable']",
  disableInput: "[data-testid='two-factor-disable-input']",
  disableSubmit: "[data-testid='two-factor-disable-submit']",
  loginInput: "[data-testid='two-factor-login-input']",
  loginSubmit: "[data-testid='two-factor-login-submit']",
  loginRecoveryLink: "[data-testid='two-factor-login-recovery']",
}

// ─── Navigation ──────────────────────────────────────────────────────────────
export const nav = {
  sidebar: "[data-testid='sidebar']",
  sidebarLink: (label: string) =>
    `[data-testid='sidebar'] a:has-text("${label}")`,
  userMenu: "[data-testid='user-menu']",
}

// ─── TopNav (header) + RightNav (account panel) ─────────────────────────────
export const topnav = {
  root: "[data-testid='topnav']",
  // Avatar button — opens the RightNav slide-over.
  userMenu: "[data-testid='user-menu']",
  searchTrigger: "[data-testid='topnav-search']",
  paletteInput: "[data-testid='palette-input']",
  paletteEmpty: "[data-testid='palette-empty']",
  paletteItem: (href: string) => `[data-testid='palette-item-${href}']`,
  rightnav: "[data-testid='rightnav']",
  rightnavName: "[data-testid='rightnav-name']",
  rightnavAccount: "[data-testid='rightnav-account']",
}

// ─── Announcements (bell link + feed + detail page) ──────────────────────────
export const announcements = {
  bell: "[data-testid='announcement-bell']",
  badge: "[data-testid='announcement-badge']",
  // Feed rows + the "published since your last visit" pill.
  inboxRow: (id: string) => `[data-testid='inbox-row-${id}']`,
  newPill: (id: string) => `[data-testid='inbox-new-${id}']`,
  body: "[data-testid='announcement-body']",
  back: "[data-testid='announcement-back']",
}

// ─── Public landing page ────────────────────────────────────────────────────
export const landing = {
  // Kept visible below `sm`: a phone user past the hero needs a header route in.
  signIn: "[data-testid='nav-signin']",
  register: "[data-testid='nav-register']",
  pricing: "[data-testid='nav-pricing']",
}

// ─── In-app notifications (merchant) ────────────────────────────────────────
export const notifications = {
  bell: "[data-testid='notification-bell']",
  badge: "[data-testid='notification-badge']",
  tray: "[data-testid='notification-tray']",
  trayRow: "[data-testid='notification-tray-row']",
  trayEmpty: "[data-testid='notification-empty']",
  trayAll: "[data-testid='notification-tray-all']",
  // Inbox rows carry the notification id, which the test only learns at runtime.
  inboxRowAny: "[data-testid^='notification-row-']",
  newPill: (id: string) => `[data-testid='notification-new-${id}']`,
  navLink: "[data-testid='nav-/merchant/notifications']",
}

// ─── Announcement create/edit pages (replaced the dialogs) ──────────────────
export const announcementForm = {
  newLink: "[data-testid='announcements-new']",
  search: "[data-testid='table-search-dashboard-announcements']",
  title: "[data-testid='ann-title']",
  // The testid sits on CodeMirror's root; fill() needs the contenteditable.
  content: "[data-testid='ann-content'] .cm-content",
  role: (role: string) => `[data-testid='ann-role-${role}']`,
  submit: "[data-testid='ann-submit']",
  rowActions: (id: string) => `[data-testid='ann-actions-${id}']`,
  editItem: "[data-testid='ann-edit-item']",
}

// ─── Public pricing (city-to-city rate card) ─────────────────────────────────
export const pricing = {
  pageHeading: "[data-testid='pricing-heading']",
  table: "[data-testid='pricing-table']",
  cancellationTable: "[data-testid='cancellation-fee-table']",
  navLink: "[data-testid='nav-pricing']",
  // Zone × zone rate matrix. Rows are pickup zones, columns delivery zones;
  // both directions are priced separately, so cells are addressed by lane.
  zoneRateCard: "[data-testid='merchant-zone-rate-card']",
  zoneMatrix: "[data-testid='zone-rate-matrix']",
  zoneMatrixCell: (fromZoneId: string, toZoneId: string) =>
    `[data-testid='zone-matrix-cell'][data-lane='${fromZoneId}:${toZoneId}']`,
  zoneMatrixDetail: "[data-testid='zone-matrix-detail']",
  zoneMatrixDetailLane: "[data-testid='zone-matrix-detail-lane']",
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const dashboard = {
  // Zone-pricing coverage: lanes with no configured rate.
  pricingCoverageCard: "[data-testid='pricing-coverage-card']",
  pricingCoverageMissing: "[data-testid='pricing-coverage-missing']",
}

// ─── Orders ──────────────────────────────────────────────────────────────────
export const orders = {
  table: "[data-testid='table-dashboard-orders']",
  merchantTable: "[data-testid='table-merchant-orders']",
  // The DataTable tags rows `row-<tableId>-<rowKey>`, and both order lists key
  // on the order id. The previous `order-row-<id>` form matched nothing in
  // `src/` — the same stale copy the riders selectors had, fixed to the
  // pattern `packages` already used correctly.
  merchantRowPrefix: "[data-testid^='row-merchant-orders-']",
  // The submit button of `approve-order-dialog`, wired via `submitTestId`.
  approveButton: "[data-testid='approve-order']",
  approveItemType: "[data-testid='approve-order-item-type']",
  // Row-level: the actions menu and its items are one per order.
  actionsButton: (id: string) => `[data-testid='order-actions-${id}']`,
  reviewOrder: (id: string) => `[data-testid='order-review-${id}']`,
  // The order detail page (`/merchant/orders/<code>`) owns the cancel flow.
  cancelOrderButton: "[data-testid='cancel-order']",
  cancelOrderSubmit: "[data-testid='cancel-order-submit']",
  cancelReasonInput: "[data-testid='cancel-reason-input']",
  selectAll: "[data-testid='select-all']",
  // The toolbar's search field. The previous `orders-search` value matched
  // nothing in `src/`; `SearchInput` carries no testid of its own and the
  // DataTable prefixes its toolbar field with the table id.
  searchInput: "[data-testid='table-search-dashboard-orders']",
  merchantOrdersSearch: "[data-testid='table-search-merchant-orders']",
  warehouseOrdersSearch: "[data-testid='table-search-warehouse-orders']",
  // Status tabs, tagged by value. `dashboard/orders` opens on PENDING, which
  // holds only 8 of the 100 seeded orders, so anything asserting pagination
  // Must switch to ALL first. The previous `tab-${name}` value
  // matched nothing in `src/`.
  tab: (name: string) => `[data-testid='orders-tab-${name}']`,
  // CSV bulk import — the page and its testids.
  bulkImportOpen: "[data-testid='bulk-import-open']",
  bulkImportTemplate: "[data-testid='bulk-import-template']",
  bulkImportFile: "[data-testid='bulk-import-file']",
  bulkImportSummary: "[data-testid='bulk-import-summary']",
  bulkImportRow: (line: number) => `[data-testid='bulk-import-row-${line}']`,
  bulkImportFilterAll: "[data-testid='bulk-import-filter-all']",
  bulkImportFilterErrors: "[data-testid='bulk-import-filter-errors']",
  bulkImportErrorExport: "[data-testid='bulk-import-error-export']",
  bulkImportConfirm: "[data-testid='bulk-import-confirm']",
}

// ─── Quick-print parcel label (R5) ───────────────────────────────────────────
// The one reusable label action, dropped into the warehouse/rider order tables
// and the ongoing board cards. One Print button per order (tagged with the
// order id) plus a sibling Download button; the pdfme engine emits a vector
// PDF, so nothing is portaled into the DOM to assert on.
export const orderLabel = {
  button: (id: string) => `[data-testid='order-label-${id}']`,
  download: (id: string) => `[data-testid='order-label-download-${id}']`,
}

// ─── Parcel label designer (R5) ──────────────────────────────────────────────
// The superadmin design/preview/publish screen at /dashboard/label-designer.
// The Design tab is the pdfme free canvas: `canvas` is the designer host div
// (mounted once the label font loads; `canvasLoading` before that), and the
// palette inserts bound fields/primitives into the live template. History rows
// are exact-match `versionRow(n)` — deliberately not a prefix, because the
// Load button beside each row is `label-version-load-n` and would otherwise
// match too.
export const labelDesigner = {
  name: "[data-testid='label-name']",
  width: "[data-testid='label-width']",
  height: "[data-testid='label-height']",
  saveDraft: "[data-testid='label-save-draft']",
  publish: "[data-testid='label-publish']",
  tabDesign: "[data-testid='label-tab-design']",
  tabPreview: "[data-testid='label-tab-preview']",
  tabHistory: "[data-testid='label-tab-history']",
  palette: "[data-testid='pdfme-field-palette']",
  canvas: "[data-testid='pdfme-designer']",
  canvasLoading: "[data-testid='pdfme-designer-loading']",
  addField: (key: string) => `[data-testid='pdfme-add-field-${key}']`,
  addStaticText: "[data-testid='pdfme-add-static-text']",
  addQr: "[data-testid='pdfme-add-qrcode']",
  previewRenderer: "[data-testid='label-preview']",
  versionRow: (version: number) => `[data-testid='label-version-${version}']`,
  loadVersion: (version: number) =>
    `[data-testid='label-version-load-${version}']`,
}

// ─── Order Form ──────────────────────────────────────────────────────────────
export const orderForm = {
  card: "[data-testid='parcel-card']",
  pickupLocation: "[data-testid='pickup-location']",
  recipientName: "[data-testid='recipient-name']",
  recipientPhone: "[data-testid='recipient-phone']",
  deliveryCity: "[data-testid='delivery-city']",
  deliveryAddress: "[data-testid='delivery-address']",
  parcelWeight: "[data-testid='parcel-weight']",
  itemType: "[data-testid='parcel-item-type']",
  productCost: "[data-testid='product-cost']",
  submitOrder: "[data-testid='submit-order']",
  // 1-based: `removeParcel(1)` is the first card, matching its "Parcel 1"
  // heading and its aria-label.
  // Shown instead of a delivery charge when the lane has no configured rate.
}

// ─── Merchants ───────────────────────────────────────────────────────────────
export const merchants = {
  table: "[data-testid='table-dashboard-merchants']",
  firstRow: "[data-testid^='row-dashboard-merchants-']",
  // No `approveButton` here. It used to be, but the merchants list has no
  // approve action: approving a merchant happens through
  // `/api/merchants/[id]/approve`, which no screen calls — and
  // `merchants.spec.tsx` asserts outright that no inline "Approve" button
  // renders for a PENDING merchant. Keeping the selector would advertise an
  // affordance that the UI deliberately does not have.
}

// ─── Riders ──────────────────────────────────────────────────────────────────
export const riders = {
  // The DataTable derives these from `id="dashboard-riders"` and
  // `getRowKey={(r) => r.id}`: the table is `table-<id>` and each `<tr>` is
  // `row-<id>-<rowKey>`. Both values were previously hardcoded to
  // `riders-table` / `rider-row-<id>`, which exist nowhere in `src/` — a
  // selector nothing can ever satisfy.
  table: "[data-testid='table-dashboard-riders']",
  row: (id: string) => `[data-testid='row-dashboard-riders-${id}']`,
  search: "[data-testid='table-search-dashboard-riders']",
  // Vehicle: type + registration number, set by an admin. Displayed on the list
  // and in the assign-rider dialogs so an admin can see who can take what.
  // `vehicleCell` repeats per row — always scope it inside `row(id)`.
  vehicleCell: "[data-testid='rider-vehicle-cell']",
  detailVehicle: "[data-testid='rider-detail-vehicle']",
}

// ─── Sign-out confirmation ───────────────────────────────────────────────────
// These are `ConfirmDialog`'s generic ids, so they address the sign-out
// confirmation only while it is the sole open dialog — true here, since
// sign-out is the one confirm flow reachable without first opening another.
export const signOut = {
  dialog: "[data-testid='confirm-dialog']",
  confirm: "[data-testid='confirm-button']",
  cancel: "[data-testid='cancel-button']", // also keeps the session alive
}

// ─── Users (admin user management) ──────────────────────────────────────────
export const users = {
  table: "[data-testid='users-table']",
  search: "[data-testid='table-search-users']",
  // Per-row scoping: one actions trigger per row, matched by prefix so a
  // narrowed search still leaves exactly one match.
  actions: "[data-testid^='users-actions-']",
  resetOpen: "[data-testid='users-reset-open']",
  resetPassword: "[data-testid='users-reset-password']",
  resetConfirm: "[data-testid='users-reset-confirm']",
  resetSubmit: "[data-testid='users-reset-submit']",
  banOpen: "[data-testid='users-ban-open']",
  banReason: "[data-testid='users-ban-reason']",
  banSubmit: "[data-testid='users-ban-submit']",
  unban: "[data-testid='users-unban']",
}

// ─── Warehouse ───────────────────────────────────────────────────────────────
export const warehouse = {
  // `DataTable` derives its testid from the table's `id` prop as `table-<id>`, so
  // these carry the prefix rather than repeating the id verbatim.
  exceptionsTable: "[data-testid='table-warehouse-exceptions']",
  settleButton: "[data-testid='settle-cod']",
}

// ─── Ongoing board (warehouse kanban) ────────────────────────────────────────
// The board has no table and no selection: a card's column is derived from its
// state, and the one bulk action it has (auto-assign) acts on everything sitting
// in the warehouse. Column and card ids are suffixed, so every assertion is a
// prefix match refined by the concrete status or rider the spec cares about.
export const ongoing = {
  board: "[data-testid='kanban-board']",
  groupByRiders: "[data-testid='kanban-groupby-riders']",
  columnPrefix: "[data-testid^='kanban-column-']",
  /** A lane by id — a status in the status view, a rider id or `UNASSIGNED`. */
  column: (id: string) => `[data-testid='kanban-column-${id}']`,
  /** The five status lanes, as one selector, for "did every lane render?". */
  statusColumnPrefix:
    "[data-testid^='kanban-column-APPROVED']," +
    "[data-testid^='kanban-column-PICKED_UP']," +
    "[data-testid^='kanban-column-IN_WAREHOUSE']," +
    "[data-testid^='kanban-column-IN_TRANSIT']," +
    "[data-testid^='kanban-column-OUT_FOR_DELIVERY']",
  unassignedColumn: "[data-testid='kanban-column-UNASSIGNED']",
  // The In-warehouse lane specifically. Auto-assign plans over exactly this set,
  // so a spec comparing a plan's totals to the board has to read this count and
  // not the first column's.
  heldColumn: "[data-testid='kanban-column-IN_WAREHOUSE']",
  heldColumnCount: "[data-testid='kanban-count-IN_WAREHOUSE']",
  // Deliberately `kanban-` and not `kanban-card-`: the card's details trigger is
  // `kanban-open-<id>`, so a `kanban-card-` prefix matches the card wrapper and
  // nothing inside it. Had the trigger been `kanban-card-open-<id>` every card
  // would have counted twice and "each parcel appears exactly once" — the
  // property the rider grouping exists to guarantee — would have gone unasserted.
  cardPrefix: "[data-testid^='kanban-card-']",
  cardOpenPrefix: "[data-testid^='kanban-open-']",
  dispatchPrefix: "[data-testid^='kanban-dispatch-']",
  // A selector that must never match anything. Cancel lives on the approval
  // queue and in the admin portal; putting it on a board card would undo the
  // PENDING-only approval split.
  cancelPrefix: "[data-testid^='kanban-cancel-']",
  // Distinct from `empty`: there ARE parcels, the filter just hides all of them.
  noMatches: "[data-testid='kanban-no-matches']",
  // Order-id box plus the three dropdowns. `…-option-<id>` addresses one entry
  // in an open dropdown; the trigger itself is the filter, not an option.
  query: "[data-testid='kanban-filter-query']",
  pickupRiderFilter: "[data-testid='kanban-filter-pickup-rider']",
  deliveryRiderFilter: "[data-testid='kanban-filter-delivery-rider']",
  /**
   * A field's visible label, addressed by the control it points at rather than
   * by its text: `label[for=…]` asserts the wiring itself, so a label that is
   * merely adjacent to the input (present, but announced by nobody) fails.
   */
  labelFor: (controlTestId: string) => `label[for='${controlTestId}']`,
  /** The whole filter toolbar, for measuring its layout. */
  filters: "[data-testid='kanban-filters']",
  /** Every field in the bar, as one selector, for "are these equal width?". */
  fieldPrefix:
    "[data-testid='kanban-filter-query']," +
    "[data-testid='kanban-filter-pickup-rider']," +
    "[data-testid='kanban-filter-delivery-rider']," +
    "[data-testid='kanban-filter-pickup-city']," +
    "[data-testid='kanban-filter-delivery-city']",
  pickupCityFilter: "[data-testid='kanban-filter-pickup-city']",
  deliveryCityFilter: "[data-testid='kanban-filter-delivery-city']",
  // Real options, by prefix: the synthetic "All …" entry carries no id, so a
  // prefix locator counts only genuine riders/cities. Addressed this way rather
  // than `getByRole("option")` — options are taggable, so the taggable path wins.
  pickupRiderOptionPrefix:
    "[data-testid^='kanban-filter-pickup-rider-option-']",
  deliveryRiderOptionPrefix:
    "[data-testid^='kanban-filter-delivery-rider-option-']",
  pickupCityOptionPrefix: "[data-testid^='kanban-filter-pickup-city-option-']",
  deliveryCityOptionPrefix:
    "[data-testid^='kanban-filter-delivery-city-option-']",
  filterClear: "[data-testid='kanban-filter-clear']",
  // The board's only toolbar-level action; opens the shared auto-assign dialog
  // over every IN_WAREHOUSE card.
  autoAssign: "[data-testid='bulk-auto-assign']",
  details: "[data-testid='order-details-drawer']",
}

// ─── Rider pickup queue ──────────────────────────────────────────────────────
// The two-stage pickup: APPROVED offers "Out for pickup", OUT_FOR_PICKUP offers
// "Picked up". Addressed by order id, so a spec can assert that one parcel is
// in exactly one of the two states rather than "some button exists".
export const riderPickup = {
  startPickup: (id: string) => `[data-testid='rider-start-pickup-${id}']`,
  pickedUp: (id: string) => `[data-testid='rider-picked-up-${id}']`,
  confirmStart: "[data-testid='out-for-pickup-confirm']",
}

// ─── Expected delivery (promise + admin override) ─────────────────────────────
export const deliveryPromise = {
  // The tracking page's read of the promise: a label/value row, so it carries a
  // testid rather than a spec matching on its label text.
  trackExpectedBy: "[data-testid='track-expected-by']",
  trackOutcome: "[data-testid='track-outcome']",
  // The override control, its date input, and the confirm button.
  setExpectedDate: "[data-testid='set-expected-delivery-open']",
  dateInput: "[data-testid='expected-delivery-date']",
  confirm: "[data-testid='set-expected-delivery-confirm']",
}

// ─── Completed orders (warehouse) ────────────────────────────────────────────
// Read-only, so the only things worth addressing are the tabs and the table.
export const completed = {
  table: "[data-testid='table-warehouse-completed']",
  tabAll: "[data-testid='completed-tab-ALL']",
  tabDelivered: "[data-testid='completed-tab-DELIVERED']",
  tabCancelled: "[data-testid='completed-tab-CANCELLED']",
  tabReturned: "[data-testid='completed-tab-RETURNED']",
}

// ─── Auto-assign (warehouse board) ───────────────────────────────────────────
// The dialog previews a proposal; the confirm button dispatches it. Everything
// asserted here is a state the dialog can be in, because "the dialog opened" on
// its own says nothing about whether it produced a plan. The dialog frame itself
// is the shared `dialog.formDialog`.
export const autoAssign = {
  error: "[data-testid='auto-assign-error']",
  empty: "[data-testid='auto-assign-empty']",
  confirm: "[data-testid='auto-assign-confirm']",
  // The per-rider blocks. The `:not` matters: the parcel tally inside each block
  // shares the prefix, so a bare prefix match counts one block as two and a
  // "did this spread across more than one rider?" assertion passes on a plan that
  // gave everything to a single rider.
  riderBlockPrefix:
    "[data-testid^='auto-assign-rider-']:not([data-testid$='-count'])",
  // The parcel tally each rider's block ends with. Tagged so a spec can add the
  // tallies up instead of reading them out of the badge's wording.
  riderCountPrefix:
    "[data-testid^='auto-assign-rider-'][data-testid$='-count']",
}

// ─── Rider cash holdings (warehouse) ─────────────────────────────────────────
// The page is reached by URL, not by nav: `/warehouse/rider-cash` has no inbound
// link, so the spec navigates to it directly. The three totals and the table
// states are tagged individually because the assertions need to tell "still
// loading" apart from "loaded but empty" — which is the whole regression here.
export const riderCash = {
  page: "[data-testid='rider-cash-page']",
  navLink: "[data-testid='nav-/warehouse/rider-cash']",
  totalOnHand: "[data-testid='rider-cash-total-on-hand']",
  totalCollected: "[data-testid='rider-cash-total-collected']",
  totalSubmitted: "[data-testid='rider-cash-total-submitted']",
  loading: "[data-testid='rider-cash-loading']",
  empty: "[data-testid='rider-cash-empty']",
  error: "[data-testid='rider-cash-error']",
  row: (riderId: string) => `[data-testid='rider-cash-row-${riderId}']`,
  table: "[data-testid='rider-cash-table']",
}

// ─── Rider Pages ─────────────────────────────────────────────────────────────
export const rider = {
  // The suggested run order above the delivery queue. Stop rows are keyed by
  // their sequence number, because the sequence is the thing under test — a
  // row selected by parcel code would pass even if the order were scrambled.
  runSheet: "[data-testid='run-sheet']",
  runSheetStopPrefix: "[data-testid^='run-sheet-stop-']",
  // Destination per stop (city and, when the order carries one, its zone).
  // Tagged separately from the row so a spec can read every stop's destination
  // in order without depending on the row's internal markup.
  runSheetDestinationPrefix: "[data-testid^='run-sheet-destination-']",
  // Zone per stop, tagged apart from the destination so a spec can read the
  // zone sequence without splitting the rendered line on "·". This is what
  // makes the grouping assertable: the run sheet's whole claim is that a zone
  // is served in one run, which only a zone-by-zone reading can check.
  runSheetZonePrefix: "[data-testid^='run-sheet-zone-']",
  // Parcel code per stop. Tagged so a spec can compare the rendered order
  // against the API's own sequence — numbering the rows 1..N proves only that
  // the card counts, not that it kept the order it was given.
  runSheetParcelPrefix: "[data-testid^='run-sheet-parcel-']",
}

// ─── Payouts ─────────────────────────────────────────────────────────────────
export const payouts = {
  // Both point at the same ConfirmDialog, whose confirm button now carries a
  // per-action id — see `payouts-client`. `mark-paid` never existed in `src`;
  // the real value is `mark-paid-payout`.
}

// ─── Rider parcel column (weight) ────────────────────────────────────────────
// The DataTable tags each `<tr>` as `row-<tableId>-<rowKey>`, and the rider
// queues key on the order id, so a single order's row is addressable without
// matching on its contents. Row-level on purpose: these tests need "this
// parcel's row shows the weight and does not leak the contents", which the row
// text answers without a cell-level hook that would exist only for them.
export const riderParcel = {
  pickupRow: (orderId: string) => `[data-testid='row-rider-pickup-${orderId}']`,
}

// ─── Rider applications (admin review queue) ─────────────────────────────────
export const riderApplications = {
  search: "[data-testid='table-search-dashboard-rider-applications']",
  viewButton: (id: string) => `[data-testid='rider-app-view-${id}']`,
  openApprove: "[data-testid='rider-app-approve']",
  confirmApprove: "[data-testid='rider-app-confirm-approve']",
  vehicleValue: "[data-testid='approve-vehicle-type']",
  vehiclePlate: "[data-testid='approve-vehicle-plate']",
  submittedNote: "[data-testid='approve-vehicle-submitted']",
}

// ─── Rider registration form (public /apply/rider) ──────────────────────────
export const riderApplyForm = {
  vehicleType: "[data-testid='rider-apply-vehicle-type']",
  vehicleOption: (type: string) =>
    `[data-testid='rider-apply-vehicle-option-${type}']`,
  vehiclePlate: "[data-testid='rider-apply-vehicle-plate']",
}

// ─── Zone Pricing ────────────────────────────────────────────────────────────
export const zones = {
  // The admin zone-pricing page shows the same rates two ways. List is the
  // default because it is the only one carrying the row actions; the matrix is
  // a read-only coverage audit. Both triggers stay on screen in both views, so
  // a test can always get back to the list.
  viewList: "[data-testid='zone-pricing-view-list']",
  viewMatrix: "[data-testid='zone-pricing-view-matrix']",
  listView: "[data-testid='zone-pricing-list-view']",
}

// ─── Delivery Zones ──────────────────────────────────────────────────────────
// The admin management page at /dashboard/delivery-zones. The status tabs and
// the DataTable search input are the two filters.
export const deliveryZones = {
  tabAll: "[data-testid='delivery-zones-tab-ALL']",
  tabActive: "[data-testid='delivery-zones-tab-ACTIVE']",
  tabInactive: "[data-testid='delivery-zones-tab-INACTIVE']",
  search: "[data-testid='table-search-delivery-zones']",
}

// ─── Delivery Cities ─────────────────────────────────────────────────────────
// `table`/`addButton` are the admin management page; the `merchant*` selectors
// are the read-only merchant view at /merchant/delivery-cities.
export const deliveryCities = {
  addButton: "[data-testid='add-city']",
  tabAll: "[data-testid='delivery-cities-tab-ALL']",
  tabActive: "[data-testid='delivery-cities-tab-ACTIVE']",
  tabInactive: "[data-testid='delivery-cities-tab-INACTIVE']",
  search: "[data-testid='table-search-delivery-cities']",
  merchantPage: "[data-testid='delivery-cities-page']",
  merchantSearch: "[data-testid='delivery-city-search']",
  merchantZone: (zoneId: string) => `[data-testid='delivery-zone-${zoneId}']`,
  merchantCity: (cityId: string) => `[data-testid='delivery-city-${cityId}']`,
  merchantEmpty: "[data-testid='delivery-cities-empty']",
}

// ─── Balance ─────────────────────────────────────────────────────────────────
export const balance = {}

// ─── Account email change (5.3) ──────────────────────────────────────────────
export const email = {
  current: "[data-testid='email-change-current']",
  input: "[data-testid='email-change-input']",
  submit: "[data-testid='email-change-submit']",
}

// ─── Settings ────────────────────────────────────────────────────────────────
export const settings = {
  cancellationPolicyCard: "[data-testid='cancellation-policy-card']",
  refundOnCancel: "[data-testid='refund-on-cancel-switch']",
  savePolicy: "[data-testid='save-policy']",
}

// --- Public tracking (token-gated receiver note) ---
export const tracking = {
  noteInput: "[data-testid='receiver-note-input']",
  noteLocked: "[data-testid='receiver-note-locked']",
}

// --- Merchants (moderators) + staff activation (1201/1202) ---
export const moderators = {
  card: "[data-testid='moderators-card']",
  add: "[data-testid='add-moderator']",
  nameInput: "[data-testid='moderator-name']",
  emailInput: "[data-testid='moderator-email']",
  passwordInput: "[data-testid='moderator-password']",
  createSubmit: "[data-testid='create-moderator-submit']",
  grant: (slug: string) => `[data-testid='grant-${slug}']`,
  row: "[data-testid='moderator-row']",
  deactivate: "[data-testid='deactivate-moderator']",
  quotaFull: "[data-testid='quota-full']",
}

export const activation = {
  password: "[data-testid='activate-password']",
  confirm: "[data-testid='activate-confirm']",
  submit: "[data-testid='activate-submit']",
}

// Post-activation welcome page (/activated) — the sign-out confirmation that
// replaced the old "activate → /login?success=activated" redirect.
export const activated = {
  title: "[data-testid='activated-title']",
  message: "[data-testid='activated-message']",
}

export const merchantQuota = {
  input: "[data-testid='moderator-quota-input']",
  save: "[data-testid='moderator-quota-save']",
}

export const team = {
  pendingBadge: "[data-testid='team-status-pending']",
  resend: "[data-testid='team-resend-activation']",
  createOpen: "[data-testid='create-account-open']",
  createSubmit: "[data-testid='create-account-submit']",
  nameInput: "[data-testid='team-name']",
  emailInput: "[data-testid='team-email']",
  phoneInput: "[data-testid='team-phone']",
  passwordInput: "[data-testid='team-password']",
}

// ─── Merchant identity in chrome ─────────────────────────────────────────────
// What replaces the branding selectors: the merchant's *name* is shown in the
// sidebar and on the public tracking header. There is no colour, logo or
// hide-platform toggle any more (those columns were dropped), so only the
// two identity markers remain.
export const identity = {
  trackBrand: "[data-testid='track-brand']",
  sidebarBrand: "[data-testid='sidebar-brand']",
}

// ─── Audit logs ──────────────────────────────────────────────────────────────
export const auditLogs = {}

// ─── Dialogs ─────────────────────────────────────────────────────────────────
export const dialog = {
  confirm: "[data-testid='confirm-dialog']",
  confirmButton: "[data-testid='confirm-button']",
  formDialog: "[data-testid='form-dialog']",
  // `FormDialog`'s Cancel is shared by ~24 call sites; it carries the default
  // `form-dialog-cancel` because callers can override submit but not cancel.
}

// ─── Pagination ──────────────────────────────────────────────────────────────
// Tagged per table id: these four controls sit under every list
// page and carried no testid at all, which is why server-side pagination — the
// most-used interaction in the app — had zero E2E coverage.
export const pagination = {
  prev: (tableId: string) => `[data-testid='table-prev-${tableId}']`,
  next: (tableId: string) => `[data-testid='table-next-${tableId}']`,
  /** "Page X of Y" — the only thing that proves a page change landed. */
  pageLabel: (tableId: string) => `[data-testid='table-page-label-${tableId}']`,
}

// ─── Shared ──────────────────────────────────────────────────────────────────
export const shared = {}

// ─── Help center ─────────────────────────────────────────────────────────────
export const help = {
  guideLink: (slug: string) => `[data-testid='help-guide-${slug}']`,
}

// ─── Support tickets ─────────────────────────────────────────────────────────
export const support = {
  rowActions: "[data-testid='support-row-actions']",
  status: "[data-testid='support-status']",
  rowByTableId: (tableId: string) => `[data-testid^='row-${tableId}-']`,
}

// ─── Packages (admin catalogue + purchase request queue) ─────────────────────
export const packages = {
  // Admin: /dashboard/packages
  table: "[data-testid='table-dashboard-packages']",
  row: (id: string) => `[data-testid='row-dashboard-packages-${id}']`,
  // Row ids come from the API, so specs find the row by name via this prefix
  // then read its testid for the exact per-id selectors below.
  rowPrefix: "[data-testid^='row-dashboard-packages-']",
  rowIdPrefix: "row-dashboard-packages-",
  createButton: "[data-testid='packages-create']",
  nameInput: "[data-testid='package-name-input']",
  descriptionInput: "[data-testid='package-description-input']",
  priceInput: "[data-testid='package-price-input']",
  saveButton: "[data-testid='package-save']",
  activeSwitchFor: (id: string) => `[data-testid='package-active-${id}']`,
  actionsButton: (id: string) => `[data-testid='package-actions-${id}']`,
  editItem: (id: string) => `[data-testid='package-edit-${id}']`,
  addTierItem: (id: string) => `[data-testid='package-add-tier-${id}']`,
  deleteItem: (id: string) => `[data-testid='package-delete-${id}']`,

  // Tier dialog
  tierOrderCountInput: "[data-testid='tier-order-count-input']",
  tierRuleTypeSelect: "[data-testid='tier-rule-type-select']",
  tierRuleOption: (type: string) => `[data-testid='tier-rule-${type}']`,
  tierRuleValueInput: "[data-testid='tier-rule-value-input']",
  tierSave: "[data-testid='tier-save']",

  // Purchase request queue (same page, below the catalogue)
  requestsTable: "[data-testid='table-dashboard-package-requests']",
  requestRow: (id: string) =>
    `[data-testid='row-dashboard-package-requests-${id}']`,
  // Row ids are minted by the API, so specs locate a row by merchant name
  // scoped to this tagged prefix (never a page-wide text selector).
  requestRowPrefix: "[data-testid^='row-dashboard-package-requests-']",
  requestRowIdPrefix: "row-dashboard-package-requests-",
  requestApprove: (id: string) => `[data-testid='request-approve-${id}']`,
  requestApproveConfirm: "[data-testid='request-approve-confirm']",
  requestReject: (id: string) => `[data-testid='request-reject-${id}']`,
  requestRejectReason: "[data-testid='request-reject-reason-input']",
  requestRejectConfirm: "[data-testid='request-reject-confirm']",

  // Merchant: /merchant/pricing
  activePackage: "[data-testid='merchant-active-package']",
  ordersUsed: "[data-testid='merchant-package-orders-used']",
  progress: "[data-testid='merchant-package-progress']",
  pendingRequest: "[data-testid='merchant-package-pending']",
  rejectedRequest: "[data-testid='merchant-package-rejected']",
  catalogueCard: (id: string) => `[data-testid='package-card-${id}']`,
  requestButton: (id: string) => `[data-testid='package-request-${id}']`,
  requestNoteInput: "[data-testid='package-request-note-input']",
  requestSubmit: "[data-testid='package-request-submit']",
}
