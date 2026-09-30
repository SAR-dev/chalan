import "dotenv/config"

import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { deliveryCities, nav, pricing } from "../selectors"

/**
 * Merchant-side pricing reference (S64–S65).
 *
 * Zone pricing is per lane, so the two things a merchant needs before booking
 * are "where can I deliver?" and "what does each route cost?". Both are
 * read-only views of platform-owned data — neither creates or edits anything.
 *
 * Zone and city ids are seeded by `delivery-zones.ts` / `delivery-cities.ts`
 * and stable, so the specs address rows by id rather than by copy.
 */

const DHAKA_METRO = "DZ-100001E"
const DIVISIONAL = "DZ-100002E"
const CITY_DHAKA = "DC-100001E"
const CITY_RANGPUR = "DC-100007E"

test.describe("S64. Merchant Delivery Cities", () => {
  test("lists every city under its zone, and search narrows the list", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/delivery-cities")
    await waitForAppReady(page)

    // Reachable from the sidebar, so it is discoverable rather than a URL you
    // have to know.
    await expect(page.locator(nav.sidebarLink("Delivery Cities"))).toBeVisible()
    await expect(page.locator(deliveryCities.merchantPage)).toBeVisible()

    // Each seeded zone is its own section with its cities beneath it.
    await expect(
      page.locator(deliveryCities.merchantZone(DHAKA_METRO)),
    ).toBeVisible()
    await expect(
      page.locator(deliveryCities.merchantCity(CITY_DHAKA)),
    ).toBeVisible()
    await expect(
      page.locator(deliveryCities.merchantCity(CITY_RANGPUR)),
    ).toBeVisible()

    // Searching narrows to the match and hides the rest.
    await page.locator(deliveryCities.merchantSearch).fill("Rangpur")
    await expect(
      page.locator(deliveryCities.merchantCity(CITY_RANGPUR)),
    ).toBeVisible()
    await expect(
      page.locator(deliveryCities.merchantCity(CITY_DHAKA)),
    ).toHaveCount(0)

    // Searching the zone name keeps every city in it.
    await page.locator(deliveryCities.merchantSearch).fill("Remote Areas")
    await expect(
      page.locator(deliveryCities.merchantCity(CITY_RANGPUR)),
    ).toBeVisible()

    // An unmatched query says so rather than rendering an empty box.
    await page.locator(deliveryCities.merchantSearch).fill("nowhere-xyz")
    await expect(page.locator(deliveryCities.merchantEmpty)).toBeVisible()
  })
})

test.describe("S65. Merchant zone rate matrix", () => {
  test("shows each lane's base rate and the full rates on select", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/pricing")
    await waitForAppReady(page)

    await expect(page.locator(pricing.zoneRateCard)).toBeVisible()
    await expect(page.locator(pricing.zoneMatrix)).toBeVisible()

    // The seeded matrix is a full 3×3, so this lane must be priced — and the
    // label on it carries the route, which is what proves both axes resolved
    // to the right zones.
    const lane = page.locator(pricing.zoneMatrixCell(DHAKA_METRO, DIVISIONAL))
    await expect(lane).toHaveAttribute("data-priced", "true")

    await lane.click()
    await expect(page.locator(pricing.zoneMatrixDetailLane)).toHaveText(
      "Dhaka Metro → Divisional Cities",
    )
    await expect(page.locator(pricing.zoneMatrixDetail)).toContainText(
      "Extra per KG",
    )
    await expect(page.locator(pricing.zoneMatrixDetail)).toContainText(
      "Cancellation fee",
    )

    // The axes are labelled so the two directions cannot be mistaken for one
    // symmetric rate: rows are where the parcel starts, columns where it ends.
    await expect(
      page.getByRole("columnheader", { name: "Pickup zone" }),
    ).toBeVisible()
    await expect(
      page.getByRole("columnheader", { name: "Delivery zone" }),
    ).toBeVisible()
  })

  test("prices the reverse lane separately", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/pricing")
    await waitForAppReady(page)

    await expect(page.locator(pricing.zoneMatrix)).toBeVisible()

    // A→B and B→A are different cells with their own rates. Selecting the
    // reverse and asserting its own lane label is what rules out a symmetric
    // cell quietly quoting the wrong direction.
    const reverse = page.locator(
      pricing.zoneMatrixCell(DIVISIONAL, DHAKA_METRO),
    )
    await expect(reverse).toHaveAttribute("data-priced", "true")
    await reverse.click()
    await expect(page.locator(pricing.zoneMatrixDetailLane)).toHaveText(
      "Divisional Cities → Dhaka Metro",
    )
  })
})
