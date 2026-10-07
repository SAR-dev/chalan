# Warehouse admin guide

How to run your hub on {{APP_NAME}}. Sign in at **{{APP_URL}}/login** and open the warehouse console at **{{APP_URL}}/warehouse** — it only shows the parcels, riders, and cash that belong to your hub.

## 1. Understand your scope

1. Your console covers one hub: its approvals, parcels in flight, riders, exceptions, and cash.
2. Platform-wide work — approving merchants, orders, payouts, pricing, and packages — belongs to a Super Admin on **{{APP_URL}}/dashboard**. Ask one when you need a hub, rider, or account change.
3. Both admin roles can settle COD and use two-factor authentication.

## 2. Read the overview

1. Open **Overview** (`/warehouse`) — it is numbers only, no tables.
2. The tiles count the parcels you can still act on: **Pending**, **Approved**, **Out for pickup**, **Picked up**, **In warehouse**, **In transit**, **Out for delivery**, **Failed attempt**.
3. **Waiting to be settled** counts delivered parcels whose cash has not been handed over yet.
4. Closed parcels are not tiled — nothing can be done to them. Find them under **Completed**.

## 3. Approve new orders

1. Open **Order approval** (`/warehouse/orders`). It lists **pending** orders and nothing else.
2. Approve an order to release it for collection, or cancel one that will not go out.
3. Once approved, the parcel moves to the board in **Ongoing**.

## 4. Work the ongoing board

1. Open **Ongoing** (`/warehouse/ongoing`) — every parcel in flight at your hub.
2. Switch between **By status** (one lane per lifecycle step) and **By riders** (one lane per person who has to act next). Each parcel appears in exactly one lane either way.
3. Act on a parcel from its card:
   - **Assign pickup** on an approved order with no pickup rider.
   - **Receive** on a parcel a pickup rider has collected — this moves it to **In warehouse** and makes it available to dispatch.
   - **Dispatch** on a parcel in the warehouse. The parcel then goes **In transit** and appears in that rider's queue.
4. **Auto-assign riders** at the top plans a delivery split over everything sitting in the warehouse at once. Read the proposal before applying it.
5. Click a parcel's code to open its timeline, assigned riders, and proof photos.
6. Only riders attached to your hub can be assigned — check **Riders** (`/warehouse/riders`) if someone is missing.

## 5. Review closed parcels

1. Open **Completed** (`/warehouse/completed`). It is read-only: **Delivered**, **Cancelled** and **Returned** parcels, with no actions.
2. Use the tabs to narrow to one of those outcomes. **Returned** parcels carry their return reason and who resolved them.

## 6. Resolve failed attempts

1. Open **Exceptions** (`/warehouse/exceptions`) — failed attempts that are waiting on a decision.
2. Read the rider's failure note, then choose:
   - **Reattempt** — the parcel goes back to **Out for delivery** for another try.
   - **Return** — the parcel is set to **Returned**, goes back to the merchant, and moves to **Completed**.
3. The merchant sees the outcome under the **Issues** tab of their Orders page.

## 7. Settle COD

1. Open **COD Settlement** (`/warehouse/cod-settlement`).
2. It lists delivered parcels whose cash riders collected.
3. Settle a parcel to mark its COD as accounted for. Settlement is what makes the order **payable to the merchant** — they then see it in **Available for payout** on their Finance page.
4. Settle promptly; merchants cannot request a payout for cash you have not settled.

## 8. Read the rider cash panel

1. Open **Rider Cash** (`/warehouse/rider-cash`). It covers every rider attached to your hub, and it is a read-only view.
2. The three cards give the hub-wide totals: **Total Cash on Hand**, **Total Collected**, and **Total Submitted**.
3. The table gives one row per rider with the same three figures and a **Status** badge — **High** when a rider is carrying more cash than the panel's threshold, **Normal** otherwise.
4. **Collected** is every COD delivery the rider has made. **Submitted** is the part already settled. **Cash on Hand** is the difference: what the rider is still carrying.
5. There is no confirm action on this page. Cash leaves a rider's hand on **COD Settlement** (`/warehouse/cod-settlement`) — settling there is what marks the cash submitted and makes the order payable to the merchant.
6. If a rider's totals look wrong, compare them against that rider's **Cash collections** list and raise it with them first. Settle only once the figures agree.

## 9. Manage your riders

1. Open **Riders** (`/warehouse/riders`) for your hub's roster only.
2. Check who is active before dispatching; an inactive rider will not appear in the dispatch pickers.
3. Adding riders, changing task types, and moving a rider between hubs is a Super Admin action — ask the platform team.

## 10. Account, announcements, and support

1. Open **Inbox** (`/warehouse/announcements`) for platform announcements (also shown as a banner at the top of the app).
2. Open **Account** (`/warehouse/account`) to update your name, change your password (current password + at least 8 characters), and set up two-factor authentication.
3. If you are covered by the platform's 2FA policy you are sent to your Account page to enroll at sign-in.
4. Raise anything you cannot resolve from **Support** (`/warehouse/support`), or email **{{APP_EMAIL}}**.
