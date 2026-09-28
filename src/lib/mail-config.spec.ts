import { beforeEach, describe, expect, it, vi } from "vitest"
import { hasActiveMailConfig } from "@/lib/mail-config"

const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  throwOnRead: false,
}))

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected: (e: unknown) => unknown,
      ) =>
        dbState.throwOnRead
          ? Promise.reject(new Error("db down")).then(onFulfilled, onRejected)
          : Promise.resolve(dbState.selectQueue.shift() ?? []).then(
              onFulfilled,
              onRejected,
            ),
    }
    return chain
  }
  return { dbRead: { select: () => makeSelectChain() }, db: {}, pool: {} }
})

beforeEach(() => {
  dbState.selectQueue.length = 0
  dbState.throwOnRead = false
})

describe("hasActiveMailConfig", () => {
  it("is true when an active config row exists", async () => {
    dbState.selectQueue.push([{ id: "c_1" }])
    await expect(hasActiveMailConfig()).resolves.toBe(true)
  })

  it("is false when the config table is empty", async () => {
    await expect(hasActiveMailConfig()).resolves.toBe(false)
  })

  it("is false when the read fails (e.g. missing table during migration)", async () => {
    dbState.throwOnRead = true
    await expect(hasActiveMailConfig()).resolves.toBe(false)
  })
})
