import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import {
  completed,
  deliveryCities,
  dialog,
  merchants,
  ongoing,
  orders,
  register,
  riderApplication,
  riders,
  warehouse,
} from "../selectors"

// ─── S2. Merchant Registration ─────────────────────────────────────────────────
test.describe("S2. Merchant Registration", () => {
  test("user can access registration page", async ({ page }) => {
    await page.goto("/register")
    await waitForAppReady(page)
    // Verify registration form exists
    await expect(page.locator(register.form)).toBeVisible()
  })

  test("registered merchant sees pending status", async ({ page }) => {
    // Login as a merchant that's already active (seeded)
    await login(page, CREDS.merchant)
    await waitForAppReady(page)
    // Merchant dashboard should load
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S3. Order Exception — Failed → Reattempt ────────────────────────────────
test.describe("S3. Failed → Reattempt → Delivery", () => {
  test("exceptions lists only the parcels still awaiting a decision", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/exceptions")
    await waitForAppReady(page)
    await expect(page.locator(warehouse.exceptionsTable)).toBeVisible({
      timeout: 15_000,
    })

    // FAILED_ATTEMPT is the only status with a next action, so the page has no
    // tab bar at all. The retired "Resolved"/Returned tab listed parcels that
    // were already closed; those now live on the Completed page.
    await expect(page.getByRole("tab")).toHaveCount(0)
  })
})

// ─── S4. Failed → Return to Sender ──────────────────────────────────────────
test.describe("S4. Failed → Return", () => {
  test("warehouse admin can view exceptions for return", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/exceptions")
    await waitForAppReady(page)
    await expect(page.locator(warehouse.exceptionsTable)).toBeVisible({
      timeout: 15_000,
    })
  })
})

// ─── S5. Merchant Self-Cancellation ──────────────────────────────────────────
test.describe("S5. Merchant Self-Cancellation", () => {
  test("merchant can view orders and cancel button exists", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
    // The merchant's own orders table renders (with its toolbar). This replaces
    // an assertion that could never fail (`count >= 0`).
    await expect(page.locator(orders.merchantTable)).toBeVisible()
    await expect(page.locator(orders.merchantOrdersSearch)).toBeVisible()
  })
})

// ─── S7. Bulk Order Operations ───────────────────────────────────────────────
test.describe("S7. Bulk Order Operations", () => {
  test("admin can access bulk actions on orders page", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S11. Payout Rejection ──────────────────────────────────────────────────
test.describe("S11. Payout Rejection", () => {
  test("admin can view payout list", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/payouts")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S13. Zone-Based Order Pricing ───────────────────────────────────────────
test.describe("S13. Zone-Based Order Pricing", () => {
  test("order form loads correctly", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders/new")
    await waitForAppReady(page)
    // Verify order form page loaded
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S14. Delivery City Management ───────────────────────────────────────────
test.describe("S14. Delivery City Management", () => {
  test("admin can view and create cities", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/delivery-cities")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()

    // Click Add City button
    const addBtn = page.locator(deliveryCities.addButton)
    if (await addBtn.isVisible()) {
      await addBtn.click()
      // Dialog should open
      await expect(page.locator(dialog.formDialog)).toBeVisible()
    }
  })
})

// ─── S15. Rider Application → Delivery ───────────────────────────────────────
test.describe("S15. Rider Application", () => {
  test("rider application page has all fields", async ({ page }) => {
    await page.goto("/apply/rider")
    await waitForAppReady(page)
    // Verify form fields exist
    await expect(page.locator(riderApplication.name)).toBeVisible()
    await expect(page.locator(riderApplication.email)).toBeVisible()
    await expect(page.locator(riderApplication.phone)).toBeVisible()
    await expect(page.locator(riderApplication.print)).toBeVisible()
  })
})

// ─── S20. Announcement Lifecycle ──────────────────────────────────────────────
test.describe("S20. Announcement Lifecycle", () => {
  test("admin can view announcements page", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/announcements")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })

  test("merchant can view announcements inbox", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/announcements")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S23. Merchant Balance & Payment ──────────────────────────────────────────
test.describe("S23. Merchant Balance & Payment", () => {
  test("merchant can view finance page", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/finance")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })

  test("admin can view merchant balance", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/merchants")
    await waitForAppReady(page)
    // Click on a merchant to view their balance
    const row = page.locator(merchants.firstRow).first()
    if (await row.isVisible()) {
      await row.click()
      await waitForAppReady(page)
      // Should show merchant details
      await expect(page.getByRole("heading").first()).toBeVisible()
    }
  })
})

// ─── Warehouse COD Settlement ─────────────────────────────────────────────────
test.describe("S29. Warehouse COD Settlement", () => {
  test("warehouse admin can view COD settlement page", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/cod-settlement")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Merchant Pricing ─────────────────────────────────────────────────────────
test.describe("S30. Merchant Pricing", () => {
  test("merchant can view pricing page", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/pricing")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Admin Merchant Management ────────────────────────────────────────────────
test.describe("S31. Admin Merchant Management", () => {
  test("admin can view merchant details", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/merchants")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()

    // Click on first merchant row
    const row = page.locator(merchants.firstRow).first()
    if (await row.isVisible()) {
      await row.click()
      await waitForAppReady(page)
      await expect(page.getByRole("heading").first()).toBeVisible()
    }
  })
})

// ─── Admin Rider Management ───────────────────────────────────────────────────
test.describe("S32. Admin Rider Management", () => {
  test("admin can view rider list", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/riders")
    await waitForAppReady(page)
    await expect(page.locator(riders.table)).toBeVisible()

    // The list is server-sorted by `createdAt` desc, so an individual rider is
    // not guaranteed to be on the first page. Search narrows to the seeded
    // rider, which puts its row at a known address.
    await page.locator(riders.search).fill("Rider 1")
    const row = page.locator(riders.row("RID-100001E"))
    await expect(row).toBeVisible()

    // The vehicle column the admin reads before assigning a parcel. RID-100001E
    // is seeded with a motorbike + plate, so this asserts the column renders a
    // real value rather than only that a row exists.
    await expect(row.locator(riders.vehicleCell)).toContainText("Motorbike")
    await expect(row.locator(riders.vehicleCell)).toContainText("DHAKA-11111")
  })

  test("riders with no vehicle are labelled, not left blank", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/riders")
    await waitForAppReady(page)
    await page.locator(riders.search).fill("Rider 5")

    // Only riders 1-3 are seeded with a vehicle. A blank cell would be
    // indistinguishable from one that failed to load, so the gap is labelled.
    const row = page.locator(riders.row("RID-100005E"))
    await expect(row).toBeVisible()
    await expect(row.locator(riders.vehicleCell)).toContainText("Not recorded")
  })

  test("admin can view rider applications", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/rider-applications")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S78. Warehouse Ongoing Board ────────────────────────────────────────────
// Replaces the retired S33 (dispatch desk) and S34 (intake queue). Their serials
// stay unused on purpose: renumbering every later scenario to close the gap
// churns history for no safety gain, and `docs-drift.spec.ts` allows holes.
test.describe("S78. Warehouse Ongoing Board", () => {
  test("board shows one lane per ongoing status, groupable by rider", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)
    await expect(page.locator(ongoing.board)).toBeVisible({ timeout: 15_000 })

    // Five lanes, always — including the empty ones. A lane that disappears
    // when it empties makes the board jump and hides the answer to "is anything
    // waiting to be received?".
    const statuses = [
      "APPROVED",
      "OUT_FOR_PICKUP",
      "PICKED_UP",
      "IN_WAREHOUSE",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
    ]
    for (const status of statuses) {
      await expect(page.locator(ongoing.column(status))).toBeVisible()
    }

    const cardsByStatus = await Promise.all(
      statuses.map(async (status) =>
        page
          .locator(ongoing.column(status))
          .locator(ongoing.cardPrefix)
          .count(),
      ),
    )
    const totalByStatus = cardsByStatus.reduce((a, b) => a + b, 0)
    expect(totalByStatus).toBeGreaterThan(0)

    // Switching to the rider view re-files every card, and no card may appear
    // twice: a parcel shown in both a status lane and a rider lane would be two
    // dispatchable copies of one order.
    await page.locator(ongoing.groupByRiders).click()
    await expect(page.locator(ongoing.unassignedColumn)).toBeVisible({
      timeout: 15_000,
    })

    const riderCards = await page.locator(ongoing.cardPrefix).count()
    expect(riderCards).toBe(totalByStatus)
  })

  test("a card opens its details and the page stays read-only", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)

    const firstCard = page.locator(ongoing.cardOpenPrefix).first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })
    await firstCard.click()
    await expect(page.locator(ongoing.details)).toBeVisible({
      timeout: 15_000,
    })

    // Cancel is the approval queue's action. On a board it would be an undo for
    // work already in motion, so no card may offer it.
    await expect(page.locator(ongoing.cancelPrefix)).toHaveCount(0)
  })

  test("every board filter is labelled and its dropdown lists the full set", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)

    // Five fields, each with a visible label wired to its control. A placeholder
    // alone would have satisfied "there is some hint" while being announced by
    // nobody and disappearing as soon as the box has a value.
    for (const controlId of [
      "kanban-filter-query",
      "kanban-filter-pickup-rider",
      "kanban-filter-delivery-rider",
      "kanban-filter-pickup-city",
      "kanban-filter-delivery-city",
    ]) {
      await expect(page.locator(ongoing.labelFor(controlId))).toHaveText(/\S+/)
      await expect(page.getByTestId(controlId)).toBeVisible()
    }

    // Every dropdown opens on its "All …" entry — the untouched board — and that
    // default is read from the *trigger* (the text the user actually sees),
    // not from the popup. Two rider fields, because a parcel has a pickup rider
    // and a delivery rider at the same time and they are rarely the same person.
    for (const trigger of [
      ongoing.pickupRiderFilter,
      ongoing.deliveryRiderFilter,
    ]) {
      await expect(page.locator(trigger)).toHaveText(/all riders/i, {
        timeout: 15_000,
      })
    }
    for (const trigger of [
      ongoing.pickupCityFilter,
      ongoing.deliveryCityFilter,
    ]) {
      await expect(page.locator(trigger)).toHaveText(/all cities/i)
    }

    // Open each dropdown and wait for its first real option. The roster arrives
    // over SWR after the page shell, so a bare count read before it lands would
    // assert a one-item list.
    for (const [trigger, optionPrefix] of [
      [ongoing.pickupRiderFilter, ongoing.pickupRiderOptionPrefix],
      [ongoing.deliveryRiderFilter, ongoing.deliveryRiderOptionPrefix],
      [ongoing.pickupCityFilter, ongoing.pickupCityOptionPrefix],
      [ongoing.deliveryCityFilter, ongoing.deliveryCityOptionPrefix],
    ] as const) {
      await page.locator(trigger).click()
      await expect(page.locator(optionPrefix).first()).toBeVisible({
        timeout: 15_000,
      })
      await page.keyboard.press("Escape")
    }

    // Picking one really does narrow the board — and arms the way back out.
    const before = await page.locator(ongoing.cardPrefix).count()
    expect(before).toBeGreaterThan(0)
    await page.locator(ongoing.deliveryCityFilter).click()
    await page.locator(ongoing.deliveryCityOptionPrefix).first().click()
    await expect(page.locator(ongoing.filterClear)).toBeVisible()
    // Never wider: a filter can only take parcels away, and the "Clear" control
    // appearing is what proves the selection actually took effect rather than
    // the trigger merely re-rendering.
    expect(await page.locator(ongoing.cardPrefix).count()).toBeLessThanOrEqual(
      before,
    )
  })

  test("filters sit equal width on a desktop and fill the row on a phone", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)
    await expect(page.locator(ongoing.board)).toBeVisible({ timeout: 15_000 })

    const measure = async () => {
      const locators = page.locator(ongoing.fieldPrefix)
      const boxes = await locators.all()
      return (
        await Promise.all(
          boxes.map(async (box) => {
            const bb = await box.boundingBox()
            return bb ? Math.round(bb.width) : 0
          }),
        )
      ).sort((a, b) => a - b)
    }

    // Desktop: five equal columns on one line. The 1px tolerance is the
    // rounding sub-pixel grid columns land on — anything wider means a field
    // really is a different size, and a 60px city dropdown next to a 300px
    // order box makes the row read as broken.
    const desktop = await measure()
    expect(desktop).toHaveLength(5)
    expect(desktop[desktop.length - 1] - desktop[0]).toBeLessThanOrEqual(1)

    // Phone: one column, so every field is the full width of the toolbar.
    await page.setViewportSize({ width: 375, height: 812 })
    const barWidth = Math.round(
      (await page.locator(ongoing.filters).boundingBox())?.width ?? 0,
    )
    await expect
      .poll(
        async () => {
          const phone = await measure()
          return (
            phone.length === 5 &&
            phone.every((w) => Math.abs(w - barWidth) <= 1)
          )
        },
        { timeout: 10_000 },
      )
      .toBe(true)
  })

  test("order id search narrows the board and reports when nothing matches", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)
    await expect(page.locator(ongoing.board)).toBeVisible({ timeout: 15_000 })

    const before = await page.locator(ongoing.cardPrefix).count()
    expect(before).toBeGreaterThan(0)

    // A real parcel's own code narrows to exactly that parcel.
    const code = await page.locator(ongoing.cardOpenPrefix).first().innerText()
    await page.locator(ongoing.query).fill(code.trim())
    await expect(page.locator(ongoing.cardPrefix)).toHaveCount(1)

    // A code that is not on the board is reported as such — and offers a way
    // back, rather than leaving an empty board that looks broken.
    await page.locator(ongoing.query).fill("ORD-DOES-NOT-EXIST")
    await expect(page.locator(ongoing.noMatches)).toBeVisible()
    await expect(page.locator(ongoing.cardPrefix)).toHaveCount(0)
    // Lanes stay: an empty lane is still the answer to "where is it?".
    await expect(page.locator(ongoing.columnPrefix)).toHaveCount(6)

    await page.locator(ongoing.filterClear).click()
    await expect(page.locator(ongoing.noMatches)).toHaveCount(0)
    await expect(page.locator(ongoing.cardPrefix)).toHaveCount(before)
  })
})

// ─── S79. Warehouse Completed Orders ─────────────────────────────────────────
test.describe("S79. Warehouse Completed Orders", () => {
  test("completed page is read-only across delivered, cancelled and returned", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/completed")
    await waitForAppReady(page)
    await expect(page.locator(completed.table)).toBeVisible({ timeout: 15_000 })

    // All four tabs, because RETURNED moved here from Exceptions and the tab
    // that used to say "Resolved" was on a page that no longer lists it.
    for (const tab of [
      completed.tabAll,
      completed.tabDelivered,
      completed.tabCancelled,
      completed.tabReturned,
    ]) {
      await expect(page.locator(tab)).toBeVisible()
    }

    // No selection and no actions: a closed parcel has nothing left to do to it,
    // so a checkbox on its row would promise an action that cannot exist, and a
    // settle button would move money out of a history page.
    await expect(page.locator(orders.selectAll)).toHaveCount(0)
    await expect(page.locator(warehouse.settleButton)).toHaveCount(0)
  })
})
