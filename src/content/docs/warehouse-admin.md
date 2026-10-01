# Warehouse admin guide

How to run your hub on {{APP_NAME}}. Sign in at **{{APP_URL}}/login** and open the warehouse console at **{{APP_URL}}/warehouse** — it only shows the parcels, riders, and cash that belong to your hub.

## 1. Understand your scope

1. Your console covers one hub: its intake, dispatch, riders, exceptions, and cash.
2. Platform-wide work — approving merchants, orders, payouts, pricing, and packages — belongs to a Super Admin on **{{APP_URL}}/dashboard**. Ask one when you need a hub, rider, or account change.
3. Both admin roles can settle COD and use two-factor authentication.

## 2. Work the intake queue

1. Open **Intake queue** (`/warehouse`).
2. It lists parcels pickup riders have collected and that are waiting to be received at your hub.
3. Receive a parcel to move it to **In warehouse** — that is what makes it available to dispatch.

## 3. Dispatch riders

1. Open **Dispatch desk** (`/warehouse/dispatch`).
2. Assign a **pickup rider** to approved orders that need collecting.
3. Assign a **delivery rider** to parcels sitting in the warehouse. The parcel then goes **In transit** and appears in that rider's queue.
4. Only riders attached to your hub can be assigned — check **Riders** (`/warehouse/riders`) if someone is missing.

## 4. Track every parcel

1. Open **Order progress** (`/warehouse/orders`) for every parcel touching your hub.
2. Search and filter to find a specific tracking code.
3. Click through to an order to see its timeline, assigned riders, and proof photos.

## 5. Resolve failed attempts and returns

1. Open **Exceptions** (`/warehouse/exceptions`) — it collects failed attempts and returns.
2. Read the rider's failure note, then choose:
   - **Reattempt** — the parcel goes back to **Out for delivery** for another try.
   - **Return** — the parcel is set to **Returned** and goes back to the merchant.
3. The merchant sees the outcome under the **Issues** tab of their Orders page.

## 6. Settle COD

1. Open **COD Settlement** (`/warehouse/cod-settlement`).
2. It lists delivered parcels whose cash riders collected.
3. Settle a parcel to mark its COD as accounted for. Settlement is what makes the order **payable to the merchant** — they then see it in **Available for payout** on their Finance page.
4. Settle promptly; merchants cannot request a payout for cash you have not settled.

## 7. Read the rider cash panel

1. Open **Rider Cash** (`/warehouse/rider-cash`). It covers every rider attached to your hub, and it is a read-only view.
2. The three cards give the hub-wide totals: **Total Cash on Hand**, **Total Collected**, and **Total Submitted**.
3. The table gives one row per rider with the same three figures and a **Status** badge — **High** when a rider is carrying more cash than the panel's threshold, **Normal** otherwise.
4. **Collected** is every COD delivery the rider has made. **Submitted** is the part already settled. **Cash on Hand** is the difference: what the rider is still carrying.
5. There is no confirm action on this page. Cash leaves a rider's hand on **COD Settlement** (`/warehouse/cod-settlement`) — settling there is what marks the cash submitted and makes the order payable to the merchant.
6. If a rider's totals look wrong, compare them against that rider's **Earnings** list and raise it with them first. Settle only once the figures agree.

## 8. Manage your riders

1. Open **Riders** (`/warehouse/riders`) for your hub's roster only.
2. Check who is active before dispatching; an inactive rider will not appear in the dispatch pickers.
3. Adding riders, changing task types, and moving a rider between hubs is a Super Admin action — ask the platform team.

## 9. Account, announcements, and support

1. Open **Inbox** (`/warehouse/announcements`) for platform announcements (also shown as a banner at the top of the app).
2. Open **Account** (`/warehouse/account`) to update your name, change your password (current password + at least 8 characters), and set up two-factor authentication.
3. If you are covered by the platform's 2FA policy you are sent to your Account page to enroll at sign-in.
4. Raise anything you cannot resolve from **Support** (`/warehouse/support`), or email **{{APP_EMAIL}}**.
