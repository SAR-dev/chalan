import "dotenv/config"

import { expect, type Page, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS, login, toast, waitForAppReady } from "../helpers"
import {
  activated,
  activation,
  auth,
  dialog,
  merchantQuota,
  moderators,
  nav,
  orders,
  team,
} from "../selectors"

/**
 * Read the latest activation email for an address straight from Postgres —
 * the raw token only ever exists in that email (DB stores its hash).
 */
async function newestActivationEmail(
  emailAddress: string,
): Promise<{ id: string; url: string | null } | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — .env failed to load")
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const res = await client.query(
      `SELECT id, "textBody" FROM email_log
       WHERE "to" = $1 AND subject LIKE 'Activate%'
       ORDER BY "createdAt" DESC LIMIT 1`,
      [emailAddress],
    )
    const row = res.rows[0] as
      | { id: string; textBody: string | null }
      | undefined
    if (!row) return null
    const match = (row.textBody ?? "").match(
      /https?:\/\/\S+\/activate\?token=\S+/,
    )
    return { id: row.id, url: match?.[0] ?? null }
  } finally {
    await client.end()
  }
}

/**
 * Wait for a usable activation link, optionally one *newer* than `notBeforeId`.
 *
 * The mailer retries SMTP before logging the FAILED row, so a just-sent invite
 * is not readable the instant it is sent — hence the poll.
 *
 * `notBeforeId` matters after a resend. `api/team/[id]/resend-activation`
 * rotates the token ("overwrites the previous token so the old link dies"), but
 * the replacement only shows up in `email_log` once the outbox drain actually
 * attempts that row. Asking for "the newest email" without saying *which* email
 * is newest therefore races the drain and hands back the link the resend just
 * killed, which surfaces as "This activation link is invalid or has expired".
 * Passing the id seen before the resend pins the answer to the replacement.
 */
async function latestActivationUrl(
  emailAddress: string,
  notBeforeId?: string,
): Promise<string> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const row = await newestActivationEmail(emailAddress)
    if (row?.url && row.id !== notBeforeId) return row.url
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `No activation link ${notBeforeId ? `newer than ${notBeforeId} ` : ""}` +
      `for ${emailAddress} within 20s`,
  )
}

/** Email of the newest PENDING moderator created by this suite (test1). */
async function latestPendingModeratorEmail(): Promise<string> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set - .env failed to load")
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const res = await client.query(
      `SELECT u.email FROM profile p
       JOIN "user" u ON u.id = p."userId"
       WHERE p."isModerator" AND p."activatedAt" IS NULL
         AND u.email LIKE 'e2e-moderator-%'
         AND u.email NOT LIKE 'e2e-moderator2-%'
       ORDER BY p."createdAt" DESC LIMIT 1`,
    )
    const email = res.rows[0]?.email as string | undefined
    if (!email) throw new Error("No pending e2e moderator found")
    return email
  } finally {
    await client.end()
  }
}

/** Email of the newest ACTIVATED moderator created by this suite. */
async function latestActivatedModeratorEmail(): Promise<string> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set - .env failed to load")
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const res = await client.query(
      `SELECT u.email FROM profile p
       JOIN "user" u ON u.id = p."userId"
       WHERE p."isModerator" AND p."activatedAt" IS NOT NULL
         AND u.email LIKE 'e2e-moderator-%'
         AND u.email NOT LIKE 'e2e-moderator2-%'
       ORDER BY p."activatedAt" DESC LIMIT 1`,
    )
    const email = res.rows[0]?.email as string | undefined
    if (!email) throw new Error("No activated e2e moderator found")
    return email
  } finally {
    await client.end()
  }
}
const stamp = Date.now()
const MOD_EMAIL = `e2e-moderator-${stamp}@test.com`
const MOD_PASSWORD = "TempMod123!" // owner-chosen temporary password
const MOD_PASSWORD2 = "RealMod456!" // set on activation
const WA_EMAIL = `e2e-warehouse-admin-${stamp}@test.com`
const WA_PASSWORD = "TempWa123!"
const WA_PASSWORD2 = "RealWa456!"
const QUOTA_MERCHANT_ID = "MER-100001E" // seeded merchant1

const PICKUP = "Merchant 1 Pickup — 100 Business Street"
const CITY = "Dhaka"

const HEADER_CELLS = [
  "pickup_location",
  "recipient_name",
  "recipient_phone",
  "delivery_city",
  "delivery_address",
  "parcel_weight_kg",
  "product_cost",
  "delivery_type",
  "delivery_map_link",
  "merchant_note",
]

