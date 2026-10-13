# Rider guide

How to work your pickup and delivery queues on {{APP_NAME}}. Sign in at **{{APP_URL}}/login** — riders land on their To-do page.

## 1. Start from your To-do page

1. Open **To-do** (`/rider`). It shows the parcels waiting for you today:
   - **Pickups** — approved orders assigned to you at a pickup location.
   - **Deliveries** — parcels assigned to you that are in transit or out for delivery.
2. Each card shows the recipient, address, and quick actions.
3. Use **Pickups** (`/rider/pickup`) and **Deliveries** (`/rider/delivery`) for the full queues with search and date filters.

## 2. Work the pickup queue

1. Open **Pickups** (`/rider/pickup`) and find an order in **Approved** status assigned to you.
2. Press **Out for pickup** and confirm that you are heading to the shop. The order moves to **Out for pickup** — collecting before this is refused, because the hub needs to know you have actually left.
3. Press the pickup action to open the confirmation dialog.
4. **Capture at least one photo** of the parcel at the pickup location — photos are required; the submit button stays disabled until you add one.
5. Confirm. The order moves to **Picked up**, and the warehouse hub takes over from there.
6. Pickup orders that are neither **Approved** nor **Out for pickup** show as completed in the same list.

## 3. Work the delivery queue

1. Open **Deliveries** (`/rider/delivery`) for parcels assigned to you.
2. For a parcel in **In transit**, press the action to mark it **Out for delivery** — check the recipient and destination details, then confirm.
3. For a parcel already **Out for delivery**, open the **delivery attempt** dialog and record the outcome:
   - **Delivered** — capture the **proof of delivery photo** (required) and confirm. The COD amount collected is recorded with the order.
   - **Failed** — type a **note explaining why** (required) and record the failure. The order becomes **Failed attempt** and the warehouse decides whether to reattempt or return it.
4. The merchant and admins see the result in real time on the order.

## 4. Rules that apply to you

1. You can only pick up an order that is **Approved** and assigned to you, and only from your own queue.
2. You can only start a delivery that is **In transit** and assigned to you, and only record an outcome while it is **Out for delivery**.
3. Always photograph the parcel — proof photos are mandatory at pickup and on delivery, and they protect you in disputes.
4. Record honest failure notes; they drive the warehouse's reattempt/return decision.

## 5. Check your cash collections

1. Open **Cash collections** (`/rider/cash`) from the **Money** section of the sidebar.
2. Review **Cash on Hand** (collected but not yet handed over), **Total Collected**, and **Total Submitted**.
3. Scroll the transaction list: each entry is a **Collected** delivery or a **Confirmed** one, with the order it belongs to and who confirmed it.
4. Hand collected cash to your hub as instructed. **Confirmed** means your warehouse has settled that order — settled cash is what reaches merchant payouts.

## 6. What happens to a parcel after you collect it

1. Your pickup moves the order to **Picked up**; the receiving hub marks it **In warehouse**.
2. A warehouse dispatcher assigns a **delivery rider** and the parcel goes **In transit**.
3. That rider starts the delivery (**Out for delivery**) and records the outcome — delivered or failed.
4. If the parcel comes back to your hub after a failed attempt, it can be scheduled for a **reattempt** (back to **Out for delivery**) or **returned** to the merchant.

## 7. If something looks wrong

1. **The order is not in my queue** — it is not assigned to you, it is in the wrong status, or your task type does not cover it. Queues only show work assigned to your rider account.
2. **The pickup button is disabled** — you have not added the required parcel photo yet.
3. **I cannot record an outcome** — the parcel must be marked **Out for delivery** first; **In transit** parcels only offer the "out for delivery" action.
4. **Cash totals do not match** — compare the **Cash collections** transaction list with what you handed to the hub, then raise it with your warehouse supervisor before the cash is confirmed.
5. **Nothing loads or my account is blocked** — check the **Inbox** for announcements, then raise it on **Support** (`/rider/support`) with your rider name.

## 8. Account, announcements, and support

1. Open **Inbox** (`/rider/announcements`) for platform announcements. Unread ones raise a count on the **announcements** icon at the right of the top bar, which links straight to the feed.
2. Open **Support** (`/rider/support`) to raise a ticket and follow the replies — the fastest route for a wrong cash total or a parcel that will not resolve.
3. Open **Account** (`/rider/account`) to update your name and change your password (current password + at least 8 characters).
4. Task type (pickup, delivery, or both) and your home warehouse are set by a Super Admin when your application is approved — ask the platform team if they look wrong.
