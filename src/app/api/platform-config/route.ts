import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { platformConfig } from "@/lib/db/schema"
import { parseBody, platformConfigSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const config = await dbRead
    .select({
      id: platformConfig.id,
      defaultCodFeePercentage: platformConfig.defaultCodFeePercentage,
      minCodFeePercentage: platformConfig.minCodFeePercentage,
      maxCodFeePercentage: platformConfig.maxCodFeePercentage,
      defaultBaseRate: platformConfig.defaultBaseRate,
      defaultExtraRatePerKg: platformConfig.defaultExtraRatePerKg,
      defaultFreeWeightKg: platformConfig.defaultFreeWeightKg,
      defaultMaxWeightKg: platformConfig.defaultMaxWeightKg,
      defaultCancellationFee: platformConfig.defaultCancellationFee,
      refundOnCancel: platformConfig.refundOnCancel,
      updatedAt: platformConfig.updatedAt,
    })
    .from(platformConfig)
    .limit(1)
    .then((r) => r[0])

  if (!config) {
    const [created] = await db
      .insert(platformConfig)
      .values({ id: "default" })
      .returning()
    return NextResponse.json(created)
  }

  return NextResponse.json(config)
})

export const PATCH = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, platformConfigSchema)
  if (parsed.error) return parsed.error

  const fields = parsed.data
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  let config = await db
    .select({
      id: platformConfig.id,
      defaultCodFeePercentage: platformConfig.defaultCodFeePercentage,
      minCodFeePercentage: platformConfig.minCodFeePercentage,
      maxCodFeePercentage: platformConfig.maxCodFeePercentage,
      defaultBaseRate: platformConfig.defaultBaseRate,
      defaultExtraRatePerKg: platformConfig.defaultExtraRatePerKg,
      defaultFreeWeightKg: platformConfig.defaultFreeWeightKg,
      defaultMaxWeightKg: platformConfig.defaultMaxWeightKg,
      defaultCancellationFee: platformConfig.defaultCancellationFee,
      refundOnCancel: platformConfig.refundOnCancel,
      updatedAt: platformConfig.updatedAt,
    })
    .from(platformConfig)
    .limit(1)
    .then((r) => r[0])

  if (!config) {
    const [created] = await db
      .insert(platformConfig)
      .values({ id: "default", ...fields })
      .returning()
    config = created
  } else {
    const [updated] = await db
      .update(platformConfig)
      .set({ ...fields, updatedAt: new Date().toISOString() })
      .where(eq(platformConfig.id, "default"))
      .returning()
    config = updated
  }

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "PLATFORM_CONFIG_UPDATED",
    entityType: "platform_config",
    entityId: config.id,
    description: "Updated platform config defaults",
    metadata: fields,
  })

  return NextResponse.json(config)
})
