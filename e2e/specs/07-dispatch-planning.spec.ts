import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { autoAssign, dialog, rider, warehouse } from "../selectors"

/**
 * Route planning and auto-assignment.
 *
 * Two audiences: a warehouse admin proposing a rider split for parcels sitting
 * in the hub, and a delivery rider reading the suggested drop order for what
 * they were already given. Both are read-first — the proposal is applied through
 * the ordinary bulk-dispatch endpoint, and the run sheet is a pure function of
 * the parcels on the rider's run.
 */

test.describe("S74. Route planning and auto-assignment", () => {
  test("warehouse admin previews a split that names every rider's load", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/dispatch")
    await waitForAppReady(page)

    await page.locator(warehouse.tabDelivery).click()
    await expect(page.locator(warehouse.dispatchDeliveryTable)).toBeVisible({
      timeout: 15_000,
    })

    // Select-all, not a row click: the planner reads the whole selection, so a
    // single-parcel selection would exercise a different path than the UI
    // invites. `count()` does not auto-wait, so wait for a row to exist before
    // reading how many there are.
    const rows = page.locator(warehouse.selectRow)
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(1)
    await page.locator(warehouse.selectAll).check()
    await page.locator(warehouse.bulkAutoAssign).click()
    // Bulk actions confirm before running — that step belongs to the DataTable,
    // not to this feature, but the spec still has to walk through it.
    await page.locator(dialog.confirmButton).click()

    const form = page.locator(dialog.formDialog)
    await expect(form).toBeVisible({ timeout: 15_000 })
    // An error here means the endpoint rejected the whole selection; an empty
    // plan means it accepted it and found nobody to give it to. Both are
    // failures for a hub with delivery riders on shift.
    await expect(page.locator(autoAssign.error)).toHaveCount(0)
    await expect(page.locator(autoAssign.empty)).toHaveCount(0)
    await expect(page.locator(autoAssign.confirm)).toBeEnabled({
      timeout: 15_000,
    })

    // The plan must account for every selected parcel and must not hand the
    // whole batch to one rider. A planner that returned the first eligible
    // rider would still produce a complete plan, so completeness alone proves
    // nothing — the spread is the property under test.
    const blocks = page.locator(autoAssign.riderBlockPrefix)
    await expect(blocks.first()).toBeVisible()
    expect(await blocks.count()).toBeGreaterThan(1)

    const tallies = (
      await page.locator(autoAssign.riderCountPrefix).allInnerTexts()
    ).map((text) => Number.parseInt(text, 10))
    expect(tallies.every((n) => Number.isInteger(n))).toBe(true)
    expect(tallies.reduce((sum, n) => sum + n, 0)).toBe(rowCount)

    // Every proposed rider is shown with the load the choice was made on, so a
    // dispatcher can audit the suggestion instead of trusting it.
    await expect(blocks.first()).toContainText("already in hand")
    await expect(form).toContainText("Fewest active parcels")
  })

  test("planning is offered only where a dispatch would be legal", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/dispatch")
    await waitForAppReady(page)

    // Pickup parcels are assigned before they reach a hub, so offering a
    // delivery-planning action on that tab would propose dispatches the state
    // machine would refuse.
    await expect(page.locator(warehouse.dispatchPickupTable)).toBeVisible({
      timeout: 15_000,
    })
    await page.locator(warehouse.selectAll).check()
    await expect(page.locator(warehouse.bulkAssignDeliveryRider)).toHaveCount(0)
    await expect(page.locator(warehouse.bulkAutoAssign)).toHaveCount(0)
  })

  test("rider sees the drop order the server sequenced", async ({ page }) => {
    await login(page, CREDS.deliveryRider)
    await page.goto("/rider/delivery")
    await waitForAppReady(page)

    const card = page.locator(rider.runSheet)
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card).toContainText("Suggested run order")

    // The server's own answer, read through the same session the page used.
    // Comparing against it is the only way to catch a card that re-sorts: rows
    // numbered 1..N prove the card can count, not that it kept the order it was
    // handed, and the order *is* the advice.
    const me = await (await page.request.get("/api/users/me")).json()
    const sheet = await (
      await page.request.get(`/api/riders/${me.riderId}/run-sheet`)
    ).json()
    expect(sheet.stops.length).toBeGreaterThan(1)

    const parcels = await page
      .locator(rider.runSheetParcelPrefix)
      .allInnerTexts()
    expect(parcels.map((p) => p.trim())).toEqual(
      sheet.stops.map((s: { orderId: string }) => s.orderId),
    )

    // Sequence numbers run 1..N with no gaps, so "stop 3" means one thing.
    const stops = page.locator(rider.runSheetStopPrefix)
    expect(await stops.count()).toBe(sheet.stops.length)
    for (let i = 0; i < sheet.stops.length; i++) {
      await expect(stops.nth(i)).toHaveAttribute(
        "data-testid",
        `run-sheet-stop-${i + 1}`,
      )
    }

    // One destination line per stop, and never blank — a rider planning a route
    // needs every row to say where it goes. Which city it names is asserted in
    // the route spec: no seeded order carries a `deliveryCityId`, so from here
    // the honest claim is "a destination is shown", not "the right one".
    const destinations = await page
      .locator(rider.runSheetDestinationPrefix)
      .allInnerTexts()
    expect(destinations).toHaveLength(sheet.stops.length)
    for (const destination of destinations) {
      expect(destination.trim()).not.toBe("")
    }
  })
})
