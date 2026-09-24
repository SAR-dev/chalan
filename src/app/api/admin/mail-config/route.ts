import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/api-auth"
import { forbidden } from "@/lib/api-response"
import { encryptSecret } from "@/lib/crypto"
import { db, dbRead } from "@/lib/db"
import { mailConfig } from "@/lib/db/schema"
import { parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

const createMailConfigSchema = z.object({
  label: z.string().min(1, "Label is required"),
  host: z.string().min(1, "Host is required"),
  port: z.string().min(1, "Port is required"),
  secure: z.boolean(),
  user: z.string().min(1, "User is required"),
  pass: z.string().min(1, "Password is required"),
  fromEmail: z.string().email("Invalid email"),
  fromName: z.string().min(1, "From name is required"),
})

type MailConfigRow = typeof mailConfig.$inferSelect

function maskPass(row: MailConfigRow) {
  return { ...row, pass: row.pass ? "••••••••" : "" }
}

export const GET = withErrorHandler(async (

) => {
  const me = await requireSession()
  if (!me || me.role !== "SUPER_ADMIN") return forbidden()

  const configs = await dbRead
    .select({
      id: mailConfig.id,
      label: mailConfig.label,
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      user: mailConfig.user,
      pass: mailConfig.pass,
      fromEmail: mailConfig.fromEmail,
      fromName: mailConfig.fromName,
      isActive: mailConfig.isActive,
      createdAt: mailConfig.createdAt,
      updatedAt: mailConfig.updatedAt,
    })
    .from(mailConfig)
    .orderBy(mailConfig.createdAt)

  return NextResponse.json(configs.map(maskPass))
})


export const POST = withErrorHandler(async (
req: Request
) => {
  const me = await requireSession()
  if (!me || me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, createMailConfigSchema)
  if (parsed.error) return parsed.error

  const [created] = await db
    .insert(mailConfig)
    .values({ ...parsed.data, pass: encryptSecret(parsed.data.pass) })
    .returning()
  return NextResponse.json(maskPass(created), { status: 201 })
})

