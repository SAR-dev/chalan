import { relations } from "drizzle-orm/relations"
import {
  account,
  balanceTransaction,
  merchant,
  merchantBalance,
  order,
  payoutRequest,
  pickupLocation,
  profile,
  rider,
  session,
  user,
  warehouse,
} from "./schema"

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
  profiles: many(profile),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const orderRelations = relations(order, ({ one, many }) => ({
  merchant: one(merchant, {
    fields: [order.merchantId],
    references: [merchant.id],
  }),
  pickupLocation: one(pickupLocation, {
    fields: [order.pickupLocationId],
    references: [pickupLocation.id],
  }),
  rider_pickupRiderId: one(rider, {
    fields: [order.pickupRiderId],
    references: [rider.id],
    relationName: "order_pickupRiderId_rider_id",
  }),
  warehouse: one(warehouse, {
    fields: [order.warehouseId],
    references: [warehouse.id],
  }),
  rider_deliveryRiderId: one(rider, {
    fields: [order.deliveryRiderId],
    references: [rider.id],
    relationName: "order_deliveryRiderId_rider_id",
  }),
  payoutRequest: one(payoutRequest, {
    fields: [order.payoutRequestId],
    references: [payoutRequest.id],
  }),
  balanceTransactions: many(balanceTransaction),
}))

export const merchantRelations = relations(merchant, ({ many }) => ({
  orders: many(order),
  pickupLocations: many(pickupLocation),
  payoutRequests: many(payoutRequest),
  merchantBalances: many(merchantBalance),
  balanceTransactions: many(balanceTransaction),
}))

export const pickupLocationRelations = relations(
  pickupLocation,
  ({ one, many }) => ({
    orders: many(order),
    merchant: one(merchant, {
      fields: [pickupLocation.merchantId],
      references: [merchant.id],
    }),
  }),
)

export const riderRelations = relations(rider, ({ one, many }) => ({
  orders_pickupRiderId: many(order, {
    relationName: "order_pickupRiderId_rider_id",
  }),
  orders_deliveryRiderId: many(order, {
    relationName: "order_deliveryRiderId_rider_id",
  }),
  warehouse: one(warehouse, {
    fields: [rider.warehouseId],
    references: [warehouse.id],
  }),
}))

export const warehouseRelations = relations(warehouse, ({ many }) => ({
  orders: many(order),
  riders: many(rider),
}))

export const payoutRequestRelations = relations(
  payoutRequest,
  ({ one, many }) => ({
    orders: many(order),
    merchant: one(merchant, {
      fields: [payoutRequest.merchantId],
      references: [merchant.id],
    }),
  }),
)

export const profileRelations = relations(profile, ({ one }) => ({
  user: one(user, {
    fields: [profile.userId],
    references: [user.id],
  }),
}))

export const merchantBalanceRelations = relations(
  merchantBalance,
  ({ one }) => ({
    merchant: one(merchant, {
      fields: [merchantBalance.merchantId],
      references: [merchant.id],
    }),
  }),
)

export const balanceTransactionRelations = relations(
  balanceTransaction,
  ({ one }) => ({
    merchant: one(merchant, {
      fields: [balanceTransaction.merchantId],
      references: [merchant.id],
    }),
    order: one(order, {
      fields: [balanceTransaction.orderId],
      references: [order.id],
    }),
  }),
)
