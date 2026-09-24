import { asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { dbRead as db } from "@/lib/db"
import { warehouse } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

// Public list of *active* warehouses, used to populate the warehouse selector
// on the unauthenticated rider application form. Only id, name, and city are
// returned.
export const GET = withErrorHandler(async () => {
  const rows = await db
    .select({ id: warehouse.id, name: warehouse.name, city: warehouse.city })
    .from(warehouse)
    .where(eq(warehouse.isActive, true))
    .orderBy(asc(warehouse.name))
  return NextResponse.json(rows, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  })
})
