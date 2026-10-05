// Centralised labels and hints for every StatCard across the platform.
// Grouped by area → page so every card string lives in one predictable place.

export const statCardLabels = {
  dashboard: {
    admin: {
      pendingApproval: {
        label: "Waiting for approval",
        hint: "Waiting for your review",
      },
      inProgress: { label: "In progress" },
      activeRiders: { label: "Active riders" },
      pendingMerchants: {
        label: "Waiting merchants",
        hint: "Waiting to be approved",
      },
    },
    superAdmin: {
      admins: { label: "Admins" },
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
      pendingApproval: { label: "Waiting for approval" },
      suspended: { label: "Suspended" },
    },
    payouts: {
      pendingReview: { label: "Waiting for review" },
      approvedAwaitingPayment: { label: "Approved" },
      paid: { label: "Paid" },
      rejected: { label: "Rejected" },
    },
  },
  merchant: {
    overview: {
      totalOrders: { label: "Total orders" },
      inTransit: { label: "On the way", hint: "Active deliveries" },
      pendingApproval: { label: "Waiting for approval" },
      codOutstanding: { label: "COD to collect" },
    },
    finance: {
      availableFunds: { label: "Available balance" },
      inReview: { label: "Being reviewed" },
      paidOut: { label: "Paid out" },
      outstandingBalance: { label: "Balance owed" },
    },
  },
  warehouse: {
    // The `intake` and `dispatch` groups are gone with their pages. What is
    // left in `orders` and `exceptions` is partly orphaned too — `delivered`,
    // `returned` and `totalExceptions` lost their only reader when those tiles
    // moved or were dropped — but they are cheap to keep and re-reading them
    // is likelier than editing this file blind.
    orders: {
      pendingApproval: { label: "Waiting for approval" },
      approved: { label: "Approved" },
      heldInWarehouse: { label: "In the warehouse" },
      inProgress: { label: "In progress" },
      delivered: { label: "Delivered" },
      exceptions: { label: "Exceptions" },
    },
    exceptions: {
      needsAction: { label: "Needs attention" },
      returned: { label: "Returned" },
      totalExceptions: { label: "Total exceptions" },
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
      toPickUp: { label: "To pick up" },
      pickedUpToday: { label: "Picked up today" },
      toDeliver: { label: "To deliver" },
      deliveredToday: { label: "Delivered today" },
      cashToSubmit: { label: "Cash to submit" },
    },
  },
} as const
