# Frequently Asked Questions (FAQ)

Answers to the most common questions about {{APP_NAME}} — accounts, orders, pricing, prepaid packages, pickups, deliveries, and payouts.

Stuck on something else? Email **{{APP_EMAIL}}**, or raise a ticket from **Support** in your sidebar.

Use the tabs below to show only your role's questions. **All** shows everything.

---

<!-- role: shared -->
## Getting started

### What is {{APP_NAME}}?

{{APP_NAME}} is a B2B delivery and logistics platform. Merchants book pickups and deliveries from their panel, warehouse hubs receive and dispatch parcels, riders collect and deliver them (including Cash on Delivery), and platform admins approve orders, manage pricing, and release payouts.

### Which role am I, and what can I do?

- **Merchant** — books parcels, tracks them, pays delivery and COD fees, buys prepaid packages, and requests payouts. Console at `/merchant`.
- **Rider** — collects and delivers parcels from a queue, recording proof photos at every step. Console at `/rider`.
- **Warehouse Admin** — runs one hub: intake, dispatch, exceptions, COD settlement, and rider cash. Console at `/warehouse`.
- **Super Admin** — runs the platform: approvals, pricing, packages, payouts, announcements, and audit logs. Console at `/dashboard`.

### How do I create an account?

Merchants register at **{{APP_URL}}/register** with your business name, owner name, email, phone, address, business type, and a password. Your account starts as **Pending**: once your email is verified you can sign in, but a Super Admin must approve the account before you can create orders. Riders apply through the public rider application at **{{APP_URL}}/apply/rider**. Warehouse and admin accounts are provisioned by a Super Admin.

### How do I verify my email address?

After registering you receive a verification email. Open the link to verify your address — the link expires, so use the **Resend activation** button shown on the login page if you need a fresh one. Your email must be verified before a Super Admin can approve your merchant account, and a verified email is also required before you can create orders.

### How do riders, warehouse staff, and admins get accounts?

Riders apply publicly at **{{APP_URL}}/apply/rider**; a Super Admin approves applications on **Rider Applications** (`/dashboard/rider-applications`), choosing the rider's task type (pickup, delivery, or both) and home warehouse — approval activates the login and sends an email. Warehouse Admin and Super Admin accounts are created by a Super Admin from the **Admins** page (`/dashboard/team`).

---

<!-- role: shared -->
## Account & security

### I forgot my password — how do I reset it?

Open **Forgot password?** on the login page (`/forgot-password`), enter your account email, and we'll send you a reset link. Open it and choose a new password. If the email doesn't arrive, check spam first, then contact **{{APP_EMAIL}}**.

### How do I change my password?

Go to **Account** in your sidebar (`/merchant/account`, `/rider/account`, `/warehouse/account`, or `/dashboard/account`). Under Account settings, enter your current password plus a new password of at least 8 characters and save.

### Is two-factor authentication (2FA) available?

Yes. Every role can turn it on from **Account** in their sidebar — set it up with an authenticator app by entering the shown secret, then confirm a code, and store the one-time recovery codes somewhere safe. Super Admins and Warehouse Admins may additionally be **required** to use 2FA by platform policy; if so, you are sent to your Account page to enroll the next time you sign in.

### How do I contact support?

Email **{{APP_EMAIL}}** with your business name and, for order issues, the tracking code — or open **Support** in your sidebar (`/merchant/support`, `/rider/support`, `/warehouse/support`, `/dashboard/support`) to raise a ticket you can track in the app. Platform announcements also appear in your **Inbox** and as a banner at the top of the app.

---

<!-- role: merchant -->
## For merchants: getting started

### What do I need before I can create my first order?

Three things must be in place:

1. Your merchant account status is **Active** (approved by a Super Admin).
2. Your **email is verified**.
3. Your **NID is verified** (see below).

If any of these is missing, the order form will tell you exactly what to finish.

### How does NID verification work?

