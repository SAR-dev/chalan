// @vitest-environment jsdom

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button, buttonVariants } from "@/components/ui/button"

// — WCAG 2.5.5 (AAA) wants a 44x44 CSS px target. The dense
// variants are 24-36px, so the hit area is expanded with a pseudo-element rather
// than by making every button visually bigger.
//
// jsdom has no layout engine, so "is this 44px" cannot be measured here. What
// *can* be held is the mechanism — every button carries the hook, the rule that
// implements it really does say 44px, and the buttons that would be broken by
// the hook are switched off. The pixels themselves are the browser's job; the
// e2e suite is what proves they did not move.

const GLOBALS_CSS = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf-8",
)

describe("button hit area", () => {
  it("carries the hit-area hook on every size variant", () => {
    const sizes = [
      "xs",
      "sm",
      "default",
      "lg",
      "icon",
      "icon-xs",
      "icon-sm",
      "icon-lg",
    ] as const

    for (const size of sizes) {
      const cls = buttonVariants({ size })
      expect(cls, `size=${size} must carry the hook`).toContain("hit-target-44")
      // The pseudo-element needs a positioning context; twMerge removes this
      // when a caller asks for `absolute`, which is what the guard is for.
      expect(cls, `size=${size} must establish a positioning context`).toMatch(
        /\brelative\b/,
      )
    }
  })

  it("keeps the hook out of the way of a caller-supplied position", () => {
    // The dialog/sheet close buttons are `absolute`. `Button` runs the merged
    // string through `cn` (twMerge), which must drop `relative` rather than
    // emitting both position utilities — otherwise which one wins is decided by
    // stylesheet order rather than by the caller.
    render(
      <Button
        size="icon-sm"
        className="absolute top-2 right-2"
        aria-label="Close"
      >
        x
      </Button>,
    )
    const cls = screen.getByRole("button", { name: "Close" }).className
    expect(cls).toContain("absolute")
    expect(cls).not.toMatch(/(^|\s)relative(\s|$)/)
    // The hook itself stays — the CSS guard keys off `absolute`, not off the
    // absence of `relative`.
    expect(cls).toContain("hit-target-44")
  })

  it("expands to at least 44px without touching the painted size", () => {
    const rule = GLOBALS_CSS.slice(GLOBALS_CSS.indexOf(".hit-target-44::after"))
    expect(rule).toMatch(/\.hit-target-44::after\s*\{/)
    // Both axes, and `max()` so a control already at or above the floor is
    // unaffected — that is what makes this safe on every button.
    expect(rule).toMatch(/width:\s*max\(100%,\s*44px\)/)
    expect(rule).toMatch(/height:\s*max\(100%,\s*44px\)/)
    // Transparent: the point is the hit area, not a bigger box.
    expect(rule).not.toMatch(/background/)
    expect(rule).not.toMatch(/\bborder\b:/)
    // Centred, so it grows in all directions rather than only down-right.
    expect(rule).toMatch(/translate:\s*-50%\s+-50%/)
  })

  it("switches the pseudo-element off for self-positioned buttons", () => {
    // Without this, a button whose `relative` was merged away would anchor its
    // `::after` to some outer container and swallow clicks across that region.
    const guard = GLOBALS_CSS.slice(
      GLOBALS_CSS.indexOf(".absolute.hit-target-44::after"),
    )
    expect(guard).toMatch(/\.absolute\.hit-target-44::after/)
    expect(guard).toMatch(/\.fixed\.hit-target-44::after/)
    expect(guard.slice(0, 200)).toMatch(/content:\s*none/)
  })

  it("renders the hook on a real button, not only in the variant string", () => {
    render(
      <Button size="icon-xs" aria-label="Remove photo">
        x
      </Button>,
    )
    expect(
      screen.getByRole("button", { name: "Remove photo" }).className,
    ).toContain("hit-target-44")
  })

  it("targets controls that are below the floor today", () => {
    // Guards the premise: `size-6` is 24px, so the hook is doing real work. If
    // the dense variants are ever enlarged to 44px this test fails, which is the
    // signal to delete the rule rather than leave it as dead weight.
    expect(buttonVariants({ size: "icon-xs" })).toMatch(/(^|\s)size-6(\s|$)/)
    expect(buttonVariants({ size: "xs" })).toMatch(/(^|\s)h-6(\s|$)/)
  })
})

// The expander's failure mode is silent. Nothing about it is visible: the button
// looks right, the target is genuinely 44px, and no test asserts anything — but
// two buttons that were close enough now overlap, and the later one in DOM order
// paints on top. A click aimed at one button's edge lands on the *other* one,
// which for a prev/next pair means the wrong direction.
//
// Overlap happens when the gap is smaller than what the two expanders add
// between them: a button of size s grows by (44 - s) / 2 per side, so two
// neighbours collide once `gap < ((44 - a) + (44 - b)) / 2`. At `gap-3` the
// expanders of two 32px buttons meet exactly at the midpoint and each owns its
// own half of the gap, which is the tightest arrangement that is still correct.

/** Tailwind's spacing scale, in px. Unlisted steps are not worth guessing at. */
const GAP_PX: Record<string, number> = {
  "0": 0,
  "0.5": 2,
  "1": 4,
  "1.5": 6,
  "2": 8,
  "2.5": 10,
  "3": 12,
  "4": 16,
  "5": 20,
  "6": 24,
  "8": 32,
  "10": 40,
  "12": 48,
}

/** The icon variants' square edges, from `buttonVariants`. */
const ICON_VARIANT_PX: Record<string, number> = {
  icon: 32,
  "icon-xs": 24,
  "icon-sm": 28,
  "icon-lg": 36,
}

const TARGET_PX = 44

function componentFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...componentFiles(full))
    } else if (
      entry.endsWith(".tsx") &&
      !entry.includes(".spec.") &&
      !entry.includes(".test.")
    ) {
      found.push(full)
    }
  }
  return found
}

