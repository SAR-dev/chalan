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
  logout: "[data-testid='logout']",
  accountSecurityTab: "[data-testid='account-tab-security']",
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

// ─── Onboarding ──────────────────────────────────────────────────────────────
export const onboarding = {
  skip: "[data-testid='onboarding-skip']",
}

// ─── Two-factor authentication (H4) ─────────────────────────────────────────
export const twoFactor = {
  status: "[data-testid='two-factor-status']",
  policy: "[data-testid='two-factor-policy']",
  enableButton: "[data-testid='two-factor-enable']",
  passwordInput: "[data-testid='two-factor-password-input']",
  passwordSubmit: "[data-testid='two-factor-password-submit']",
  passwordCancel: "[data-testid='two-factor-password-cancel']",
  secret: "[data-testid='two-factor-secret']",
  secretCopy: "[data-testid='two-factor-secret-copy']",
  qr: "[data-testid='two-factor-qr']",
  codeInput: "[data-testid='two-factor-code-input']",
  verifySubmit: "[data-testid='two-factor-verify-submit']",
  verifyCancel: "[data-testid='two-factor-verify-cancel']",
  recoveryCodes: "[data-testid='two-factor-recovery-codes']",
  recoveryCopy: "[data-testid='two-factor-recovery-copy']",
  recoveryDownload: "[data-testid='two-factor-recovery-download']",
  recoveryDone: "[data-testid='two-factor-recovery-done']",
  regenerateButton: "[data-testid='two-factor-regenerate']",
  disableButton: "[data-testid='two-factor-disable']",
  disableInput: "[data-testid='two-factor-disable-input']",
  disableSubmit: "[data-testid='two-factor-disable-submit']",
  disableCancel: "[data-testid='two-factor-disable-cancel']",
  loginInput: "[data-testid='two-factor-login-input']",
  loginSubmit: "[data-testid='two-factor-login-submit']",
  loginRecoveryLink: "[data-testid='two-factor-login-recovery']",
  loginBackLink: "[data-testid='two-factor-login-back']",
}

// ─── Navigation ──────────────────────────────────────────────────────────────
export const nav = {
  sidebar: "[data-testid='sidebar']",
  sidebarLink: (label: string) =>
    `[data-testid='sidebar'] a:has-text("${label}")`,
  mobileMenu: "[data-testid='mobile-menu']",
  userMenu: "[data-testid='user-menu']",
}