Open **Verification** (`/merchant/verify-nid`) in your merchant sidebar and submit a photo of the front of your NID, the back, a selfie holding your NID, and your NID number. A Super Admin reviews the submission on the **Merchant Reviews** page (`/dashboard/nid-reviews`) and approves or rejects it — you'll see the current status on your Verification page. Until your NID is verified you cannot create orders.

### Why can't I create orders?

The usual causes are: your account is **Pending** or **Suspended**, your **email isn't verified**, your **NID isn't verified**, the parcel is heavier than your account's **maximum weight**, or your pickup location has no active warehouse behind it. The error message on the order form tells you which one it is. Suspended merchants must contact the platform team to be reactivated.

---

<!-- role: merchant -->
## For merchants: orders

### How do I create an order?

1. Go to **New Order** (`/merchant/orders/new`).
2. Pick a **pickup location** (locations are managed on your Business Settings page).
3. Enter the **recipient name** and **recipient phone**.
4. Choose the **delivery city** and type the **delivery address** (an optional map link can be added).
5. Enter **parcel weight** and the **COD amount** (leave COD at 0 for prepaid parcels).
6. Add an optional note, and use **Add parcel** to include more parcels in the same submission.
7. Confirm — the charges update live as you type.

### Can I import orders in bulk (CSV)?

Yes. From **New Order** (`/merchant/orders/new`) choose the import option, or go straight to `/merchant/orders/import`. Upload your CSV and the preview flags every invalid row so you can fix the problems before importing — rows with errors block the import until they are corrected. A valid file creates all of its parcels in one submission.

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

### How do I track my orders?

Open **Orders** (`/merchant/orders`) and use the tabs — Active, Pending, In progress, Issues (failed attempts and returns), and All — plus search and filters. Click any order to open its detail page (`/merchant/orders/<code>`) for the full timeline, rider names, and proof photos.

### Can my customer track a parcel without logging in?

Yes. Every order has a public tracking link at **{{APP_URL}}/track/&lt;code&gt;**. Anyone with the code can see the live status and timeline, and the recipient can leave a delivery note from that page — no account required.

### What happens if a delivery attempt fails, or a parcel is returned?

The order moves to **Failed attempt** with the rider's note, and the warehouse decides whether to schedule a **reattempt** (the parcel goes back to **Out for delivery**) or **return** it. Returned parcels show up under the **Issues** tab of your Orders page with the reason recorded.

---

<!-- role: merchant -->
## For merchants: pricing, COD & payouts

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

<!-- role: merchant -->
## For merchants: prepaid packages

### What is a prepaid package?

A package is a prepaid bundle that discounts your delivery fee and comes with an **order quota** — the number of orders it covers. You buy it once by manual transfer (bKash or bank transfer), an admin confirms the payment, and the bundle then activates on your account.

### How do I buy a package?

1. Open **Pricing** (`/merchant/pricing`) and find the package catalogue.
2. Press **Request** on the package you want, add an optional note (for example your transfer reference), and submit.
3. Transfer the package price to the platform account and wait for an admin to confirm it.
4. Once confirmed, the bundle appears as your **Active bundle** on the same page.

### How does the package discount work?

Each package has tiers by order count. As you ship, you move up the tiers and new orders have their delivery fee reduced by that tier's rule — either a **flat** amount off or a **percentage** off. The discount applies to the delivery fee only; COD and cancellation fees are unchanged. Every order stores the exact rule applied to it, so later changes to the package never re-price orders you already created.

### What is the order quota, and what happens when it runs out?

The bundle covers a set number of orders. The **Active bundle** card shows how many you have used and your progress toward the next tier. When the quota is used up the bundle stops applying and you can request another package.

### Can I buy another package while one is active?

No. You can hold only one bundle at a time, and you can have only one request awaiting review. Use up or finish your current bundle, or wait for your pending request to be reviewed, before requesting again.

