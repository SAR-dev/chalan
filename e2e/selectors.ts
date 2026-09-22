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
  tab: (name: string) => `[data-testid='tab-${name}']`,
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

// ─── Warehouse ───────────────────────────────────────────────────────────────
export const warehouse = {
  intakeTable: "[data-testid='warehouse-intake']",
  dispatchTable: "[data-testid='warehouse-dispatch']",
  exceptionsTable: "[data-testid='warehouse-exceptions']",
  reconciliationTable: "[data-testid='warehouse-reconciliation']",
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

// ─── Settings ────────────────────────────────────────────────────────────────
export const settings = {
  pricingForm: "[data-testid='pricing-form']",
  mailConfigTable: "[data-testid='mail-config-table']",
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
