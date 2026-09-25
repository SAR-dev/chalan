# Admin guide

Operating tasks for Super Admins running {{APP_NAME}} from the admin console at **{{APP_URL}}/dashboard**. Warehouse Admins work from a separate console at **{{APP_URL}}/warehouse**.

## 1. Start at the dashboard

1. Open **Overview** (`/dashboard`).
2. Read the stat cards: warehouse admin count, total/active warehouses, **pending merchants**, **pending orders**, **pending riders**, and whether an outgoing mail configuration is active.
3. Work the queues in this order: approve merchants → approve orders → review rider applications → release payouts.
4. Everything you do is written to **Audit Logs** (`/dashboard/audit-logs`) with the actor, action, and entity.

## 2. Approve and manage merchants

1. Open **Merchants** (`/dashboard/merchants`).
2. Filter by status (Pending, Active, Suspended) and open a merchant to see orders, balance, and history.
3. **Approve** a Pending merchant — only merchants with a verified email can be approved; approval sets the account to Active and emails the merchant.
4. **Suspend** a merchant to block order creation, and **Reactivate** to restore access. Both are available per row and in bulk.
5. Use **Merchant Reviews** (`/dashboard/nid-reviews`) to approve or reject submitted NIDs — a rejection requires a reason, and merchants cannot create orders until their NID is verified.
6. Adjust a merchant's flat pricing (base rate, per-kg rate, free/max weight, COD fee) from the row menu on the Merchants page. Defaults for new merchants live under **Settings** (`/dashboard/settings`), and zone pricing takes precedence whenever a zone pair exists.

## 3. Approve orders

1. Open **Orders** (`/dashboard/orders`), titled "Order approvals".
2. Filter or search for **Pending** orders.
3. Approve a single order from its row menu, or select several and use the bulk **Approve** action — approved orders become visible to warehouses for rider assignment.
4. **Cancel** an order (single or bulk) with a reason while it is still cancellable — merchant orders can be cancelled before pickup, and admin cancellation is blocked once a parcel is out for delivery.
5. Click through to the order detail page for the full timeline, riders, proof photos, and audit trail.

## 4. Manage warehouses, riders, and applications

1. **Warehouses** (`/dashboard/warehouses`) — create, rename, activate, and deactivate hubs. Every pickup location resolves to a warehouse through its delivery city.
2. **Riders** (`/dashboard/riders`) — the full rider roster: add riders, edit details, and change status.
3. **Rider Applications** (`/dashboard/rider-applications`) — review applications from **{{APP_URL}}/apply/rider**. Approve by choosing a **task type** (pickup, delivery, or both) and a **home warehouse**; approval activates the login and sends an approval email. Reject with a reason otherwise.
4. **Admins** (`/dashboard/team`) — create and manage Super Admin and Warehouse Admin accounts.

## 5. Configure zones and pricing

1. **Delivery Zones** (`/dashboard/delivery-zones`) — create and maintain zones such as "Dhaka Metro" or "Divisional Cities".
2. **Delivery Cities** (`/dashboard/delivery-cities`) — assign each city a zone and the warehouse that serves it. This drives both routing and pricing.
3. **Zone Pricing** (`/dashboard/zone-pricing`) — fill the origin × destination pricing matrix: for each zone pair set the base rate, extra per-kg rate, free weight, max weight, and COD fee percentage.
4. Orders price themselves from that matrix; if a pair is missing, the merchant's own flat rates are used as a fallback.
5. **Settings** (`/dashboard/settings`) holds **default merchant pricing** for new merchants and the **mail configuration** (SMTP) used for all outgoing email.

## 6. Approve and pay payouts

1. Open **Payouts** (`/dashboard/payouts`).
2. Review the **Pending** tab — each request shows the merchant, amount, method (bKash/Nagad/Rocket/Bank transfer), and the orders it covers.
3. **Approve** a request to move it to Approved, or **Reject** it with a reason the merchant will see.
4. Mark approved requests **Paid** once the transfer is sent. Bulk approve/reject/mark-paid are available for clearing a backlog.
5. Watch the **History** tab for paid and rejected requests; merchants see the same statuses on their Finance page.

## 7. Settle COD

1. Open **COD Settlement** (`/dashboard/cod-settlement`) for a platform-wide view of delivered parcels and their COD state.
2. Warehouse Admins settle COD on their own console (`/warehouse/cod-settlement`) — settlement marks the parcel's cash as accounted for and makes the order payable to the merchant.
3. Use **Delivery Performance** (`/dashboard/delivery-performance`) for delivery metrics over time.
4. Merchant balances (platform charges, payment confirmations, manual adjustments) are managed per merchant at `/dashboard/merchants/<id>/balance` — confirm or reject submitted payments and apply Super Admin adjustments there.

## 8. Communications and system logs

1. **Announcements** (`/dashboard/announcements`) — publish targeted announcements; they appear as a banner and in each role's **Inbox**.
2. **Audit Logs** (`/dashboard/audit-logs`) — who did what, across orders, merchants, payouts, and team changes.
3. **Email Logs** (`/dashboard/email-logs`) — outgoing message history and delivery state.
4. **Account** (`/dashboard/account`) — update your name and change your password (current password + at least 8 characters).

## 9. The Warehouse Admin console

Warehouse Admins run the hub floor at **{{APP_URL}}/warehouse**:

1. **Intake queue** (`/warehouse`) — parcels picked up and waiting to be received.
2. **Dispatch desk** (`/warehouse/dispatch`) — assign pickup and delivery riders from the hub's roster.
3. **Order progress** (`/warehouse/orders`) — every parcel touching this hub.
4. **Riders** (`/warehouse/riders`) — this hub's riders only.
5. **Exceptions** (`/warehouse/exceptions`) — failed attempts and returns: schedule a reattempt or send the parcel back.
6. **COD settlement** (`/warehouse/cod-settlement`) — settle cash on delivered parcels, which unlocks merchant payouts.