/**
 * The button's square edge in px, or `null` when it is not a square button.
 *
 * A `className="size-8"` wins because that is what `twMerge` resolves to, but
 * the variant is the fallback for the common `size="icon"` form. Text buttons
 * are skipped: their width comes from their label, so a 24px-tall text button is
 * not necessarily a 44px-wide target and the collision arithmetic does not hold.
 */
function buttonEdgePx(tag: string): number | null {
  const explicit = tag.match(/(?:^|["\s])size-(\d+(?:\.\d+)?)(?=["\s])/)
  if (explicit) return Number(explicit[1]) * 4
  const variant = tag.match(/\bsize=["']([^"']+)["']/)
  if (!variant) return null
  return ICON_VARIANT_PX[variant[1]] ?? null
}

/**
 * A `<Button …>` opening tag plus where its element ends.
 *
 * The element end matters more than the opening tag: an icon button's children
 * (the icon itself) sit between the opening tags of two neighbouring buttons, so
 * measuring from the opening tag makes every pair look separated. Measuring from
 * `</Button>` is what actually answers "is anything between them".
 */
interface FoundButton {
  px: number
  /** Line the element's `</Button>` is on, and the column just past it. */
  closeLine: number
  closeCol: number
}

const CLOSE_TAG = "</Button>"

function findButton(lines: string[], from: number): FoundButton | null {
  // The opening tag, which is where the size lives.
  let tag = ""
  let depth = 0
  let opened = false
  for (let i = from; i < Math.min(lines.length, from + 40); i++) {
    for (const ch of lines[i]) {
      tag += ch
      if (ch === "{") depth++
      else if (ch === "}") depth--
      // Only a `>` at the top level ends the opening tag; `=>` inside a handler
      // and `>` inside a comparison both have to be ignored.
      else if (ch === ">" && depth === 0) opened = true
    }
    if (opened) {
      const px = buttonEdgePx(tag)
      // `</Button>` cannot occur inside a JS string in this codebase, so a plain
      // search from here is enough — no need to track element nesting.
      for (let j = i; j < Math.min(lines.length, from + 60); j++) {
        const at = lines[j].indexOf(CLOSE_TAG)
        if (at >= 0) {
          return px === null
            ? null
            : { px, closeLine: j, closeCol: at + CLOSE_TAG.length }
        }
      }
      return null
    }
    tag += "\n"
  }
  return null
}