function csvFile(name: string, recipient: string) {
  const row = [
    PICKUP,
    recipient,
    "01712345678",
    CITY,
    `${stamp} Mod Street Dhaka`,
    "1",
    "500",
    "STANDARD",
    "",
    "e2e moderator order",
  ]
  const csv = [HEADER_CELLS, row].map((cells) => cells.join(",")).join("\r\n")
  return {
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  }
}

async function activateFromEmail(
  page: Page,
  email: string,
  password: string,
  notBeforeId?: string,
) {
  const url = await latestActivationUrl(email, notBeforeId)
  await page.goto(url)
  await page.locator(activation.password).fill(password)
  await page.locator(activation.confirm).fill(password)
  await page.locator(activation.submit).click()
  // Activation signs the visitor out of whatever session they had and lands on
  // the /activated welcome page — not straight on /login.
  await page.waitForURL(/\/activated$/, { timeout: 15_000 })
  await expect(page.locator(activated.title)).toBeVisible()
}

// 1201. Merchant moderator accounts
test.describe("1201. Merchant moderator accounts", () => {
  test("admin sets quota and the owner invites moderators", async ({
    page,
  }) => {
    // Admin caps this merchant at 2 moderator slots.
    await login(page, CREDS.superAdmin)
    await page.goto(`/dashboard/merchants/${QUOTA_MERCHANT_ID}`)
    await waitForAppReady(page)
    await page.locator(merchantQuota.input).fill("2")
    await page.locator(merchantQuota.save).click()
    await expect(toast(page, "Moderator quota set to 2.")).toBeVisible()

    // Owner invites the first moderator with Orders + New Order only.
    await login(page, CREDS.merchant)
    await page.goto("/merchant/settings")
    await waitForAppReady(page)
    await expect(page.locator(moderators.card)).toBeVisible()

    await page.locator(moderators.add).click()
    await page.locator(moderators.nameInput).fill("E2E Moderator")
    await page.locator(moderators.emailInput).fill(MOD_EMAIL)
    await page.locator(moderators.passwordInput).fill(MOD_PASSWORD)
    // Default grant = everything; keep Orders + New Order only.
    for (const slug of [
      "merchant-finance",
      "merchant-pricing",
      "merchant-verify-nid",
      "merchant-announcements",
      "merchant-support",
    ]) {
      await page.locator(moderators.grant(slug)).uncheck()
    }
    await page.locator(moderators.createSubmit).click()
    await expect(
      toast(page, `Activation email sent to ${MOD_EMAIL}`),
    ).toBeVisible()
    await expect(
      page.locator(moderators.row).filter({ hasText: MOD_EMAIL }),
    ).toContainText("Pending")

    // Second moderator fills the quota (2/2) — the Add button locks.
    await page.locator(moderators.add).click()
    await page.locator(moderators.nameInput).fill("E2E Moderator Two")
    await page
      .locator(moderators.emailInput)
      .fill(`e2e-moderator2-${stamp}@test.com`)
    await page.locator(moderators.passwordInput).fill(MOD_PASSWORD)
    await page.locator(moderators.createSubmit).click()
    await expect(
      toast(page, "Activation email sent to e2e-moderator2-"),
    ).toBeVisible()
    await expect(page.locator(moderators.add)).toBeDisabled()
    await expect(page.locator(moderators.quotaFull)).toBeVisible()
    await expect(page.locator(moderators.quotaFull)).toContainText("2/2")
  })

  test("invitee activates, gets granted nav only, and can create orders", async ({
    page,
  }) => {
    const modEmail = await latestPendingModeratorEmail()
    await activateFromEmail(page, modEmail, MOD_PASSWORD2)
    // The owner was still signed in when the invitee activated: that session
    // must be gone, so an app URL bounces to /login.
    await page.goto("/merchant/orders")
    await page.waitForURL(/\/login/, { timeout: 15_000 })
    // Drop the ?next= the redirect added so the sign-in below lands on the
    // moderator's own home page.
    await page.goto("/login")

    // Sign in with the password they chose on activation.
    await login(page, { email: modEmail, password: MOD_PASSWORD2 })

    // Granted nav only: Orders + New Order (+ always-on Dashboard/Account/Help).
    await expect(page.locator(nav.sidebarLink("Orders")).first()).toBeVisible()
    await expect(
      page.locator(nav.sidebarLink("New Order")).first(),
    ).toBeVisible()
    await expect(page.locator(nav.sidebarLink("Finance"))).toHaveCount(0)
    await expect(
      page.locator(nav.sidebarLink("Business Settings")),
    ).toHaveCount(0)
    await expect(page.locator(nav.sidebarLink("Verification"))).toHaveCount(0)

    // Non-granted routes redirect to the dashboard.
    await page.goto("/merchant/finance")
    await page.waitForURL(/\/merchant$/, { timeout: 15_000 })
    await page.goto("/merchant/settings")
    await page.waitForURL(/\/merchant$/, { timeout: 15_000 })

    // The moderator can create an order (New Order grant → CSV import).
    await page.goto("/merchant/orders")
    await waitForAppReady(page)
    await page.locator(orders.bulkImportOpen).click()
    await page.waitForURL("**/merchant/orders/import")
    const recipient = `E2E Mod Order ${stamp}`
    await page
      .locator(orders.bulkImportFile)
      .setInputFiles(csvFile("moderator-import.csv", recipient))
    await expect(page.locator(orders.bulkImportConfirm)).toBeEnabled()
    await page.locator(orders.bulkImportConfirm).click()
    await expect(toast(page, "1 order created")).toBeVisible({
      timeout: 15_000,
    })
    await page.waitForURL("**/merchant/orders")
    await page.locator(orders.merchantOrdersSearch).fill("E2E Mod Order")
    await expect(
      page.locator(orders.merchantTable).getByText(recipient).first(),
    ).toBeVisible({
      timeout: 15_000,
    })
  })

  test("owner deactivates the moderator and their login is rejected", async ({
    page,
  }) => {
    const modEmail = await latestActivatedModeratorEmail()
    await login(page, CREDS.merchant)
    await page.goto("/merchant/settings")
    await waitForAppReady(page)

    const row = page.locator(moderators.row).filter({ hasText: modEmail })
    await row.locator(moderators.deactivate).click()
    await page.locator(dialog.confirmButton).click()
    await expect(toast(page, "deactivated")).toBeVisible()
    await expect(row).toContainText("Deactivated")

    // Their credentials no longer open a session the app will use.
    await page.context().clearCookies()
    await page.goto("/login")
    await page.locator("[data-testid='login-email']").fill(modEmail)
    await page.locator("[data-testid='login-password']").fill(MOD_PASSWORD2)
    await page.locator("[data-testid='login-submit']").click()
    await expect(page.locator(auth.loginError)).toContainText(/deactivated/i, {
      timeout: 15_000,
    })
  })
})

