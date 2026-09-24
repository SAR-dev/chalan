import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, conflict, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { deliveryCity, order, pickupLocation } from "@/lib/db/schema"
import { parseBody, pickupLocationSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

// Loads a pickup location and verifies the signed-in merchant owns it. Returns
// either the row or a NextResponse error to short-circuit the handler.
async function loadOwned(id: string) {
  const me = await requireSession()
  if (!me) return { error: unauthorized(), row: null }

  if (me.role !== "MERCHANT" || !me.merchantId) {
    return { error: forbidden(), row: null }
  }

  const [row] = await db
    .select({
      id: pickupLocation.id,
      merchantId: pickupLocation.merchantId,
      label: pickupLocation.label,
      address: pickupLocation.address,
      cityId: pickupLocation.cityId,
      mapLink: pickupLocation.mapLink,
      createdAt: pickupLocation.createdAt,
      updatedAt: pickupLocation.updatedAt,
    })
    .from(pickupLocation)
    .where(
      and(
        eq(pickupLocation.id, id),
        eq(pickupLocation.merchantId, me.merchantId),
      ),
    )
    .limit(1)

  if (!row) {
    return { error: notFound(), row: null }
  }

  return { error: null, row }
}

// Merchant updates one of their pickup locations (pickup location name, address, map
// link).
export const PATCH = withErrorHandler(async (

  req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const { id } = await params
  const owned = await loadOwned(id)
  if (owned.error) return owned.error

  const parsed = await parseBody(req, pickupLocationSchema)
  if (parsed.error) return parsed.error
  const { label, address, cityId, mapLink } = parsed.data

  // Validate the city exists and is active.
  const [city] = await db
    .select({ id: deliveryCity.id, isActive: deliveryCity.isActive })
    .from(deliveryCity)
    .where(eq(deliveryCity.id, cityId))
    .limit(1)
  if (!city) {
    return badRequest("The selected city does not exist.")
  }
  if (!city.isActive) {
    return badRequest("The selected city is no longer active. Contact support.")
  }

  const [updated] = await db
    .update(pickupLocation)
    .set({
      label: label.trim(),
      address: address.trim(),
      cityId,
      mapLink: mapLink?.trim() ? mapLink.trim() : null,
    })
    .where(eq(pickupLocation.id, id))
    .returning()

  return NextResponse.json(updated)
})


// Merchant removes one of their pickup locations. Blocked if any order still
// references it (the order.pickupLocationId FK has no cascade), so the
// merchant keeps an accurate audit trail.
export const DELETE = withErrorHandler(async (

  _req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const { id } = await params
  const owned = await loadOwned(id)
  if (owned.error) return owned.error

  const [referencing] = await db
    .select({ id: order.id })
    .from(order)
    .where(eq(order.pickupLocationId, id))
    .limit(1)

  if (referencing) {
    return conflict(
      "This pickup location has orders linked to it and cannot be removed. You can edit its details instead.",
    )
  }

  await db.delete(pickupLocation).where(eq(pickupLocation.id, id))
  return NextResponse.json({ ok: true })
})

