/**
 * Merchant balance ledger — accounting spec (ROADMAP P0.4).
 *
 * `merchant_balance.balance` is the running total of **what the merchant owes
 * the platform**: positive = the merchant owes, negative = the merchant is in
 * credit (the platform owes them). Every `balance_transaction` row uses the
 * same sign convention, so a merchant's balance is always exactly the sum of
 * their SETTLED rows — the reconciliation invariant asserted in tests.
 *
 * | Type              | Sign  | Meaning                                                    |
 * |-------------------|-------|------------------------------------------------------------|
 * | ORDER_CHARGE      | +fees | Platform fees accrued when the order is placed.            |
 * | ORDER_CHARGE_REV. | -fees | Reversed on a returned/cancelled order (fees refunded).     |
 * | ORDER_EARNINGS    | -gross| COD collected from the recipient on the merchant's behalf |
 * |                   |       | (gross `productCost`; the fee charge above nets this to     |
 * |                   |       | the merchant's earnings).                                   |
 * | ORDER_CANCELLATION| +fee  | Cancellation fee charged when an order is returned/cancelled|
 * |                   |       | instead of the delivery fee.                               |
 * | PAYOUT            | +paid | The platform paid the merchant — consumes their credit.     |
 * | PAYMENT_PENDING   | -amt  | The merchant paid the platform (awaiting confirmation).     |
 * | PAYMENT_CONFIRMED | -amt  | Merchant payment confirmed.                                 |
 * | ADJUSTMENT        | ±amt  | Manual admin correction.                                    |
 *
 * Worked example — productCost 100, deliveryFee 10, codFee 1 (earnings 89):
 *
 *     placed    → +11    (owes the fees)
 *     delivered → -100   (platform collected the COD)   → balance -89
 *     payout    → +89    (platform paid the earnings)   → balance   0
 *
 * The platform keeps the 11 in fees, and a fully settled order nets to zero.
 *
 * Returned order — same order, cancellationFee 3, never delivered:
 *
 *     placed    → +11    (owes the fees)
 *     returned  → -11    (delivery + COD fees refunded)
 *                 +3     (cancellation fee charged)      → balance   3
 *
 * The platform keeps the 3 cancellation fee and the merchant is refunded 8.
 */

/** Round a money amount to paisa (2 decimals). Every ledger write goes through
 *  this so stored money never carries float noise. */
export function toPaisa(amount: number): number {
  return Math.round(amount * 100) / 100
}

/** ORDER_CHARGE — platform fees accrued at order creation (positive). */
export function orderChargeAmount(deliveryFee: number, codFee: number): number {
  return toPaisa(deliveryFee + codFee)
}

/** ORDER_EARNINGS — gross COD collected from the recipient (negative). */
export function codCollectedAmount(productCost: number): number {
  return -toPaisa(productCost)
}

/** ORDER_CHARGE reversal — refund the creation fees on a returned order
 *  (negative; the mirror of {@link orderChargeAmount}). */
export function orderChargeReversalAmount(
  deliveryFee: number,
  codFee: number,
): number {
  return -toPaisa(deliveryFee + codFee)
}

/** ORDER_CANCELLATION — cancellation fee charged on a returned order
 *  (positive, merchant owes). */
export function cancellationChargeAmount(cancellationFee: number): number {
  return toPaisa(cancellationFee)
}

/** PAYOUT — the platform pays the merchant; consumes the credit (positive). */
export function payoutAmount(amount: number): number {
  return toPaisa(amount)
}

/** PAYMENT_PENDING / PAYMENT_CONFIRMED — the merchant pays the platform. */
export function paymentAmount(amount: number): number {
  return -toPaisa(amount)
}

/**
 * Reconciliation invariant: a merchant's balance equals the sum of their
 * SETTLED ledger rows (PENDING/REJECTED rows never move the balance).
 */
export function settledTotal(
  rows: readonly { amount: number; status: string }[],
): number {
  return toPaisa(
    rows
      .filter((row) => row.status === "SETTLED")
      .reduce((sum, row) => sum + row.amount, 0),
  )
}
