import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guards two fixes that only a browser could otherwise catch.
 *
 * Both symptoms were console errors a developer would see and a user would
 * describe as "it's broken": an empty designer preview, and a print dialog that
 * printed a blank page. Neither failed a unit test, because the cause was a CSS
 * cascade and a response header rather than any logic.
 *
 * Asserted against the source text rather than a rendered DOM: the class list is
 * what ships, and Tailwind resolves it at build time, so a jsdom render would
 * show the class string but never whether it overflowed.
 */

const read = (...parts: string[]): string =>
  readFileSync(join(process.cwd(), ...parts), "utf-8")

describe("TabsList overflow", () => {
  const tabs = read("src", "components", "ui", "tabs.tsx")

  it("clips the vertical axis so the active-tab indicator cannot scroll", () => {
    // Setting `overflow-x` alone makes `overflow-y: visible` compute to `auto`.
    // The active tab's `after` rule sits at `bottom-[-5px]`, outside the list box,
    // so that computed `auto` became a real vertical scrollbar — the up/down
    // arrows that appeared at the right edge of every tab strip in the app.
    expect(tabs).toMatch(/overflow-x-auto/)
    expect(
      tabs,
      "overflow-x-auto without overflow-y-hidden reintroduces the vertical scrollbar",
    ).toMatch(/overflow-y-hidden/)
  })

  it("keeps horizontal scrolling, which is why the list scrolls at all", () => {
    // Dropping the horizontal axis instead would "fix" the arrows by clipping a
    // six-tab list on a phone — the problem `overflow-x-auto` was added for.
    expect(tabs).toMatch(/overflow-x-auto/)
  })
})

describe("print frame document", () => {
  // Comments are blanked before matching, because `print.ts` explains *why* it
  // does not use <embed> — and a raw grep for `<embed` would match that very
  // explanation and fail a correct implementation.
  const printCode = read("src", "lib", "label", "print.ts")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")

  it("frames the PDF with <iframe>, not <embed>", () => {
    // <embed> is plugin content governed by `object-src`, which is pinned to
    // 'none'. The browser blocked the PDF and the print dialog printed nothing,
    // while Download worked because it never renders the document.
    expect(printCode).toMatch(/<iframe src=/)
    expect(printCode).not.toMatch(/<embed[\s>]/)
  })

  it("still frames via srcdoc, so print() runs in our own origin", () => {
    // Navigating a frame straight at a blob PDF hands it to the browser's viewer,
    // which lives in its own origin and prints unreliably.
    expect(printCode).toContain("srcdoc")
  })
})
