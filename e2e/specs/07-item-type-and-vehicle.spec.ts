import "dotenv/config"

import { expect, request as pwRequest, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { orderForm, pricing, riderParcel, riders, zones } from "../selectors"

const BASE_URL = "http://localhost:3000"

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

// ─── S66. Item type + rider vehicle + pricing view toggle ─────────────────────
// The three fields added in this round are all read-only-to-others data: a
// merchant states what is in a parcel, an admin records what a rider rides, and
// an admin reads the same rates in two shapes. Each test drives the write
// through the API (so the fixture is exact) and then asserts it is actually
// visible where the reader looks for it — a field that persists but never
// renders is the failure mode these are here to catch.
test.describe("S66. Item type, rider vehicle, and pricing view", () => {
  test("merchant states the item type and the rider sees it when collecting", async ({
    page,
  }) => {
    const merchant = await loginContext(CREDS.merchant)
    const pickupLocations = rows(
      await (await merchant.get("/api/pickup-locations")).json(),
    )
    const cities = rows(
      await (await merchant.get("/api/delivery-cities")).json(),
    )
    expect(pickupLocations.length).toBeGreaterThan(0)
    expect(cities.length).toBeGreaterThan(0)

    const createRes = await merchant.post("/api/orders", {
      data: {
        pickupLocationId: pickupLocations[0].id,
        recipientName: "E2E Contents",
        recipientPhone: "01712345678",
        deliveryAddress: "9 Contents Road",
        deliveryCityId: cities[0].id,
        parcelWeightKg: 1,
        itemType: "Cotton saree",
        deliveryType: "STANDARD",
        productCost: 500,
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const order = (await createRes.json()) as Record<string, unknown>
    expect(order.itemType).toBe("Cotton saree")

    // The contents must not have moved the money. A field that looks
    // descriptive but quietly feeds pricing is the worst outcome here, so the
    // fee is pinned against a sibling order with identical inputs.
    const plainRes = await merchant.post("/api/orders", {
      data: {
        pickupLocationId: pickupLocations[0].id,
        recipientName: "E2E No Contents",
        recipientPhone: "01712345678",
        deliveryAddress: "9 Contents Road",
        deliveryCityId: cities[0].id,
        parcelWeightKg: 1,
        deliveryType: "STANDARD",
        productCost: 500,
      },
    })
    expect(plainRes.ok()).toBeTruthy()
    const plain = (await plainRes.json()) as Record<string, unknown>
    expect(plain.itemType ?? null).toBeNull()
    expect(plain.deliveryFee).toBe(order.deliveryFee)
    await merchant.dispose()

    // Admin approves, warehouse assigns a pickup rider, and the rider sees both
    // the weight and the contents on the queue they collect from.
    const admin = await loginContext(CREDS.superAdmin)
    expect(
      (await admin.patch(`/api/orders/${order.id}/approve`)).ok(),
    ).toBeTruthy()
    await admin.dispose()

    const warehouse = await loginContext(CREDS.warehouseAdmin)
    const assign = await warehouse.patch(
      `/api/orders/${order.id}/assign-pickup-rider`,
      { data: { riderId: "RID-100001E" } },
    )
    expect(assign.ok(), `assign -> ${assign.status()}`).toBeTruthy()
    await warehouse.dispose()

    await login(page, CREDS.rider)
    await page.goto("/rider/pickup")
    await waitForAppReady(page)
    const parcel = page.locator(riderParcel.pickupCell(String(order.id)))
    await expect(parcel).toContainText("1 KG")
    await expect(parcel).toContainText("Cotton saree")
  })

  test("merchant can type an item type on the new-order form", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders/new")
    await waitForAppReady(page)

    // Present but optional, and it says so: the field sits next to the weight
    // and the fee, so without the hint a merchant will assume the contents
    // decide the price.
    const field = page.locator(orderForm.itemType).first()
    await expect(field).toBeVisible()
    await field.fill("Phone charger")
    await expect(field).toHaveValue("Phone charger")

    // Empty stays empty rather than becoming a placeholder string.
    await field.fill("")
    await expect(field).toHaveValue("")
  })

  // The seed gives riders 1-3 a vehicle and leaves the rest without one, so
  // these two tests each start from a known state.
  const NO_VEHICLE_RIDER = "RID-100005E"
  const TO_EDIT_RIDER = "RID-100004E"

  test("admin records a rider's vehicle and it shows on the rider's detail", async ({
    page,
  }) => {
    const admin = await loginContext(CREDS.superAdmin)
    // This rider is seeded without a vehicle, so this is the not-declared ->
    // declared transition rather than a no-op.
    const before = await admin.get(`/api/riders/${TO_EDIT_RIDER}`)
    expect(before.ok()).toBeTruthy()
    expect(
      ((await before.json()) as { vehicleType?: string | null }).vehicleType,
    ).toBeFalsy()

    const patch = await admin.patch(`/api/riders/${TO_EDIT_RIDER}`, {
      data: { vehicleType: "BIKE", vehiclePlate: " dhaka 12-3456 " },
    })
    expect(patch.ok(), `patch -> ${patch.status()}`).toBeTruthy()
    const patched = (await patch.json()) as {
      vehicleType?: string
      vehiclePlate?: string
    }
    // Normalized on write: the same plate typed two ways is one vehicle.
    expect(patched.vehicleType).toBe("BIKE")
    expect(patched.vehiclePlate).toBe("DHAKA12-3456")
    await admin.dispose()

    await login(page, CREDS.superAdmin)
    await page.goto(`/dashboard/riders/${TO_EDIT_RIDER}`)
    await waitForAppReady(page)
    await expect(page.locator(riders.detailVehicle)).toContainText("Motorbike")
    await expect(page.locator(riders.detailVehicle)).toContainText(
      "DHAKA12-3456",
    )
  })

  test("a rider with no vehicle recorded says so rather than showing a gap", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto(`/dashboard/riders/${NO_VEHICLE_RIDER}`)
    await waitForAppReady(page)
    // "Not recorded" rather than an em dash: an admin scanning for who can
    // take a van needs to see the gap, and a dash is indistinguishable from a
    // column that failed to load.
    await expect(page.locator(riders.detailVehicle)).toHaveText("Not recorded")
  })

  test("zone pricing opens on the list and toggles to the matrix and back", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/zone-pricing")
    await waitForAppReady(page)

    // List is the default because it is the only view carrying the row actions.
    await expect(page.locator(zones.listView)).toBeVisible()
    await expect(page.locator(pricing.zoneMatrix)).toHaveCount(0)

    await page.locator(zones.viewMatrix).click()
    await expect(page.locator(pricing.zoneMatrix)).toBeVisible()
    await expect(page.locator(zones.listView)).toHaveCount(0)

    // The structural trap: a toggle that lives inside the table toolbar
    // disappears the moment the matrix is shown, stranding the admin with no
    // way back. Both triggers must still be there.
    await expect(page.locator(zones.viewList)).toBeVisible()
    await page.locator(zones.viewList).click()
    await expect(page.locator(zones.listView)).toBeVisible()
    await expect(page.locator(pricing.zoneMatrix)).toHaveCount(0)
  })
})
