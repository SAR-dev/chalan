import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { profile, user } from "@/lib/db/schema"

export function log(msg: string) {
  console.log(`[seed] ${msg}`)
}

/** Create a Better Auth user + our profile row in one step. */
export async function createUser(input: {
  name: string
  email: string
  password: string
  phone: string
  role: "SUPER_ADMIN" | "WAREHOUSE_ADMIN" | "MERCHANT" | "RIDER"
  isActive?: boolean
  warehouseId?: string | null
  merchantId?: string | null
  riderId?: string | null
}) {
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, input.email))
    .limit(1)
  if (existing.length > 0) {
    log(`  skip user ${input.email} (already exists)`)
    return
  }

  await auth.api.createUser({
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
    },
  })

  const created = await db
    .select()
    .from(user)
    .where(eq(user.email, input.email))
    .limit(1)
  const baUser = created[0]
  if (!baUser) throw new Error(`Failed to create user ${input.email}`)

  await db.insert(profile).values({
    userId: baUser.id,
    role: input.role,
    phone: input.phone,
    isActive: input.isActive ?? true,
    warehouseId: input.warehouseId ?? null,
    merchantId: input.merchantId ?? null,
    riderId: input.riderId ?? null,
  })

  log(`  created user ${input.email} (${input.role})`)
}
