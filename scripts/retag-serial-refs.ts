import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// One-shot rewrite of prose references to the old global `S<n>` scenario
// serials, now that ids are `<fileNN><index>`.
//
// Uses plain-string replacement and reports a count per rule, because a silent
// no-op here is worse than a failure: a stale `S58` left in a comment reads as
// a serial that no longer exists. Every rule must report >= 1.

const cwd = process.cwd()
const edits: {
  file: string
  from: string | RegExp
  to: string
  why: string
}[] = [
  // ── spec comments ────────────────────────────────────────────────────────
  {
    file: "e2e/specs/01-core-flows.spec.ts",
    from: "S25 keeps its id",
    to: "The scenario keeps its identity",
    why: "serial no longer exists",
  },
  {
    file: "e2e/specs/01-core-flows.spec.ts",
    from: "suite ids are a unique serial, not a name",
    to: "suite ids name a scenario, not its copy",
    why: "ids are not serials any more",
  },
  {
    file: "e2e/specs/02-business-flows.spec.ts",
    from: "Replaces the retired S33 (dispatch desk) and S34 (intake queue). Their serials",
    to: "Replaces the retired dispatch-desk and intake-queue scenarios. Their ids went",
    why: "retired global serials have no meaning",
  },
  {
    file: "e2e/specs/02-business-flows.spec.ts",
    from: "stay unused on purpose: renumbering every later scenario to close the gap",
    to: "with them: ids are scoped to a file, so a deletion renumbers that one file",
    why: "gap preservation no longer applies",
  },
  {
    file: "e2e/specs/02-business-flows.spec.ts",
    from: "churns history for no safety gain, and `docs-drift.spec.ts` allows holes.",
    to: "rather than leaving a hole for readers to wonder about.",
    why: "docs-drift now forbids holes",
  },
  // ── serial-derived fixture strings ───────────────────────────────────────
  {
    file: "e2e/specs/21-email-outbox.spec.ts",
    from: "S52",
    to: "2101",
    why: "old serial",
  },
  {
    file: "e2e/specs/21-email-outbox.spec.ts",
    from: "s52",
    to: "s2101",
    why: "old serial",
  },
  {
    file: "e2e/specs/24-packages.spec.ts",
    from: "S58",
    to: "2401",
    why: "old serial",
  },
  {
    file: "e2e/specs/24-packages.spec.ts",
    from: "S59",
    to: "2402",
    why: "old serial",
  },
  {
    file: "e2e/specs/24-packages.spec.ts",
    from: "S60",
    to: "2403",
    why: "old serial",
  },
  {
    file: "e2e/specs/25-packages-quota.spec.ts",
    from: "S61",
    to: "2501",
    why: "old serial",
  },
  {
    file: "e2e/specs/25-packages-quota.spec.ts",
    from: "s61",
    to: "s2501",
    why: "old serial",
  },
  {
    file: "e2e/specs/26-pricing-coverage.spec.ts",
    from: "S62",
    to: "2601",
    why: "old serial",
  },
  {
    file: "e2e/specs/26-pricing-coverage.spec.ts",
    from: "S63",
    to: "2602",
    why: "old serial",
  },
  // ── shared e2e code ──────────────────────────────────────────────────────
  {
    file: "e2e/helpers.ts",
    from: "S1 logs in as merchant",
    to: "0101 logs in as merchant",
    why: "old serial",
  },
  {
    file: "e2e/selectors.ts",
    from: "S41/S42",
    to: "1201/1202",
    why: "old serial",
  },
  // ── docs ─────────────────────────────────────────────────────────────────
  {
    file: "docs/ENV.md",
    from: "(S42, S47)",
    to: "(1202, 1601)",
    why: "old serial",
  },
  { file: "docs/ENV.md", from: "(S52)", to: "(2101)", why: "old serial" },
  {
    file: "docs/SETUP.md",
    from: "specs/03-onboarding.spec.ts",
    to: "specs/03-merchant-registration.spec.ts",
    why: "file was already misnamed",
  },
  {
    file: "CONTRIBUTING.md",
    from: "03-onboarding.spec.ts",
    to: "03-merchant-registration.spec.ts",
    why: "file was already misnamed",
  },
  {
    file: "CONTRIBUTING.md",
    from: "**51 tests total** across 6 spec files.",
    to: "**149 tests total** across 37 spec files.",
    why: "suite grew 3x",
  },
  {
    file: "CONTRIBUTING.md",
    // The directory block listed six files as if complete. Mark it partial
    // rather than printing all 37 — the ids below say where a scenario lives.
    from: /^( {4}06-support\.spec\.ts.*$)/m,
    to: "$1\n    …                              # 07–37 continue in the same shape",
    why: "list was presented as complete",
  },
  {
    file: "CONTRIBUTING.md",
    // Regex: the surrounding prose contains en/em dashes whose exact byte a
    // terminal render can't be trusted for, so the shape is matched instead.
    from: /scenario id in `S<number>\. <Name>` format \(currently \*\*S1[\u2013\u2014-]S37\*\*, no gaps, no\nduplicates\)\./,
    to: "scenario id in `<file number><index>. <Name>` format — `2901.` is the first\nscenario in `29-sign-out.spec.ts`. Ids are scoped to their file, so a deletion\nrenumbers that one file and leaves no gap.",
    why: "scheme changed",
  },
  {
    file: "CONTRIBUTING.md",
    from: /2\. \*\*Name the describe `S<number>\. <Scenario>`\*\*[\s\S]*?numbers, and never leave a describe unprefixed\./,
    to: '2. **Name the describe `<file number><index>. <Scenario>`.** The prefix is\n   the file\'s own two-digit number; the index is the next free one *in that\n   file* (grep `test.describe("` in the file — there is no cross-file "current\n   max" to look up). Renumber the file after a deletion. Never leave a describe\n   unprefixed.',
    why: "scheme changed",
  },
]

let total = 0
let failures = 0
for (const e of edits) {
  const path = join(cwd, e.file)
  const raw = readFileSync(path, "utf-8")
  const next =
    typeof e.from === "string"
      ? raw.split(e.from).join(e.to)
      : raw.replace(e.from, e.to)
  const count =
    typeof e.from === "string"
      ? raw.split(e.from).length - 1
      : (raw.match(e.from) ?? []).length
  if (count === 0) {
    failures++
    console.log(`MISS  ${e.file}  (${e.why})`)
    continue
  }
  total += count
  if (next !== raw) writeFileSync(path, next, "utf-8")
  console.log(`ok ${String(count).padStart(2)}  ${e.file}  ${e.why}`)
}
console.log(`\n${total} replacement(s), ${failures} missed`)
if (failures > 0) process.exitCode = 1
