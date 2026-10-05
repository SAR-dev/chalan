import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Adding an order status is a compile error in every `Record<OrderStatus, …>` —
 * labels, tones, status ranks, tracking-page maps. That is the compiler doing
 * its job, and it is why a new status cannot land half-implemented in typed
 * code.
 *
 * It is **not** a compile error in an inline array:
 *
 *     const canCancel = ["PENDING", "APPROVED", "PICKED_UP"].includes(o.status)
 *
 * That compiles happily and silently omits whatever status sits between the
 * two. Every list on this page is exactly that shape — six copies of the
 * cancellable window — and when `OUT_FOR_PICKUP` was added, all six were
 * skipped together, which is how a parcel nobody had collected became
 * un-cancellable while the parcel that *had* been collected stayed
 * cancellable.
 *
 * This spec is the guard for that class of bug: scan the source for arrays
 * written purely in order-status literals and require the newest pre-collection
 * status to be there.
 */
describe("order status lists stay complete", () => {
  const ORDER_STATUSES = new Set([
    "PENDING",
    "APPROVED",
    "OUT_FOR_PICKUP",
    "PICKED_UP",
    "IN_WAREHOUSE",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "FAILED_ATTEMPT",
    "RETURNED",
    "CANCELLED",
  ])

  /** The status whose absence is the bug this looks for. */
  const REQUIRED = "OUT_FOR_PICKUP"

  const SRC = join(process.cwd(), "src")

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p, out)
      // Specs are excluded: they hold fixtures (an arbitrary handful of rows to
      // prove a grouping), where needing every status would be noise.
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.spec\./.test(entry.name))
        out.push(p)
    }
    return out
  }

  /**
   * Which lists this applies to.
   *
   * Not every array of status literals is a "window" that a new status belongs
   * in. The cancellable window, the ongoing lanes and the merchant's active
   * list all describe *how far a parcel has travelled* — those must mention a
   * status sitting between APPROVED and PICKED_UP. By contrast:
   *
   *   - `COMPLETED_STATUSES`, `NO_COD_REMAINING` and the stale-order cron are
   *     keyed to a phase OUT_FOR_PICKUP is deliberately outside of;
   *   - rider, payout and merchant enums reuse "PENDING"/"APPROVED" but are not
   *     order statuses at all.
   *
   * Hence the shape: every token must be an order status (which removes the
   * foreign enums), and the list must reach at least as far as the pre-pickup
   * leg — signalled by PICKED_UP itself, or by APPROVED alongside an order-only
   * status such as IN_WAREHOUSE. A bare `[PENDING, APPROVED]` is ambiguous
   * with a payout list and is left alone.
   */
  function isAStatusWindow(tokens: string[]): boolean {
    if (tokens.length < 2) return false
    if (!tokens.every((t) => ORDER_STATUSES.has(t))) return false
    const ORDER_ONLY = new Set([
      "PICKED_UP",
      "IN_WAREHOUSE",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "RETURNED",
      "CANCELLED",
      "FAILED_ATTEMPT",
    ])
    if (tokens.includes("PICKED_UP")) return true
    return tokens.includes("APPROVED") && tokens.some((t) => ORDER_ONLY.has(t))
  }

  function statusListsIn(file: string): { line: number; text: string }[] {
    const lines = readFileSync(file, "utf8").split(/\r?\n/)
    const found: { line: number; text: string }[] = []
    for (let i = 0; i < lines.length; i++) {
      if (!/\[\s*$/.test(lines[i])) continue
      const block: string[] = []
      for (let j = i + 1; j < lines.length && j < i + 40; j++) {
        if (/^\s*\]/.test(lines[j])) break
        block.push(lines[j])
      }
      if (block.length === 0) continue
      const tokens = [...(block.join(" ").match(/"([A-Z_]{3,})"/g) ?? [])].map(
        (t) => t.slice(1, -1),
      )
      if (isAStatusWindow(tokens)) {
        found.push({ line: i + 1, text: tokens.join(", ") })
      }
    }
    return found
  }

  it("includes OUT_FOR_PICKUP in every order-status list", () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      for (const { line, text } of statusListsIn(file)) {
        if (text.split(", ").includes(REQUIRED)) continue
        offenders.push(`${relative(process.cwd(), file)}:${line}  [${text}]`)
      }
    }
    expect(
      offenders,
      `These arrays are written in order-status literals but omit ` +
        `${REQUIRED}. If a list genuinely excludes it, say so in a ` +
        `comment beside the list — silence is what let six copies of the ` +
        `cancellable window drift together.`,
    ).toEqual([])
  })

  /**
   * Pins the classifier itself, so the guard cannot be weakened into passing by
   * accident. The first case is the exact array that was wrong before
   * `OUT_FOR_PICKUP` existed — six copies of it, all missed.
   */
  it("recognises a status window, and leaves lookalikes alone", () => {
    expect(
      isAStatusWindow([
        "PENDING",
        "APPROVED",
        "PICKED_UP",
        "IN_WAREHOUSE",
        "IN_TRANSIT",
      ]),
    ).toBe(true)
    expect(isAStatusWindow(["PICKED_UP", "IN_WAREHOUSE", "IN_TRANSIT"])).toBe(
      true,
    )
    // A payout list, and a "no COD remaining" list — same tokens, not windows.
    expect(isAStatusWindow(["PENDING", "APPROVED"])).toBe(false)
    expect(isAStatusWindow(["DELIVERED", "CANCELLED", "RETURNED"])).toBe(false)
    expect(isAStatusWindow(["PENDING", "APPROVED", "REJECTED", "ACTIVE"])).toBe(
      false,
    )
  })
})
