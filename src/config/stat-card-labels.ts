// Centralised labels and hints for every StatCard across the platform.
// Grouped by area → page so every card string lives in one predictable place.

export const statCardLabels = {
  dashboard: {
    superAdmin: {
      warehouseAdmins: { label: "Warehouse Admins" },
      activeWarehouses: { label: "Active warehouses" },
      pendingMerchants: {
        label: "Waiting merchants",
        hint: "Waiting to be approved",
      },
      pendingRiders: {
        label: "Waiting riders",
        hint: "Rider applications pending",
      },
    },
    orders: {
      pendingApproval: { label: "Waiting for approval" },
      approved: { label: "Approved" },
      inProgress: { label: "In progress" },
      totalOrders: { label: "Total orders" },
    },
    riders: {
      totalRiders: { label: "Total riders" },
      active: { label: "Active" },
      deliveryRiders: { label: "Delivery riders" },
      pickupRiders: { label: "Pickup riders" },
    },
    riderApplications: {
      totalApplications: { label: "Total applications" },
      pending: { label: "Pending" },
      active: { label: "Active" },
      rejected: { label: "Rejected" },
    },
    merchants: {
      totalMerchants: { label: "Total merchants" },
      active: { label: "Active" },
      suspended: { label: "Suspended" },
    },
    payouts: {
      pendingReview: { label: "Waiting for review" },
      approvedAwaitingPayment: { label: "Approved" },
      paid: { label: "Paid" },
      rejected: { label: "Rejected" },
    },
  },
  warehouse: {
    // Every key in this file is referenced — dead groups and tiles are pruned
    // rather than kept "in case". `intake` and `dispatch` went with their
    // pages; the orphaned `orders`/`exceptions` tiles (`delivered`, `returned`,
    // `totalExceptions`, …) went when the overview became stats-only.
    orders: {
      pendingApproval: { label: "Waiting for approval" },
    },
    exceptions: {
      needsAction: { label: "Needs attention" },
    },
    codSettlement: {
      awaitingSettlement: { label: "Waiting to be settled" },
      cashToCollect: { label: "Cash to collect" },
      settledCash: { label: "Cash settled" },
    },
    riders: {
      totalRiders: { label: "Total riders" },
      active: { label: "Active" },
      deliveryRiders: { label: "Delivery riders" },
      pickupRiders: { label: "Pickup riders" },
    },
  },
  rider: {
    todo: {
      cashToSubmit: { label: "Cash to submit" },
    },
  },
} as const
