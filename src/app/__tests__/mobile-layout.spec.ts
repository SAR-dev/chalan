import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Structural guards for the mobile-layout fixes. These cannot be
// seen in a rendered screenshot at a desktop width, and jsdom has no layout
// engine, so they are pinned against the source — the same approach as
// `button.spec.tsx`'s hit-area scan and `p2-polish.spec.ts`.

function walk(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return walk(path)
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf-8")
}

describe("mobile layout invariants", () => {
  it("collapses every multi-column grid inside a dialog", () => {
    // A dialog is capped at ~328px on a 360px phone (`dialog.tsx:55`), so a
    // bare `grid-cols-2` leaves ~150px per column and `grid-cols-3` ~100px —
    // narrower than the inputs inside them. Each of these was a real P0.
    const offenders: string[] = []
    const unprefixed = /(?<![:\w-])grid-cols-([2-9])\b/g

    for (const file of walk("src").filter((f) => /dialog/i.test(f))) {
      const src = read(file)
      if (!/<DialogContent|<FormDialog/.test(src)) continue
      for (const line of src.split("\n")) {
        // A responsive variant (`sm:grid-cols-2`) is the fix, not a violation.
        if (!/className=/.test(line)) continue
        for (const m of line.matchAll(unprefixed)) {
          offenders.push(
            `${file}: grid-cols-${m[1]} — ${line.trim().slice(0, 70)}`,
          )
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("keeps a mobile alternative for the rate matrix", () => {
    // The matrix is `min-w-[720px]`; on a phone it is two columns and a
    // scrollbar. The stacked list is what makes it readable, so it must stay.
    const src = read("src/app/rates/page.tsx")
    expect(src).toContain("min-w-[720px]")
    expect(src).toMatch(/sm:hidden/)
    expect(src).toMatch(/sm:block/)
  })

  it("keeps the responsive e2e spec wired to its own project", () => {
    // The spec only proves anything at a phone width, so it must run in the
    // `mobile` project and be ignored by `chromium` — otherwise it silently
    // reverts to a desktop viewport and passes without testing anything.
    const config = read("playwright.config.ts")
    expect(config).toMatch(/testMatch: \/41-mobile-layout\//)
    expect(config).toMatch(/testIgnore: \/41-mobile-layout\//)
    expect(config).toContain('devices["Pixel 5"]')
  })

  it("uses dynamic viewport height in the shells, not 100vh", () => {
    // `min-h-screen` is `100vh`, which on mobile browsers includes the
    // address-bar area, so the footer sits behind the URL bar.
    for (const shell of [
      "src/app/dashboard/dashboard-shell.tsx",
      "src/app/merchant/merchant-shell.tsx",
      "src/app/rider/rider-shell.tsx",
      "src/app/warehouse/warehouse-shell.tsx",
    ]) {
      expect(read(shell), `${shell} still uses min-h-screen`).not.toContain(
        "min-h-screen",
      )
      expect(read(shell)).toContain("min-h-dvh")
    }
  })

  it("lets a tab list scroll instead of overflowing its parent", () => {
    // Triggers are `whitespace-nowrap`, so a five-tab list (Account Settings)
    // was clipped on a phone before `max-w-full overflow-x-auto`.
    const src = read("src/components/ui/tabs.tsx")
    expect(src).toContain("max-w-full")
    expect(src).toContain("overflow-x-auto")
  })

  it("hides the low-priority rider table columns below sm", () => {
    // Without this the rider must scroll sideways to read the merchant and the
    // address — the data they need *before* tapping the primary action.
    for (const page of [
      "src/app/rider/pickup/page.tsx",
      "src/app/rider/delivery/page.tsx",
    ]) {
      expect(read(page), `${page} hides no columns on mobile`).toContain(
        '"hidden sm:table-cell"',
      )
    }
  })

  it("keeps the primary rider action a full-width, full-size target", () => {
    const src = read("src/app/rider/page.tsx")
    // `size="sm"` is 28px painted — too small for the one tap that matters.
    expect(src).not.toMatch(
      /size="sm"[\s\S]{0,80}rider-(start-pickup|picked-up)/,
    )
    expect(src).toContain("flex-1 sm:flex-none")
  })
})
