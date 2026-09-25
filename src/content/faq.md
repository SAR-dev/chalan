# Frequently Asked Questions (FAQ)

Answers to the most common questions about {{APP_NAME}} — accounts, orders, pricing, pickups, deliveries, and payouts.

Stuck on something else? Email **{{APP_EMAIL}}** and the platform team will help.

---

## Getting started

### What is {{APP_NAME}}?

{{APP_NAME}} is a B2B delivery and logistics platform. Merchants book pickups and deliveries from their panel, warehouse hubs receive and dispatch parcels, riders collect and deliver them (including Cash on Delivery), and platform admins approve orders, manage pricing, and release payouts. Every signed-in user has one of four roles: Super Admin, Warehouse Admin, Merchant, or Rider.

### How do I create an account?

Merchants register at **{{APP_URL}}/register** with your business name, owner name, email, phone, address, business type, and a password. Your account starts as **Pending**: once your email is verified you can sign in, but a Super Admin must approve the account before you can create orders. Riders apply through the public rider application at **{{APP_URL}}/apply/rider**. Warehouse and admin accounts are provisioned by a Super Admin.

### How do I verify my email address?

After registering you receive a verification email. Open the link to verify your address — the link expires, so use the **Resend activation** button shown on the login page if you need a fresh one. Your email must be verified before a Super Admin can approve your merchant account, and a verified email is also required before you can create orders.

### What do I need before I can create my first order?

Three things must be in place:

1. Your merchant account status is **Active** (approved by a Super Admin).
2. Your **email is verified**.
3. Your **NID is verified** (see below).

If any of these is missing, the order form will tell you exactly what to finish.

### How does NID verification work?

Open **Verification** (`/merchant/verify-nid`) in your merchant sidebar and submit a photo of the front of your NID, the back, a selfie holding your NID, and your NID number. A Super Admin reviews the submission on the **Merchant Reviews** page (`/dashboard/nid-reviews`) and approves or rejects it — you'll see the current status on your Verification page. Until your NID is verified you cannot create orders.

### How do riders, warehouse staff, and admins get accounts?

Riders apply publicly at **{{APP_URL}}/apply/rider**; a Super Admin approves applications on **Rider Applications** (`/dashboard/rider-applications`), choosing the rider's task type (pickup, delivery, or both) and home warehouse — approval activates the login and sends an email. Warehouse Admin and Super Admin accounts are created by a Super Admin from the **Admins** page (`/dashboard/team`).

---

## Orders

### How do I create an order?

1. Go to **New Order** (`/merchant/orders/new`).
2. Pick a **pickup location** (locations are managed on your Business Settings page).
3. Enter the **recipient name** and **recipient phone**.
4. Choose the **delivery city** and type the **delivery address** (an optional map link can be added).
5. Enter **parcel weight** and the **COD amount** (leave COD at 0 for prepaid parcels).
6. Add an optional note, and use **Add parcel** to include more parcels in the same submission.
7. Confirm — the charges update live as you type.

### What happens after I submit an order — and who approves it?

Your order starts as **Pending**. A Super Admin approves it (**Approved**), then a warehouse assigns a pickup rider. From there the parcel is picked up, received at the warehouse, dispatched to a delivery rider, and delivered. You'll see every transition on the order detail page.

### What do the order statuses mean?

- **Pending** — created by you, waiting for admin approval.
- **Approved** — approved, waiting for a pickup rider.
- **Picked up** — a rider collected the parcel from your pickup location.
- **In warehouse** — received at the destination hub.
- **In transit** — dispatched to a delivery rider.
- **Out for delivery** — the rider is on the way to the recipient.
- **Delivered** — handed over (and COD collected, if any).
- **Failed attempt** — the rider could not deliver; a reason was recorded.
- **Returned** — the parcel is being sent back to you.
- **Cancelled** — the order was stopped before delivery.

### Can I cancel an order?

Yes, while it is still **Pending** or **Approved** — those are the only statuses a merchant may cancel. Admins and warehouse admins can cancel up to the point the parcel is **Out for delivery**. A reason is recorded with the cancellation.

### Can I import orders in bulk (CSV)?

Not yet. Today you create orders one at a time from the New Order form, which supports several parcels in a single submission. CSV/bulk import is planned but not built yet — the multi-parcel form is the current alternative.

### How do I track my orders?

Open **Orders** (`/merchant/orders`) and use the tabs — Active, Pending, In progress, Issues (failed attempts and returns), and All — plus search and filters. Click any order to open its detail page (`/merchant/orders/<code>`) for the full timeline, rider names, and proof photos.

