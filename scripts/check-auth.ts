import "dotenv/config"
import { pool } from "@/lib/db"

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? ""
  const host = dbUrl.replace(/^.*@/, "").replace(/\/.*$/, "")
  console.log("[check] DATABASE_URL host:", host)

  const schemas = await pool!.query(
    `SELECT table_schema, count(*)::int AS n
     FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog','information_schema')
     GROUP BY table_schema ORDER BY table_schema`,
  )
  console.log("[check] schemas:", schemas.rows)

  const users = await pool!.query(
    `SELECT u.email,
            p.role,
            (a.id IS NOT NULL) AS has_credential,
            left(a.password, 12) AS pw_prefix
     FROM "user" u
     LEFT JOIN profile p ON p."userId" = u.id
     LEFT JOIN account a ON a."userId" = u.id AND a."providerId" = 'credential'
           WHERE u.email = 'admin01@email.com'`,
  )
  console.log("[check] superadmin row:", users.rows)

  await pool!.end()
}

main().catch((e) => {
  console.error("[check] error:", e)
  process.exit(1)
})
