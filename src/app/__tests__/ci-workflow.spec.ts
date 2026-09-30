import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const raw = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf-8",
)
const pkg = readFileSync(join(process.cwd(), "package.json"), "utf-8")

/**
 * The workflow with comment markers stripped.
 *
 * A job may be deliberately disabled by commenting it out (the `e2e` job is, to
 * save CI minutes). Stripping the markers means the guard below still validates
 * that job's shape and step ordering, so it cannot be silently broken while
 * disabled — or re-enabled in the wrong order.
 */
const workflow = raw
  .split("\n")
  .map((line) => line.replace(/^\s*#\s?/, ""))
  .join("\n")

/**
 * The workflow with comment *lines* removed, original indentation kept.
 *
 * `workflow` above deliberately keeps commented-out jobs by stripping the `#`,
 * which is right for checking shape but wrong for anything that greps for
 * literal config: prose in a comment ("no `cache: pnpm` here") would satisfy a
 * text search and make the check pass for the wrong reason. Anything reading
 * real config keys must use this instead.
 */
const code = raw
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n")

/** Every job key in the *uncommented* workflow. */
function jobNames(): string[] {
  return [...code.matchAll(/^ {2}([a-zA-Z0-9_-]+):/gm)].map((m) => m[1])
}

/** The `name:` job block, from its key to the next top-level job key. */
function jobBlock(name: string, src: string = workflow): string {
  const start = src.search(new RegExp(`^\\s{2}${name}:`, "m"))
  if (start === -1) return ""
  const rest = src.slice(start + 1)
  const next = rest.search(/^\s{2}[a-zA-Z0-9_-]+:/m)
  return next === -1 ? src.slice(start) : rest.slice(0, next)
}

describe("CI workflow", () => {
  it("keeps the e2e job's migrate → build → install → test ordering", () => {
    // Whether the job is enabled or commented out, it must keep the ordering it
    // depends on: migrate the DB, build the app, install browsers, then run.
    const job = jobBlock("e2e")
    expect(job).not.toBe("")

    const order = [
      "pnpm db:migrate",
      "pnpm build",
      "playwright install",
      "pnpm test:e2e",
    ].map((step) => job.indexOf(step))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))

    // ...and the suite itself must stay runnable locally.
    expect(pkg).toContain('"test:e2e"')
  })

  it("documents why the e2e job is disabled", () => {
    // A disabled gate needs a written reason next to it, so it is a decision
    // rather than an accident.
    expect(raw).toContain("Disabled on purpose")
  })

  it("runs the coverage gate", () => {
    expect(workflow).toMatch(/^\s{2}coverage:/m)
    expect(workflow).toContain("pnpm test:coverage")
  })

  it("runs the quality gate as one job behind a single install", () => {
    // `pnpm ci:check` is typecheck && lint:check && format:check. Keeping it in
    // one job is deliberate: splitting it paid a full dependency install per
    // check to reach a ~1.5s Biome invocation.
    const job = jobBlock("quality")
    expect(job).not.toBe("")
    expect(job).toContain("pnpm ci:check")
    expect(
      job.match(/run: pnpm install --frozen-lockfile/g) ?? [],
    ).toHaveLength(1)
    // ...and the three jobs it replaced must not creep back in.
    expect(workflow).not.toMatch(/^\s{2}(typecheck|lint|format):/m)
    // The gate itself must stay runnable locally.
    expect(pkg).toContain('"ci:check"')
  })

  it("keeps the dependency install out of the security job", () => {
    // `pnpm audit` resolves the tree from pnpm-lock.yaml and the dependency
    // review diffs the lockfile — neither needs node_modules.
    expect(jobBlock("security")).not.toContain("run: pnpm install")
    expect(jobBlock("security")).toContain("pnpm audit")
  })

  it("only declares the pnpm cache in jobs that install", () => {
    // `actions/setup-node`'s `cache: pnpm` registers a post-job save step. A job
    // that never runs `pnpm install` never populates the pnpm store, so that post
    // step fails the job *after* all of its real work has already passed, with
    // "Path Validation Error: Path(s) specified in the action for caching do(es)
    // not exist". Dropping an install without dropping its cache is the trap;
    // drop both together, as the security job does.
    const names = jobNames()
    expect(names.length).toBeGreaterThan(0)

    // Read from `code`, not `workflow`: the prose in the comments above would
    // otherwise satisfy both searches and hide the regression.
    for (const name of names) {
      const job = jobBlock(name, code)
      const caches = /^\s{10}cache: pnpm$/m.test(job)
      if (!caches) continue
      expect(
        /^\s*- run: pnpm install/m.test(job),
        `${name} declares \`cache: pnpm\` but never runs \`pnpm install\``,
      ).toBe(true)
    }
  })

  it("runs the real-DB integration suite against its own service container", () => {
    expect(workflow).toMatch(/^\s{2}integration:/m)
    expect(workflow).toContain("pnpm test:integration")
    expect(workflow).toContain("INTEGRATION_DATABASE_URL")

    // Hermetic: the job must not point at a shared remote database.
    const job = jobBlock("integration")
    expect(job).toContain(
      "postgres://postgres:postgres@localhost:5432/delivery",
    )
    expect(job).not.toMatch(/neon\.tech|sslmode=require/)
  })

  it("boots the smoke step with every var validateEnv requires", () => {
    // `validateEnv()` runs from instrumentation on `pnpm start` and throws on the
    // first missing required var, so an incomplete env fails at boot with a wall
    // of "required but not set" lines instead of a curl timeout — and it does so
    // in the `build` job, which reads as a build failure rather than a config one.
    // The vars it needs are spread across the workflow-level and step-level env
    // blocks, so assert against the union `pnpm start` actually sees.
    const stepStart = workflow.indexOf("- name: Smoke test the built app")
    expect(stepStart).toBeGreaterThan(-1)
    const stepEnd = workflow.indexOf("\n        run:", stepStart)
    const stepEnv = workflow.slice(
      stepStart,
      stepEnd === -1 ? undefined : stepEnd,
    )

    const topEnv = workflow.slice(
      workflow.search(/^env:$/m),
      workflow.indexOf("\njobs:"),
    )

    const keysAt = (indent: number, text: string) =>
      [
        ...text.matchAll(new RegExp(`^ {${indent}}([A-Z][A-Z0-9_]*):`, "gm")),
      ].map((m) => m[1])

    // Unconditional requirements from `src/lib/env.ts` validateEnv, plus the
    // LOCAL_UPLOADS_DIR that STORAGE_PROVIDER=local pulls in. NEXT_PUBLIC_* come
    // from the workflow-level block, which is why they are absent from the step.
    // Adding a required var to env.ts means adding it here.
    expect(
      [...new Set([...keysAt(2, topEnv), ...keysAt(10, stepEnv)])].sort(),
    ).toEqual([
      "BETTER_AUTH_SECRET",
      "CRON_SECRET",
      "DATABASE_URL",
      "LOCAL_UPLOADS_DIR",
      "NEXT_PUBLIC_ENV",
      "NEXT_PUBLIC_SITE_URL",
      "STORAGE_PROVIDER",
    ])
  })
})
