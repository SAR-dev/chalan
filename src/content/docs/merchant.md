# Merchant guide

Step-by-step tasks for running your deliveries on {{APP_NAME}}. Open the merchant panel at **{{APP_URL}}/merchant** after signing in at **{{APP_URL}}/login**.

## 1. Register and verify your account

1. Go to **{{APP_URL}}/register** and enter your business name, owner name, email, phone, address, business type, and password.
2. Open the verification email and click the link. If it expired, use **Resend activation** on the login page.
3. Sign in — your account is **Pending** until a Super Admin approves it.
4. Open **Verification** (`/merchant/verify-nid`) and upload the **front** of your NID, the **back**, a **selfie holding your NID**, and your NID number, then submit.
5. Wait for the review on the platform's **Merchant Reviews** page. The status is shown on the same Verification page.
6. You can create orders once your account is **Active** and your NID is **verified**.

## 2. Set up your business profile and pickup locations

1. Open **Business Settings** (`/merchant/settings`).
2. Under **Business details**, keep your contact information current — it appears on pickups, labels, and emails.
3. Under **Pickup locations**, add each address riders should collect from. Every location is linked to a delivery city, which determines the warehouse (hub) that handles your parcels.
4. Save. New orders can then use these locations from the **pickup** dropdown.
5. **Delivery Cities** (`/merchant/delivery-cities`) lists every city the platform delivers to, grouped by its delivery zone. The platform sets it — check it before promising a destination.

## 3. Create an order

1. Go to **New Order** (`/merchant/orders/new`).
2. Select a **pickup location**.
3. Enter the **recipient name** and **recipient phone**.
4. Choose the **delivery city** and type the **delivery address** (add a map link if you have one).
5. Enter the **parcel weight** and **COD amount** (use 0 for prepaid parcels), plus an optional note for the rider.
6. Press **Add parcel** if you want to book several parcels in the same submission — charges update live as you type.
7. Confirm. Each parcel is created as a **Pending** order and appears in your Orders list.

> **Booking several parcels at once?** Use the **Import CSV** option on the New Order page (`/merchant/orders/import`) to upload a spreadsheet of parcels. The preview flags invalid rows so you can fix them before importing.

## 4. Follow the order lifecycle

1. Open **Orders** (`/merchant/orders`) and switch between the **Active**, **Pending**, **In progress**, **Issues**, and **All** tabs.
2. Search by tracking code, recipient, or city, and filter by date.
3. Click a row to open the order detail page (`/merchant/orders/<code>`) — it shows the status timeline, assigned riders, and proof photos.
4. Watch for these statuses: **Pending → Approved → Out for pickup → Picked up → In warehouse → In transit → Out for delivery → Delivered**, with **Failed attempt**, **Returned**, or **Cancelled** as the exception paths.
5. Cancel your own order from the detail page while it is still **Pending**, **Approved**, or **Out for pickup** (a reason is required). Once a rider has picked it up, only a platform admin can cancel it.

## 5. Share tracking with your customer

1. Copy the public link **{{APP_URL}}/track/&lt;code&gt;** from the order.
2. Anyone with the link sees the live status and timeline — no account needed.
3. Your customer can add a delivery note from that page, which the rider sees during the attempt.

## 6. Understand COD, fees, and your balance

1. **Delivery fee + COD fee** are charged when you create the order: a platform charge equal to both fees is recorded against your balance — nothing is invoiced upfront.
2. The **COD fee** is a percentage of the cash you collect (default 1%); your exact rate and all your rates are listed on **Pricing** (`/merchant/pricing`).
3. Use the **charge calculator** on the Pricing page to preview the fee for a weight and COD amount before you book.
4. When an order is marked **Delivered**, an earning credit of **COD amount − delivery fee − COD fee** is posted for it, so fees are settled out of your COD proceeds.
5. The warehouse must still **settle the COD** at the hub before those funds become payable (see next section).

## 7. Request a payout

1. Open **Finance** (`/merchant/finance`).
2. Check **Available for payout** — these are delivered orders whose COD has been settled at the warehouse.
3. Click **Request payout**, choose **bKash**, **Nagad**, **Rocket**, or **Bank transfer**, and enter the account details.
4. Submit. Your request is created as **Pending**; the platform approves it (**Approved**) or rejects it with a reason, then marks it **Paid**.
5. Track every request and its status in the **Payout requests** table on the same page.

## 8. Manage announcements and support

1. Open **Inbox** (`/merchant/announcements`) for platform announcements. Unread ones raise a count on the **announcements** icon at the right of the top bar, which links straight to the feed; opening the feed clears the count.
2. Open **Support** (`/merchant/support`) to raise a ticket about an order, a charge, or your account, and to follow the replies on it.
3. Open **Account** (`/merchant/account`) to update your name and change your password (current password + at least 8 characters).
