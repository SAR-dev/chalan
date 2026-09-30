import "dotenv/config"

import { expect, request as pwRequest, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { riderApplications, riderApplyForm } from "../selectors"

const BASE_URL = "http://localhost:3000"
const WAREHOUSE_ID = "WH-100001E"

async function loginContext(cred: { email: string; password: string }) {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL })
  const res = await ctx.post("/api/auth/sign-in/email", {
    data: { email: cred.email, password: cred.password },
  })
  expect(res.ok(), `sign-in ${cred.email} -> ${res.status()}`).toBeTruthy()
  return ctx
}

function rows(json: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(json)) return json
  const data = (json as { data?: unknown }).data
  return Array.isArray(data) ? data : []
}

// Unique per run: `rider_email_uniq` would reject a repeat, and the suite
// does not reseed between local runs.
const RUN = Date.now()
const APPLICANT = {
  name: `S69 Vehicle ${RUN}`,
  email: `s69-vehicle-${RUN}@test.com`,
  phone: "01712345678",
  zone: "Dhaka South",
  address: "12 Test Road, Dhanmondi",
  nidNumber: "9876543210",
  warehouseId: WAREHOUSE_ID,
  password: "s69-passw0rd",
}

// ─── S69. Rider vehicle through registration and approval ─────────────────────
// Two halves that have to line up: the registration form must collect the
// vehicle, and the approval form must show what it collected. Both used to be
// missing — and even once collected, the approval list never returned it, so
// the reviewer saw an empty field while the type claimed the value existed.
test.describe("S69. Rider vehicle registration and approval", () => {
  test("the registration form asks for a vehicle, and a plate only when it applies", async ({
    page,
  }) => {
    await page.goto("/apply/rider")
    await waitForAppReady(page)

    await expect(page.locator(riderApplyForm.vehicleType)).toBeVisible()
    // No plate up front: it depends on the vehicle chosen.
    await expect(page.locator(riderApplyForm.vehiclePlate)).toHaveCount(0)

    // A bicycle has no registration number, so it must never be asked for one.
    await page.locator(riderApplyForm.vehicleType).click()
    await page.locator(riderApplyForm.vehicleOption("BICYCLE")).click()
    await expect(page.locator(riderApplyForm.vehicleType)).toContainText(
      "Bicycle",
    )
    await expect(page.locator(riderApplyForm.vehiclePlate)).toHaveCount(0)

    // A motorbike does, and the field appears once it is chosen.
    await page.locator(riderApplyForm.vehicleType).click()
    await page.locator(riderApplyForm.vehicleOption("BIKE")).click()
    await expect(page.locator(riderApplyForm.vehicleType)).toContainText(
      "Motorbike",
    )
    await expect(page.locator(riderApplyForm.vehiclePlate)).toBeVisible()
  })

  test("a submitted vehicle reaches the reviewer and survives approval", async ({
    page,
  }) => {
    // Register with a vehicle, through the same public endpoint the form uses.
    const applicant = await pwRequest.newContext({ baseURL: BASE_URL })
    const register = await applicant.post("/api/rider-applications", {
      data: {
        ...APPLICANT,
        vehicleType: "BIKE",
        // Deliberately messy: the schema normalizes it, so the reviewer and
        // the assignment dialogs see one canonical plate.
        vehiclePlate: " dhaka 65-4321 ",
      },
    })
    expect(register.ok(), `register -> ${register.status()}`).toBeTruthy()
    await applicant.dispose()

    // The list endpoint has to carry the vehicle. `RiderApplication extends
    // Rider`, so the field type-checks whether or not the projection returns
    // it — an absent value here compiles and reads as "applicant said nothing".
    const admin = await loginContext(CREDS.superAdmin)
    const listed = await admin.get("/api/rider-applications?limit=100")
    expect(listed.ok()).toBeTruthy()
    const app = rows(await listed.json()).find(
      (r) => r.email === APPLICANT.email,
    )
    expect(app, "application was not returned by the list").toBeTruthy()
    expect(app?.vehicleType).toBe("BIKE")
    expect(app?.vehiclePlate).toBe("DHAKA65-4321")
    const appId = String(app?.id)
    await admin.dispose()

    // Open it in the review UI.
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/rider-applications")
    await waitForAppReady(page)
    await page.locator(riderApplications.search).fill(APPLICANT.name)

    await page.locator(riderApplications.viewButton(appId)).click()
    await page.locator(riderApplications.openApprove).click()

    // The reviewer sees the submitted values rather than empty inputs, and the
    // note makes it explicit where they came from.
    await expect(page.locator(riderApplications.vehicleValue)).toContainText(
      "Motorbike",
    )
    await expect(page.locator(riderApplications.vehiclePlate)).toHaveValue(
      "DHAKA65-4321",
    )
    await expect(page.locator(riderApplications.submittedNote)).toBeVisible()

    // Wait on the approve response rather than on a load-state heuristic:
    // `waitForAppReady` can resolve before the PATCH even starts, and reading
    // the record then reports PENDING for a decision that is still in flight.
    const approving = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/rider-applications/${appId}/approve`) &&
        r.request().method() === "PATCH",
      { timeout: 20_000 },
    )
    await page.locator(riderApplications.confirmApprove).click()
    const approval = await approving
    expect(approval.ok(), `approve -> ${approval.status()}`).toBeTruthy()

    // Approval used to write `null` over these: the form opened blank and sent
    // `vehicleType || null`. Verifying the record afterwards is the whole point.
    const after = await loginContext(CREDS.superAdmin)
    const approved = await after.get("/api/rider-applications?limit=100")
    expect(approved.ok()).toBeTruthy()
    const row = rows(await approved.json()).find((r) => r.id === appId)
    expect(row, "approved application disappeared").toBeTruthy()
    // Approving makes the applicant an active rider, not a rider with status
    // "APPROVED" — the queue's own statuses are PENDING/ACTIVE/REJECTED.
    expect(row?.status).toBe("ACTIVE")
    // The real assertion: approval must not blank what the applicant submitted.
    expect(row?.vehicleType).toBe("BIKE")
    expect(row?.vehiclePlate).toBe("DHAKA65-4321")
    await after.dispose()
  })
})
