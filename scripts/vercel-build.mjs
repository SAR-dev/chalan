// Vercel build hook.
//
// `vercel.json` has no pre-deploy step — a cron list and a git policy is all it
// can express. Vercel does, however, prefer a `vercel-build` script over
// `build`, which is the hook this uses. That distinction is the point: local
// dev, `pnpm build` and CI keep running the plain `build` script and never
// touch a database, while only a Vercel deployment applies migrations.
//
// Migrations run first so a failed schema change aborts before the build, and so
// anything the build reads from the database is already in place. Order is also
// safe in reverse: `migrate.ts` takes a database-wide advisory lock, so a
// concurrent deploy cannot double-apply.
//
// Preview and development deployments skip it. Only the production branch owns
// the schema (`vercel.json` restricts deployments to `main`), and `migrate.ts`
// throws without a DATABASE_URL, which preview builds do not have.
//
// Both steps delegate to `package.json` scripts so the migration and build
// commands keep a single definition; `build` is a different script from
// `vercel-build`, so there is no recursion.

import { execSync } from "node:child_process"

const run = (script) => execSync(`pnpm run ${script}`, { stdio: "inherit" })

const env = process.env.VERCEL_ENV ?? "(not vercel)"

if (env === "production") {
  if (process.env.VERCEL_SKIP_MIGRATE) {
    // Operational escape hatch: a build that cannot reach the database must not
    // block a deploy when the schema is known to be current.
    console.log(
      "[vercel-build] VERCEL_SKIP_MIGRATE set — skipping migrations",
    )
  } else {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set in the Vercel production environment. " +
          "Add it, or set VERCEL_SKIP_MIGRATE=1 to deploy without migrating.",
      )
    }
    console.log("[vercel-build] production deploy — applying migrations")
    run("db:migrate")
  }
} else {
  console.log(`[vercel-build] VERCEL_ENV=${env} — skipping migrations`)
}

console.log("[vercel-build] building")
run("build")