// ─── Public pricing (city-to-city rate card) ─────────────────────────────────
export const pricing = {
  pageHeading: "[data-testid='pricing-heading']",
  table: "[data-testid='pricing-table']",
  cancellationTable: "[data-testid='cancellation-fee-table']",
  navLink: "[data-testid='nav-pricing']",
  rateCardLink: "[data-testid='rate-card-link']",
  // Zone × zone rate matrix. Rows are pickup zones, columns delivery zones;
  // both directions are priced separately, so cells are addressed by lane.
  zoneRateCard: "[data-testid='merchant-zone-rate-card']",
  zoneMatrix: "[data-testid='zone-rate-matrix']",
  zoneMatrixCell: (fromZoneId: string, toZoneId: string) =>
    `[data-testid='zone-matrix-cell'][data-lane='${fromZoneId}:${toZoneId}']`,
  zoneMatrixUnpriced: "[data-testid='zone-matrix-unpriced']",
  zoneMatrixDetail: "[data-testid='zone-matrix-detail']",
  zoneMatrixDetailLane: "[data-testid='zone-matrix-detail-lane']",
  zoneMatrixEmpty: "[data-testid='zone-rate-matrix-empty']",
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const dashboard = {
  statCard: (label: string) => `[data-testid='stat-card-${label}']`,
  overview: "[data-testid='dashboard-overview']",
  // Zone-pricing coverage: lanes with no configured rate.
  pricingCoverageCard: "[data-testid='pricing-coverage-card']",
  pricingCoverageMissing: "[data-testid='pricing-coverage-missing']",
  pricingCoverageClear: "[data-testid='pricing-coverage-clear']",
  pricingCoverageEmpty: "[data-testid='pricing-coverage-empty']",
  pricingCoverageOverflow: "[data-testid='pricing-coverage-overflow']",
}

// ─── Orders ──────────────────────────────────────────────────────────────────
export const orders = {
  table: "[data-testid='table-dashboard-orders']",
  merchantTable: "[data-testid='table-merchant-orders']",
  row: (id: string) => `[data-testid='order-row-${id}']`,
  rowPrefix: "[data-testid^='order-row-']",
  createButton: "[data-testid='create-order']",
  approveButton: "[data-testid='approve-order']",
  // The order detail page (`/merchant/orders/<code>`) owns the cancel flow.
  cancelOrderButton: "[data-testid='cancel-order']",
  cancelOrderSubmit: "[data-testid='cancel-order-submit']",
  cancelReasonInput: "[data-testid='cancel-reason-input']",
  bulkApprove: "[data-testid='bulk-approve']",
  bulkCancel: "[data-testid='bulk-cancel']",
  selectAll: "[data-testid='select-all']",
  selectRow: (id: string) => `[data-testid='select-${id}']`,
  searchInput: "[data-testid='orders-search']",
  merchantOrdersSearch: "[data-testid='table-search-merchant-orders']",
  tab: (name: string) => `[data-testid='tab-${name}']`,
  // CSV bulk import (§5 of docs/CSV-IMPORT.md)
  bulkImportOpen: "[data-testid='bulk-import-open']",
  bulkImportTemplate: "[data-testid='bulk-import-template']",
  bulkImportFile: "[data-testid='bulk-import-file']",
  bulkImportLoading: "[data-testid='bulk-import-loading']",
  bulkImportSummary: "[data-testid='bulk-import-summary']",
  bulkImportPreview: "[data-testid='bulk-import-preview']",
  bulkImportRow: (line: number) => `[data-testid='bulk-import-row-${line}']`,
  bulkImportFilterAll: "[data-testid='bulk-import-filter-all']",
  bulkImportFilterErrors: "[data-testid='bulk-import-filter-errors']",
  bulkImportJumpError: "[data-testid='bulk-import-jump-error']",
  bulkImportErrorExport: "[data-testid='bulk-import-error-export']",
  bulkImportConfirm: "[data-testid='bulk-import-confirm']",
  bulkImportCancel: "[data-testid='bulk-import-cancel']",
}

// ─── Order Form ──────────────────────────────────────────────────────────────
export const orderForm = {
  card: "[data-testid='parcel-card']",
  pickupLocation: "[data-testid='pickup-location']",
  recipientName: "[data-testid='recipient-name']",
  recipientPhone: "[data-testid='recipient-phone']",
  deliveryCity: "[data-testid='delivery-city']",
  deliveryAddress: "[data-testid='delivery-address']",
  deliveryMap: "[data-testid='delivery-map']",
  parcelWeight: "[data-testid='parcel-weight']",
  productCost: "[data-testid='product-cost']",
  submitOrder: "[data-testid='submit-order']",
  addParcel: "[data-testid='add-parcel']",
  removeParcel: (index: number) => `[data-testid='remove-parcel-${index}']`,
  // Shown instead of a delivery charge when the lane has no configured rate.
  pricingUnavailable: "[data-testid='parcel-pricing-unavailable']",
}

// ─── Merchants ───────────────────────────────────────────────────────────────
export const merchants = {
  table: "[data-testid='table-dashboard-merchants']",
  row: (id: string) => `[data-testid='row-dashboard-merchants-${id}']`,
  firstRow: "[data-testid^='row-dashboard-merchants-']",
  approveButton: "[data-testid='approve-merchant']",
  suspendButton: "[data-testid='suspend-merchant']",
  reactivateButton: "[data-testid='reactivate-merchant']",
}

// ─── Riders ──────────────────────────────────────────────────────────────────
export const riders = {
  table: "[data-testid='riders-table']",
  row: (id: string) => `[data-testid='rider-row-${id}']`,
}

// ─── Users (admin user management) ──────────────────────────────────────────
export const users = {
  table: "[data-testid='users-table']",
  search: "[data-testid='table-search-users']",
  actions: "[data-testid='users-actions']",
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
  intakeTable: "[data-testid='warehouse-intake']",
  dispatchTable: "[data-testid='warehouse-dispatch']",
  exceptionsTable: "[data-testid='warehouse-exceptions']",
  settlementTable: "[data-testid='warehouse-settlement']",
  receiveButton: "[data-testid='receive-parcel']",
  dispatchButton: "[data-testid='dispatch-parcel']",
  settleButton: "[data-testid='settle-cod']",
  bulkSettle: "[data-testid='bulk-settle']",
}

// ─── Rider Pages ─────────────────────────────────────────────────────────────
export const rider = {
  dashboard: "[data-testid='rider-dashboard']",
  pickupQueue: "[data-testid='rider-pickup']",
  deliveryQueue: "[data-testid='rider-delivery']",
  pickedUpButton: "[data-testid='picked-up']",
  startDeliveryButton: "[data-testid='start-delivery']",
  recordDeliveryButton: "[data-testid='record-delivery']",
  cashToSubmit: "[data-testid='cash-to-submit']",
}

// ─── Payouts ─────────────────────────────────────────────────────────────────
export const payouts = {
  table: "[data-testid='payouts-table']",
  requestButton: "[data-testid='request-payout']",
  approveButton: "[data-testid='approve-payout']",
  rejectButton: "[data-testid='reject-payout']",
  markPaidButton: "[data-testid='mark-paid']",
}

// ─── Zone Pricing ────────────────────────────────────────────────────────────
export const zones = {
  table: "[data-testid='zones-table']",
  addButton: "[data-testid='add-zone']",
  pricingTable: "[data-testid='zone-pricing-table']",
  addPricingButton: "[data-testid='add-zone-pricing']",
}

// ─── Delivery Cities ─────────────────────────────────────────────────────────
// `table`/`addButton` are the admin management page; the `merchant*` selectors
// are the read-only merchant view at /merchant/delivery-cities.
export const deliveryCities = {
  table: "[data-testid='delivery-cities-table']",
  addButton: "[data-testid='add-city']",
  merchantPage: "[data-testid='delivery-cities-page']",
  merchantSearch: "[data-testid='delivery-city-search']",
  merchantZone: (zoneId: string) => `[data-testid='delivery-zone-${zoneId}']`,
  merchantZoneCount: (zoneId: string) =>
    `[data-testid='delivery-zone-count-${zoneId}']`,
  merchantCity: (cityId: string) => `[data-testid='delivery-city-${cityId}']`,
  merchantEmpty: "[data-testid='delivery-cities-empty']",
}

// ─── Balance ─────────────────────────────────────────────────────────────────
export const balance = {
  balancePage: "[data-testid='merchant-balance']",
  adjustButton: "[data-testid='adjust-balance']",
  confirmPayment: "[data-testid='confirm-payment']",
  rejectPayment: "[data-testid='reject-payment']",
}

// ─── Account email change (5.3) ──────────────────────────────────────────────
export const email = {
  current: "[data-testid='email-change-current']",
  input: "[data-testid='email-change-input']",
  submit: "[data-testid='email-change-submit']",
}

// ─── Settings ────────────────────────────────────────────────────────────────
export const settings = {
  mailConfigTable: "[data-testid='mail-config-table']",
  cancellationPolicyCard: "[data-testid='cancellation-policy-card']",
  refundOnCancel: "[data-testid='refund-on-cancel-switch']",
  savePolicy: "[data-testid='save-policy']",
}

// ─── Branding ────────────────────────────────────────────────────────────────
// --- Public tracking (P0.1 token-gated receiver note) ---
export const tracking = {
  noteInput: "[data-testid='receiver-note-input']",
  noteLocked: "[data-testid='receiver-note-locked']",
}

// --- Merchants (moderators) + staff activation (S41/S42) ---
export const moderators = {
  card: "[data-testid='moderators-card']",
  empty: "[data-testid='moderators-empty']",
  add: "[data-testid='add-moderator']",
  nameInput: "[data-testid='moderator-name']",
  emailInput: "[data-testid='moderator-email']",
  passwordInput: "[data-testid='moderator-password']",
  createSubmit: "[data-testid='create-moderator-submit']",
  grant: (slug: string) => `[data-testid='grant-${slug}']`,
  row: "[data-testid='moderator-row']",
  status: "[data-testid='moderator-status']",
  resend: "[data-testid='resend-activation']",
  deactivate: "[data-testid='deactivate-moderator']",
  reactivate: "[data-testid='reactivate-moderator']",
  edit: "[data-testid='edit-moderator']",
  saveAccess: "[data-testid='save-moderator-access']",
  quotaFull: "[data-testid='quota-full']",
}

export const activation = {
  password: "[data-testid='activate-password']",
  confirm: "[data-testid='activate-confirm']",
  submit: "[data-testid='activate-submit']",
  error: "[data-testid='activate-error']",
}

// Post-activation welcome page (/activated) — the sign-out confirmation that
// replaced the old "activate → /login?success=activated" redirect.
export const activated = {
  title: "[data-testid='activated-title']",
  message: "[data-testid='activated-message']",
  continue: "[data-testid='activated-continue']",
}

export const merchantQuota = {
  card: "[data-testid='moderator-quota-card']",
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
  warehouseSelect: "[data-testid='team-warehouse']",
}

export const branding = {
  section: "[data-testid='branding-section']",
  colorInput: "[data-testid='brand-color-input']",
  hideToggle: "[data-testid='hide-branding-toggle']",
  saveButton: "[data-testid='save-branding']",
  preview: "[data-testid='branding-preview']",
  previewButton: "[data-testid='preview-button']",
  previewChip: "[data-testid='preview-chip']",
  contrastWarning: "[data-testid='brand-contrast-warning']",
  trackBrand: "[data-testid='track-brand']",
  trackAccent: "[data-testid='track-accent']",
  sidebarBrand: "[data-testid='sidebar-brand']",
}

// ─── Audit logs ──────────────────────────────────────────────────────────────
export const auditLogs = {
  diff: "[data-testid='audit-diff']",
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────
export const dialog = {
  confirm: "[data-testid='confirm-dialog']",
  confirmButton: "[data-testid='confirm-button']",
  cancelButton: "[data-testid='cancel-button']",
  formDialog: "[data-testid='form-dialog']",
  closeButton: "[data-testid='dialog-close']",
}

// ─── Shared ──────────────────────────────────────────────────────────────────
export const shared = {
  loading: "[data-testid='loading']",
  emptyState: "[data-testid='empty-state']",
  toast: "[data-testid='toast']",
  searchInput: "[data-testid='search-input']",
  refreshButton: "[data-testid='refresh-button']",
  addButton: "[data-testid='add-button']",
  submitButton: "[data-testid='submit-button']",
  printButton: "[data-testid='print-button']",
}

// ─── Help center & FAQ ───────────────────────────────────────────────────────
export const help = {
  guideLink: (slug: string) => `[data-testid='help-guide-${slug}']`,
  faqLink: "[data-testid='help-faq-link']",
}

// ─── FAQ role tabs ───────────────────────────────────────────────────────────
export const faq = {
  tabs: "[data-testid='faq-tabs']",
  tab: (role: string) => `[data-testid='faq-tab-${role}']`,
  visibleSections: (role: string) => `[data-testid='faq-sections-${role}']`,
  section: (id: string) => `[data-testid='faq-section-${id}']`,
}

// ─── Support tickets ─────────────────────────────────────────────────────────
export const support = {
  table: "[data-testid='support-tickets']",
  row: "[data-testid='support-row']",
  rowActions: "[data-testid='support-row-actions']",
  status: "[data-testid='support-status']",
  rowByTableId: (tableId: string) => `[data-testid^='row-${tableId}-']`,
  newButton: "[data-testid='support-new']",
  subjectInput: "[data-testid='support-subject']",
  messageInput: "[data-testid='support-message']",
  submit: "[data-testid='support-submit']",
  replyOpen: "[data-testid='support-reply-open']",
  replyInput: "[data-testid='support-reply-input']",
  replySubmit: "[data-testid='support-reply-submit']",
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
  activeSwitch: "[data-testid='package-active-switch']",
  saveButton: "[data-testid='package-save']",
  activeSwitchFor: (id: string) => `[data-testid='package-active-${id}']`,
  actionsButton: (id: string) => `[data-testid='package-actions-${id}']`,
  editItem: (id: string) => `[data-testid='package-edit-${id}']`,
  addTierItem: (id: string) => `[data-testid='package-add-tier-${id}']`,
  deleteItem: (id: string) => `[data-testid='package-delete-${id}']`,
  tierLabel: (tierId: string) => `[data-testid='tier-edit-${tierId}']`,
  deleteTierItem: (tierId: string) =>
    `[data-testid='package-delete-tier-${tierId}']`,

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
  requestReject: (id: string) => `[data-testid='request-reject-${id}']`,
  requestRejectReason: "[data-testid='request-reject-reason-input']",
  requestRejectConfirm: "[data-testid='request-reject-confirm']",
  requestRejectCancel: "[data-testid='request-reject-cancel']",
  requestsTab: (tab: string) => `[data-testid='requests-tab-${tab}']`,

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
