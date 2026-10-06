import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { autoAssign, dialog, ongoing, rider } from "../selectors"

/**
 * Route planning and auto-assignment.
 *
 * Two audiences: a warehouse admin proposing a rider split for parcels sitting
 * in the hub, and a delivery rider reading the suggested drop order for what
 * they were already given. Both are read-first — the proposal is applied through
 * the ordinary bulk-dispatch endpoint, and the run sheet is a pure function of
 * the parcels on the rider's run.
 *
 * The admin half moved from the retired dispatch desk to the Ongoing board's
 * toolbar, which plans over every parcel sitting in the warehouse rather than
 * over a row selection. There is no select-all step any more: the set is defined
 * by the parcels' state, so a spec cannot accidentally narrow it.
 */

test.describe("0701. Route planning and auto-assignment", () => {
  test("warehouse admin previews a split that names every rider's load", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)

    // The plan covers the In-warehouse lane in full, so that lane's card count
    // is the number the proposal has to add up to. Read it from the board rather
    // than hard-coding the seed, which would make the assertion a tautology.
    await expect(page.locator(ongoing.heldColumn)).toBeVisible({
      timeout: 15_000,
    })
    const heldCount = Number.parseInt(
      await page.locator(ongoing.heldColumnCount).innerText(),
      10,
    )
    expect(heldCount).toBeGreaterThan(1)

    await expect(page.locator(ongoing.autoAssign)).toBeVisible()
    await page.locator(ongoing.autoAssign).click()

    const form = page.locator(dialog.formDialog)
    await expect(form).toBeVisible({ timeout: 15_000 })
    // An error here means the endpoint rejected the whole set; an empty plan
    // means it accepted it and found nobody to give it to. Both are failures for
    // a hub with delivery riders on shift.
    await expect(page.locator(autoAssign.error)).toHaveCount(0)
    await expect(page.locator(autoAssign.empty)).toHaveCount(0)
    await expect(page.locator(autoAssign.confirm)).toBeEnabled({
      timeout: 15_000,
    })

    // The plan must account for every held parcel and must not hand the whole
    // batch to one rider. A planner that returned the first eligible rider would
    // still produce a complete plan, so completeness alone proves nothing — the
    // spread is the property under test.
    const blocks = page.locator(autoAssign.riderBlockPrefix)
    await expect(blocks.first()).toBeVisible()
    expect(await blocks.count()).toBeGreaterThan(1)

    const tallies = (
      await page.locator(autoAssign.riderCountPrefix).allInnerTexts()
    ).map((text) => Number.parseInt(text, 10))
    expect(tallies.every((n) => Number.isInteger(n))).toBe(true)
    expect(tallies.reduce((sum, n) => sum + n, 0)).toBe(heldCount)

    // Every proposed rider is shown with the load the choice was made on, so a
    // dispatcher can audit the suggestion instead of trusting it.
    await expect(blocks.first()).toContainText("already in hand")
    await expect(form).toContainText("Fewest active parcels")
  })

  test("planning is offered only where a dispatch would be legal", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)

    await expect(page.locator(ongoing.board)).toBeVisible({ timeout: 15_000 })

    // Dispatch is a per-card action, offered only on a parcel that has actually
    // reached the hub. A card anywhere else on the board must not carry one —
    // the button is what the API would refuse, so a card that offers it is
    // promising something the state machine will not do.
    const dispatchable = await page.locator(ongoing.dispatchPrefix).count()
    const held = await page
      .locator(ongoing.heldColumn)
      .locator(ongoing.cardPrefix)
      .count()
    expect(dispatchable).toBe(held)

    // And the cancel action lives on the approval queue, never here.
    await expect(page.locator(ongoing.cancelPrefix)).toHaveCount(0)
  })

  test("rider sees the drop order, batched by zone, that the server sequenced", async ({
    page,
  }) => {
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

    // Every stop names the city the server resolved for it. The fallback text is
    // asserted against on purpose: a parcel whose order carries no
    // `deliveryCityId` renders as "Destination not set", which is how a run
    // sheet quietly degenerates into an unzoned list.
    const destinations = (
      await page.locator(rider.runSheetDestinationPrefix).allInnerTexts()
    ).map((text) => text.trim())
    expect(destinations).toEqual(
      sheet.stops.map((s: { cityName: string | null }) => s.cityName),
    )
    expect(destinations).not.toContain("Destination not set")

    // Same, for the zone — the field the sheet is grouped by. Rendered zone per
    // stop, in the server's order.
    const zones = (
      await page.locator(rider.runSheetZonePrefix).allInnerTexts()
    ).map((text) => text.trim())
    expect(zones).toHaveLength(sheet.stops.length)
    expect(zones).toEqual(
      sheet.stops.map((s: { zoneName: string | null }) => s.zoneName),
    )

    // The run sheet's actual claim: a zone is served in one run. Reading the
    // zones in sequence and checking no zone comes back after another has been
    // served is the only assertion that distinguishes "sorted by zone" from
    // "happens to contain two zones" — which is what the card would look like if
    // grouping were dropped while the ordering stayed.
    const served = new Set<string>()
    let current: string | null = null
    for (const zone of zones) {
      if (zone === current) continue
      expect(
        served.has(zone),
        `zone "${zone}" is served in two separate runs`,
      ).toBe(false)
      served.add(zone)
      current = zone
    }

    // More than one zone, so the invariant above was not checked against a
    // single run that trivially satisfies it. The seeded rider's run spans
    // several zones, because every seeded order names a real delivery city.
    expect(served.size).toBeGreaterThan(1)
    // And the card's own accounting agrees with the planner's: one more area
    // than crossings, always.
    expect(served.size).toBe(sheet.zoneCount)
    expect(served.size - 1).toBe(sheet.zoneHops)
  })
})