// 1202. Warehouse admin activation
test.describe("1202. Warehouse admin activation", () => {
  test("admin creates an invite, resends it, and the invitee activates", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/team")
    await waitForAppReady(page)

    // Create a Warehouse Admin with a temporary password.
    await page.locator(team.createOpen).click()
    await page.locator(team.nameInput).fill("E2E Warehouse Admin")
    await page.locator(team.emailInput).fill(WA_EMAIL)
    await page.locator(team.phoneInput).fill(`017${String(stamp).slice(-8)}`)
    await page.locator(team.passwordInput).fill(WA_PASSWORD)
    await page.locator(team.createSubmit).click()
    await expect(
      toast(page, "Warehouse Admin created. Activation email sent."),
    ).toBeVisible()

    const pendingRow = page.locator("tr").filter({ hasText: WA_EMAIL })
    await expect(pendingRow.locator(team.pendingBadge)).toBeVisible()

    // Snapshot the invite's email *before* the resend. The resend rotates the
    // token, so the activation below must wait for the replacement mail rather
    // than settle for whichever link happens to be newest when it looks.
    const inviteEmail = await newestActivationEmail(WA_EMAIL)

    // Owner/admin re-sends before the invitee acts on it.
    await pendingRow.locator(team.resend).click()
    await expect(toast(page, "Activation email resent")).toBeVisible()

    // Invitee activates from the *resent* email and signs in.
    await activateFromEmail(page, WA_EMAIL, WA_PASSWORD2, inviteEmail?.id)
    // The super admin who created the invite was signed in during activation —
    // activation must have signed them out too.
    await expect(page.locator(activated.message)).toBeVisible()
    await page.goto("/dashboard")
    await page.waitForURL(/\/login/, { timeout: 15_000 })
    await page.goto("/login")
    await login(page, { email: WA_EMAIL, password: WA_PASSWORD2 })
    await page.waitForURL(/\/warehouse/, { timeout: 15_000 })
    // Asserts the new invitee landed on the warehouse portal and can see its
    // nav, not that a particular page is called something. "Overview" is the
    // landing item (it used to be "Intake queue" back when the homepage was the
    // intake queue); matching on the label would make this test a rename alarm
    // for a nav change that has nothing to do with activation.
    await expect(
      page.locator(nav.sidebarLink("Overview")).first(),
    ).toBeVisible()

    // The roster now shows an active member (no Pending/resend anymore).
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/team")
    await waitForAppReady(page)
    const row = page.locator("tr").filter({ hasText: WA_EMAIL })
    await expect(row.locator(team.pendingBadge)).toHaveCount(0)
  })
})
