import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test"
import { CREDS, login } from "../helpers"
import { users } from "../selectors"

const MERCHANT2 = "merchant2@email.com"
const MERCHANT5 = "merchant5@email.com"
const ORIGINAL_PASSWORD = "12qwaszx"
const TEMP_PASSWORD = "TempReset12345"
const SITE_ORIGIN = "http://localhost:3000"

async function searchUsers(page: Page, term: string) {
  await page.locator(users.search).fill(term)
  await expect(page.locator(users.actions)).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator(users.table)).toContainText(term)
}

async function openRowActions(page: Page) {
  await page.locator(users.actions).click()
}

function signIn(request: APIRequestContext, email: string, password: string) {
  return request.post("/api/auth/sign-in/email", {
    headers: { origin: SITE_ORIGIN },
    data: { email, password },
  })
}

async function findUserId(
  request: APIRequestContext,
  email: string,
): Promise<string | null> {
  const res = await request.get(
    `/api/admin/users?q=${encodeURIComponent(email)}`,
  )
  if (!res.ok()) return null
  const body = (await res.json()) as {
    data?: Array<{ id: string; email: string }>
  }
  return body.data?.find((u) => u.email === email)?.id ?? null
}

async function restoreState(
  request: APIRequestContext,
  options: { resetPasswordFor?: string; unbanEmail?: string },
) {
  try {
    const adminSignIn = await signIn(
      request,
      CREDS.superAdmin.email,
      CREDS.superAdmin.password,
    )
    if (!adminSignIn.ok()) return
    if (options.resetPasswordFor) {
      const id = await findUserId(request, options.resetPasswordFor)
      if (id) {
        await request.patch(`/api/admin/users/${id}/password`, {
          data: { password: ORIGINAL_PASSWORD },
        })
      }
    }
    if (options.unbanEmail) {
      const id = await findUserId(request, options.unbanEmail)
      if (id) {
        await request.patch(`/api/admin/users/${id}/unban`)
      }
    }
  } catch {
    // Cleanup is best effort — the next run reseeds the database anyway.
  }
}

test.describe("0901. User management", () => {
  test("admin can reset a password and ban/unban a user", async ({
    page,
    request,
  }) => {
    let passwordMutated = false
    let merchantBanned = false

    try {
      await login(page, CREDS.superAdmin)
      await page.goto("/dashboard/users")
      await expect(page.locator(users.table)).toBeVisible()

      await searchUsers(page, MERCHANT2)
      await openRowActions(page)
      await page.locator(users.resetOpen).click()
      await page.locator(users.resetPassword).fill(TEMP_PASSWORD)
      await page.locator(users.resetConfirm).fill(TEMP_PASSWORD)
      await page.locator(users.resetSubmit).click()
      await expect(page.locator(users.resetPassword)).toBeHidden()
      passwordMutated = true

      await login(page, { email: MERCHANT2, password: TEMP_PASSWORD })

      await login(page, CREDS.superAdmin)
      await page.goto("/dashboard/users")
      await searchUsers(page, MERCHANT2)
      await openRowActions(page)
      await page.locator(users.resetOpen).click()
      await page.locator(users.resetPassword).fill(ORIGINAL_PASSWORD)
      await page.locator(users.resetConfirm).fill(ORIGINAL_PASSWORD)
      await page.locator(users.resetSubmit).click()
      await expect(page.locator(users.resetPassword)).toBeHidden()

      const restored = await signIn(request, MERCHANT2, ORIGINAL_PASSWORD)
      expect(restored.ok()).toBe(true)
      passwordMutated = false

      await searchUsers(page, MERCHANT5)
      await openRowActions(page)
      await page.locator(users.banOpen).click()
      await page.locator(users.banReason).fill("Suspended merchant account")
      await page.locator(users.banSubmit).click()
      await expect(page.locator(users.banReason)).toBeHidden()
      merchantBanned = true
      await expect(page.locator(users.table)).toContainText("Banned")

      const denied = await signIn(request, MERCHANT5, ORIGINAL_PASSWORD)
      expect(denied.status()).toBe(403)

      await openRowActions(page)
      await page.locator(users.unban).click()
      merchantBanned = false
      await expect(page.locator(users.table)).not.toContainText("Banned")

      const allowed = await signIn(request, MERCHANT5, ORIGINAL_PASSWORD)
      expect(allowed.ok()).toBe(true)
    } finally {
      if (passwordMutated || merchantBanned) {
        await restoreState(request, {
          resetPasswordFor: passwordMutated ? MERCHANT2 : undefined,
          unbanEmail: merchantBanned ? MERCHANT5 : undefined,
        })
      }
    }
  })
})