/** Where the container that opens on `start` closes, by indentation. */
function containerEnd(lines: string[], start: number): number {
  const indent = lines[start].length - lines[start].trimStart().length
  for (let i = start + 1; i < Math.min(lines.length, start + 80); i++) {
    const text = lines[i].trimStart()
    if (lines[i].length - text.length === indent && text.startsWith("</")) {
      return i
    }
  }
  return Math.min(lines.length, start + 80)
}

interface Collision {
  where: string
  detail: string
}

/**
 * Every place where two adjacent square buttons' hit areas overlap.
 *
 * "Adjacent" means nothing but whitespace and JSX comments sits between them,
 * which is what makes them neighbours. The announcement banner's prev/next
 * buttons are separated by a `1 / 5` counter, so they are not flagged even
 * though the container's `gap` is small — they are nowhere near each other.
 */
function findCollisions(): Collision[] {
  const collisions: Collision[] = []

  for (const file of componentFiles(join(process.cwd(), "src"))) {
    const lines = readFileSync(file, "utf-8").split("\n")
    const where = relative(process.cwd(), file).replace(/\\/g, "/")

    for (let i = 0; i < lines.length; i++) {
      const classes = lines[i].match(/className="([^"]*)"/)?.[1]
      if (!classes || !/\b(?:flex|grid)\b/.test(classes)) continue

      // `gap-x-*` only moves things horizontally, which is the axis that matters.
      const step = classes.match(/\bgap(?:-x)?-(\d+(?:\.\d+)?)\b/)?.[1]
      const gap = step === undefined ? undefined : GAP_PX[step]
      if (gap === undefined) continue

      const end = containerEnd(lines, i)
      const buttons: (FoundButton & { at: number })[] = []
      for (let j = i; j < end; j++) {
        if (!lines[j].includes("<Button")) continue
        const button = findButton(lines, j)
        if (button) buttons.push({ ...button, at: j })
      }

      for (let b = 1; b < buttons.length; b++) {
        const prev = buttons[b - 1]
        const next = buttons[b]

        // Whatever sits between the two *elements* decides whether they are
        // neighbours. Comments are noise; anything else means content is holding
        // them apart, so the container's gap is not what separates them.
        const between = [
          lines[prev.closeLine].slice(prev.closeCol),
          lines.slice(prev.closeLine + 1, next.at).join("\n"),
          lines[next.at].slice(0, lines[next.at].indexOf("<Button")),
        ]
          .join("\n")
          .replace(/\/\*[\s\S]*?\*\//g, "")
        if (/[^\s]/.test(between)) continue

        const reach = (TARGET_PX - prev.px + (TARGET_PX - next.px)) / 2
        if (gap < reach) {
          const needed =
            Object.keys(GAP_PX).find((k) => GAP_PX[k] >= reach) ?? String(reach)
          collisions.push({
            where: `${where}:${i + 1}`,
            detail: `${prev.px}px and ${next.px}px buttons are ${gap}px apart, so their ${TARGET_PX}px targets overlap by ${(reach - gap).toFixed(0)}px and the later button wins that region; each owns the gap instead at gap-${needed}`,
          })
        }
      }
    }
  }

  return collisions
}

describe("hit areas do not overlap", () => {
  it("finds no two adjacent buttons whose targets collide", () => {
    // Found by hand once already: the table footer's prev/next pair sat at
    // `gap-1`, which put their expanders 8px over each other. There is no way to
    // see that by reading the button, so it is checked mechanically from here on.
    expect(findCollisions()).toEqual([])
  })
})