### What if my request is rejected?

A rejected request shows the admin's reason on your Pricing page, and it does **not** lock you out — you can submit a new request straight away.

### Does the price I paid change if the package price is edited later?

No. The price is recorded on your request the moment you submit it, so a later catalogue price change cannot change what you agreed to pay.

---

<!-- role: rider -->
## For riders

### How do I become a rider?

Apply at **{{APP_URL}}/apply/rider**. A Super Admin reviews your application and, on approval, sets your **task type** (pickup, delivery, or both) and your **home warehouse** — that activates your login and emails you. Your task type and home warehouse decide which orders reach your queue.

### What are the pickup and delivery task types?

- **Pickup** — you collect parcels from merchants' pickup locations and hand them to the hub.
- **Delivery** — you take parcels from the hub to recipients.
- **Both** — you appear in either queue.

Only orders matching your task type are ever assigned to you.

### Where do I start my day?

Your **To-do** page (`/rider`) lists the parcels waiting for you today, split into pickups and deliveries. **Pickups** (`/rider/pickup`) and **Deliveries** (`/rider/delivery`) show the full queues with search and date filters.

### What proof do I need at pickup?

At least one **photo of the parcel**, taken at the pickup location. The confirm button stays disabled until you attach one, and the photos are stored on the order — they protect you if a dispute comes up.

### What proof is required on delivery?

A **proof of delivery photo** is mandatory before you can mark a parcel **Delivered**. If the attempt fails, a written **note explaining why** is required instead. Both are attached to the order timeline for the merchant and admins to see.

### What happens if a delivery attempt fails?

The order becomes **Failed attempt** with your note. It leaves your queue and goes to the warehouse **Exceptions** desk, which decides whether to schedule a **reattempt** (the parcel returns to **Out for delivery**) or **return** it to the merchant.

### How do I check my earnings and cash?

Open **Earnings** (`/rider/earnings`) to see **Cash on Hand** (collected but not yet submitted), **Total Collected**, and **Total Submitted**, plus every collected, submitted, and confirmed cash entry with the order it belongs to. Hand collected cash to your hub as instructed — a warehouse admin confirms the submission.

### Why is an order missing from my queue?

Queues only show work assigned to your rider account. If an order isn't there it is either not assigned to you, not in the right status (pickups need **Approved**; deliveries need **In transit** or **Out for delivery**), or outside your task type.

### Can I change my task type or home warehouse?

No — they are set by a Super Admin when your application is approved. Ask the platform team at **{{APP_EMAIL}}** if they look wrong.

---

<!-- role: warehouse -->
## For warehouse admins

### What does a warehouse admin do?

You run the floor of one hub from the console at **{{APP_URL}}/warehouse**. You receive parcels from pickup riders, dispatch them to delivery riders, handle failed attempts and returns, settle COD cash, and confirm rider cash submissions. Your console only shows the parcels, riders, and cash that belong to your hub.

### How does the intake queue work?

**Intake queue** (`/warehouse`) lists parcels that pickup riders have collected and that are waiting to be received at your hub. Receiving a parcel moves it to **In warehouse**, which is what makes it available for dispatch.

### How do I assign riders from the dispatch desk?

**Dispatch desk** (`/warehouse/dispatch`) is where you assign a pickup rider to approved orders and a delivery rider to parcels in the warehouse. Once you assign a delivery rider the parcel goes **In transit** and appears in that rider's queue. Only riders attached to your hub can be assigned.

### What is the exceptions desk for?

**Exceptions** (`/warehouse/exceptions`) collects failed attempts and returns. For a failed attempt you either schedule a **reattempt** — the parcel goes back to **Out for delivery** — or **return** it to the merchant, which sets it to **Returned**. The rider's failure note is shown so you can decide.

### How does COD settlement work?

