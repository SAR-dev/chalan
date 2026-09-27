/**
 * Centralized selectors for E2E tests.
 * Use data-testid attributes for stable, intent-revealing selectors.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth = {
  loginEmail: "[data-testid='login-email']",
  loginPassword: "[data-testid='login-password']",
  loginSubmit: "[data-testid='login-submit']",
  registerForm: "[data-testid='register-form']",
  logout: "[data-testid='logout']",
  accountSecurityTab: "[data-testid='account-tab-security']",
  accountTwoFactorTab: "[data-testid='account-tab-two-factor']",
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

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const dashboard = {
  statCard: (label: string) => `[data-testid='stat-card-${label}']`,
  overview: "[data-testid='dashboard-overview']",
}

// ─── Orders ──────────────────────────────────────────────────────────────────
export const orders = {
  table: "[data-testid='orders-table']",
  row: (id: string) => `[data-testid='order-row-${id}']`,
  createButton: "[data-testid='create-order']",
  approveButton: "[data-testid='approve-order']",
  cancelOrderButton: "[data-testid='cancel-order']",
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
  pickupLocation: "[data-testid='pickup-location']",
  recipientName: "[data-testid='recipient-name']",
  recipientPhone: "[data-testid='recipient-phone']",
  deliveryCity: "[data-testid='delivery-city']",
  deliveryAddress: "[data-testid='delivery-address']",
  parcelWeight: "[data-testid='parcel-weight']",
  productCost: "[data-testid='product-cost']",
  submitOrder: "[data-testid='submit-order']",
  addParcel: "[data-testid='add-parcel']",
  removeParcel: (index: number) => `[data-testid='remove-parcel-${index}']`,
}

// ─── Merchants ───────────────────────────────────────────────────────────────
export const merchants = {
  table: "[data-testid='merchants-table']",
  row: (id: string) => `[data-testid='merchant-row-${id}']`,
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
export const deliveryCities = {
  table: "[data-testid='delivery-cities-table']",
  addButton: "[data-testid='add-city']",
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
  pricingForm: "[data-testid='pricing-form']",
  mailConfigTable: "[data-testid='mail-config-table']",
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

export const merchantQuota = {
  card: "[data-testid='moderator-quota-card']",
  input: "[data-testid='moderator-quota-input']",
  save: "[data-testid='moderator-quota-save']",
}

export const team = {
  pendingBadge: "[data-testid='team-status-pending']",
  resend: "[data-testid='team-resend-activation']",
  createSubmit: "[data-testid='create-account-submit']",
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
  trackBrandLogo: "[data-testid='track-brand-logo']",
  trackAccent: "[data-testid='track-accent']",
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

// ─── Support tickets ─────────────────────────────────────────────────────────
export const support = {
  table: "[data-testid='support-tickets']",
  row: "[data-testid='support-row']",
  rowByTableId: (tableId: string) => `[data-testid^='row-${tableId}-']`,
  newButton: "[data-testid='support-new']",
  subjectInput: "[data-testid='support-subject']",
  messageInput: "[data-testid='support-message']",
  submit: "[data-testid='support-submit']",
  replyOpen: "[data-testid='support-reply-open']",
  replyInput: "[data-testid='support-reply-input']",
  replySubmit: "[data-testid='support-reply-submit']",
}
