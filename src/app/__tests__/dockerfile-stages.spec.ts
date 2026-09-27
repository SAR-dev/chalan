import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Guards the P4.4 cleanup: `deps-prod` (a second, prod-only `pnpm install`)
// was never referenced by any `COPY --from=`, so it only doubled the install
// work on every image build. Multi-stage Dockerfiles accumulate these, so the
// check is mechanical: every declared stage must be consumed.

const dockerfile = readFileSync(
  join(process.cwd(), "docker", "Dockerfile"),
  "utf-8",
)

// Comments explain *why* the dead stage was dropped, so they legitimately
// mention `--prod`; only instructions are asserted on.
const instructions = dockerfile
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n")

const stages = [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gim)].map(
  (m) => m[1],
)

describe("docker/Dockerfile stages (ROADMAP P4.4)", () => {
  it("declares the expected stages", () => {
    expect(stages).toEqual(["base", "deps", "builder", "runner"])
  })

  it("references every stage (no dead prod-deps stage)", () => {
    for (const stage of stages) {
      // `base` is extended via `FROM base`; the last stage is the image itself,
      // so neither is consumed with `COPY --from=`.
      if (stage === "base" || stage === stages.at(-1)) continue
      const uses = [
        ...instructions.matchAll(new RegExp(`--from=${stage}\\b`, "g")),
      ]
      expect(uses.length, `stage "${stage}" is never used`).toBeGreaterThan(0)
    }
  })

  it("keeps the full dependency tree in the runner for the migrate service", () => {
    // The monolith's `migrate` service runs tsx + drizzle-orm out of this
    // image, so the runner must copy `deps`, not a --prod install.
    expect(instructions).toMatch(/COPY --from=deps[^\n]*node_modules/)
    expect(instructions).not.toMatch(/pnpm install[^\n]*--prod/)
  })
})