**COD Settlement** (`/warehouse/cod-settlement`) lists delivered parcels whose cash riders collected. Settling a parcel marks its COD as accounted for, and it is what makes the order payable to the merchant — merchants then see it in **Available for payout** on their Finance page.

### How do I handle rider cash?

**Rider cash** (`/warehouse/rider-cash`) tracks the cash each of your riders is holding, has submitted, and that you have confirmed. Confirmed cash is what reaches merchant payouts, so confirm submissions promptly and chase any mismatch with the rider.

### How is a warehouse admin different from a super admin?

Your console is scoped to your hub: its parcels, riders, exceptions, and cash. Platform-wide actions — approving merchants and NIDs, approving orders, zone pricing, packages, payouts, warehouses, and admin accounts — belong to the Super Admin on `/dashboard`. Both admin roles can settle COD and use 2FA. Ask a Super Admin if you need a hub, rider, or account change.

---

<!-- role: super-admin -->
## For super admins

### What can only a super admin do?

Approving merchants, NID reviews, rider applications, and orders; managing warehouses, delivery zones, cities, and zone pricing; running the package catalogue and reviewing package purchase requests; approving and paying payouts; publishing announcements; and creating Warehouse Admin and Super Admin accounts. Everything you do is written to **Audit Logs**.

### How do I approve merchants and NIDs?

**Merchants** (`/dashboard/merchants`) — filter by status and approve, suspend, or reactivate; only merchants with a verified email can be approved. **Merchant Reviews** (`/dashboard/nid-reviews`) — approve or reject submitted NIDs; a rejection needs a reason, and a merchant cannot create orders until their NID is verified. You can also adjust a merchant's flat pricing from the row menu.

### How do I approve orders?

**Orders** (`/dashboard/orders`) lists pending orders; approve one from its row menu, or select several and use the bulk **Approve** action. Approved orders become visible to warehouses for rider assignment. You can cancel orders (single or bulk) with a reason until a parcel is out for delivery.

### How do I manage riders and rider applications?

**Rider Applications** (`/dashboard/rider-applications`) — approve an application by choosing a **task type** and **home warehouse** (approval activates the login and sends an email), or reject it with a reason. **Riders** (`/dashboard/riders`) is the full roster, where you add riders and change their details or status.

### How do I set pricing?

**Delivery Zones** (`/dashboard/delivery-zones`) and **Delivery Cities** (`/dashboard/delivery-cities`) define zones and the warehouse that serves each city. **Zone Pricing** (`/dashboard/zone-pricing`) holds the origin × destination matrix (base rate, per-kg rate, free and max weight, COD fee). Orders price themselves from that matrix; if a zone pair is missing, the merchant's own flat rates apply. Defaults for new merchants, and the mail configuration, live under **Settings** (`/dashboard/settings`).

### How do I manage packages?

**Packages** (`/dashboard/packages`) is the catalogue: create a package with a price, add order-count tiers (a flat or percentage-off delivery discount), and activate or deactivate it. The same page has the **Requests** queue, where you approve a merchant's purchase request — which activates their bundle and credits their wallet — or reject it with a reason. Deleting a package that has been bought archives it instead, so existing bundles and their history survive.

### How do I approve and pay payouts?

**Payouts** (`/dashboard/payouts`) — review the Pending tab, approve or reject with a reason, then mark approved requests **Paid** once the transfer is sent. Bulk actions are available for a backlog. **COD Settlement** (`/dashboard/cod-settlement`) gives the platform-wide view of delivered parcels and their COD state, and **Delivery Performance** (`/dashboard/delivery-performance`) shows delivery metrics over time.

### How do I send announcements and read the logs?

**Announcements** (`/dashboard/announcements`) publishes targeted announcements, which appear as a banner and in each role's **Inbox**. **Audit Logs** (`/dashboard/audit-logs`) records who did what, and **Email Logs** (`/dashboard/email-logs`) shows outgoing message history and delivery state. **Support** (`/dashboard/support`) is where you answer tickets raised by any role.