### Can my customer track a parcel without logging in?

Yes. Every order has a public tracking link at **{{APP_URL}}/track/&lt;code&gt;**. Anyone with the code can see the live status and timeline, and the recipient can leave a delivery note from that page — no account required.

---

## Pricing & COD

### How is the delivery fee calculated?

Delivery fees come from the **zone-to-zone pricing matrix**: the origin zone (the warehouse your pickup location belongs to) and the destination zone (the delivery city's zone) select a rate. The rate is a base fee plus an extra per-kg charge for weight above the free allowance, with partial kilograms rounded up. If no zone pair is configured, your account's flat rates apply instead. You can review your rates and preview charges with the calculator on **Pricing** (`/merchant/pricing`).

### What is the COD fee?

The COD fee is a percentage of the cash amount collected from the recipient (1% by default; your exact rate is shown on the Pricing page). It is charged together with the delivery fee when the order is created.

### When am I charged for an order?

When you create an order, a platform charge equal to the **delivery fee + COD fee** is recorded against your balance — there is nothing to pay upfront, and the full breakdown is stored on the order.

### How does my balance change when an order is delivered?

When an order is marked **Delivered**, an earning credit of **COD amount − delivery fee − COD fee** is posted for that order. Fees are therefore settled out of the COD proceeds rather than invoiced separately.

### When do funds become available for payout?

A delivered order becomes payable once the warehouse has **settled its COD** (the COD settlement step at the hub). Settled orders show up in the **Available for payout** list on **Finance** (`/merchant/finance`), with the amount you can request.

### How do I request a payout?

1. Open **Finance** (`/merchant/finance`).
2. Click **Request payout** (enabled when you have settled funds).
3. Choose a payout method — **bKash**, **Nagad**, **Rocket**, or **Bank transfer** — and enter the account details.
4. Submit. The request covers all currently settled, unpaid orders and locks them to that request.

### What happens after I submit a payout request?

Your request is created as **Pending**. A platform admin approves it (**Approved**) or rejects it (**Rejected**, with a reason shown on the request), and approved requests are marked **Paid** once the transfer is sent. Track every request and its status in the **Payout requests** table on the Finance page.

---

## Pickup & delivery

### What proof do riders capture at pickup?

Riders must attach at least one **photo of the parcel** at the pickup location before they can confirm collection. The photos are stored with the order and visible to you and to admins.

### What proof is required when a parcel is delivered?

A **proof of delivery photo** is mandatory before a rider can mark a parcel delivered. For a failed attempt, a written **note explaining the failure** is required instead. Both are attached to the order timeline.

### What happens if a delivery attempt fails?

The order moves to **Failed attempt** with the rider's note. From the **Exceptions** desk (`/warehouse/exceptions`) the warehouse can either schedule a **reattempt** (the parcel goes back to **Out for delivery**) or **return** it — returned parcels show up under the **Issues** tab of your Orders page.

### How do returns work?

When the warehouse returns a parcel, its status becomes **Returned** and it appears in your **Issues** tab with the reason recorded on the order.

### How does collected COD cash become payable to me?

The rider collects the COD amount from the recipient at delivery, the warehouse confirms the cash during **COD settlement**, and the settled order moves into **Available for payout** on your Finance page. From there you request a payout as described above.

---

## Account & security

### I forgot my password — how do I reset it?

Open **Forgot password?** on the login page (`/forgot-password`), enter your account email, and we'll send you a reset link. Open it and choose a new password. If the email doesn't arrive, check spam first, then contact **{{APP_EMAIL}}**.

### How do I change my password?

Go to **Account** in your sidebar (`/merchant/account`, `/rider/account`, `/warehouse/account`, or `/dashboard/account`). Under Account settings, enter your current password plus a new password of at least 8 characters and save.

### Is two-factor authentication (2FA) available?

Not yet. Two-factor authentication is on the roadmap and will be offered from Account settings when it ships. In the meantime, use a strong unique password and never share your login.

### Why can't I create orders?

The usual causes are: your account is **Pending** or **Suspended**, your **email isn't verified**, your **NID isn't verified**, the parcel is heavier than your account's **maximum weight**, or your pickup location has no active warehouse behind it. The error message on the order form tells you which one it is. Suspended merchants must contact the platform team to be reactivated.

### How do I contact support?

Email **{{APP_EMAIL}}** with your business name and, for order issues, the tracking code. Platform announcements also appear in your **Inbox** (`/merchant/announcements` and the equivalent page for other roles) and as a banner at the top of the app.
