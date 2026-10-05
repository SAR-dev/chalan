import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { riderPickup } from "../selectors"

// ─── S80. Rider goes out for pickup ──────────────────────────────────────────

/**
 * The collection leg got its own state, mirroring Out-for-delivery on the
 * delivery leg:
 *
 *   Assigned (APPROVED) → Out for pickup → Picked up → … → Out for delivery
 *
 * Two rules, and this spec pins both:
 *
 *   1. The rider must click "Out for pickup" before they can start the pickup.
 *   2. `picked-up` is refused until the status IS Out for pickup.
 *
 * Rule 2 is asserted against the API rather than through the UI. The UI only
 * hides the button, and a hidden button proves nothing about a guard — if the
 * server accepted a pickup from APPROVED, everything on screen would still look
 * correct while the state machine had been walked straight past.
 *
 * Seeded facts this leans on (`seed-content/orders.ts`, 100 orders, index i →
 * `ORD-{100001+i}E`): the first 8 are PENDING, the next 4 APPROVED, so **i = 8
 * is an APPROVED parcel with no pickup rider yet** — exactly the state the
 * feature gates. Assigning it here rather than relying on a seeded assignment
 * is deliberate: it makes this test independent of how the seed distributes
 * riders across its OUT_FOR_PICKUP rows.
 */
const TARGET = "ORD-100009E"
const RIDER_ID = "RID-100001E" // rider1, seeded PICKUP-only

test.describe("S80. Rider goes out for pickup", () => {
  test("a rider must go out for pickup before collecting", async ({ page }) => {
    // 1. Warehouse admin hands the APPROVED parcel to a pickup rider.
    await login(page, CREDS.warehouseAdmin)
    const assigned = await page.request.patch(
      `/api/orders/${TARGET}/assign-pickup-rider`,
      { data: { riderId: RIDER_ID } },
    )
    expect(assigned.status()).toBe(200)

    // 2. The rider is offered the *start*, and nothing that would collect it.
    await login(page, CREDS.rider)
    await page.goto("/rider/pickup")
    await waitForAppReady(page)
    await expect(page.locator(riderPickup.startPickup(TARGET))).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator(riderPickup.pickedUp(TARGET))).toHaveCount(0)

    // 3. Rule 2, at the server. Same shape the UI implies, but independent of it.
    const blocked = await page.request.patch(
      `/api/orders/${TARGET}/picked-up`,
      {
        data: { proofRefs: ["/uploads/e2e-proof.png"] },
      },
    )
    expect(blocked.status()).toBe(400)
    expect(await blocked.json()).toEqual({
      error: "Only OUT_FOR_PICKUP orders can be picked up.",
    })

    // 4. Declaring the trip is what opens the gate.
    await page.locator(riderPickup.startPickup(TARGET)).click()
    await expect(page.locator(riderPickup.confirmStart)).toBeVisible()
    await page.locator(riderPickup.confirmStart).click()

    // The two buttons swap: the start step is spent, collection is now offered.
    await expect(page.locator(riderPickup.pickedUp(TARGET))).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator(riderPickup.startPickup(TARGET))).toHaveCount(0)

    // 5. The warehouse sees it — the board has a lane for the new status and
    //    the parcel is filed under it, rather than under its pickup rider's
    //    Unassigned column.
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)
    const column = page.locator("[data-testid='kanban-column-OUT_FOR_PICKUP']")
    await expect(column).toBeVisible({ timeout: 15_000 })
    await expect(
      column.locator(`[data-testid='kanban-card-${TARGET}']`),
    ).toBeVisible()

    // …and it counts as work still to do, so it is tiled on the homepage.
    await page.goto("/warehouse")
    await expect(page.getByText("Out for pickup")).toBeVisible()
  })

  test("the identical request succeeds once out for pickup", async ({
    page,
  }) => {
    // Test 1 left ORD-100009E at OUT_FOR_PICKUP. This sends exactly the payload
    // the server refused a moment ago — same proof, same rider, same endpoint —
    // and it is now accepted. The only thing that changed is the status, which
    // is precisely what the gate claims to gate on.
    //
    // Completing the pickup from the UI is deliberately not done here: the
    // dialog requires a proof photo upload, and driving an upload would make
    // this spec depend on storage + a signed upload token on top of the state
    // machine it is meant to be checking. The transition itself is pinned in
    // `transitions.spec.ts`.
    await login(page, CREDS.rider)
    const res = await page.request.patch(`/api/orders/${TARGET}/picked-up`, {
      data: { proofRefs: ["/uploads/e2e-proof.png"] },
    })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ status: "PICKED_UP" })

    // …and having left the board's ownership of the parcel mid-flight, the
    // card follows it: PICKED_UP rather than lingering in Out-for-pickup.
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)
    await expect(
      page
        .locator("[data-testid='kanban-column-PICKED_UP']")
        .locator(`[data-testid='kanban-card-${TARGET}']`),
    ).toBeVisible({ timeout: 15_000 })
  })
})
