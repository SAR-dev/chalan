import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { logger, serializeError } from "./logger"

let logSpy: ReturnType<typeof vi.spyOn>
let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  delete process.env.LOG_LEVEL
})

afterEach(() => {
  logSpy.mockRestore()
  errSpy.mockRestore()
  delete process.env.LOG_LEVEL
})

function lastRecord(spy: ReturnType<typeof vi.spyOn>) {
  return JSON.parse(spy.mock.calls.at(-1)?.[0] as string)
}

describe("logger", () => {
  it("emits one JSON line with level, time, msg and fields", () => {
    logger.info("hello", { requestId: "r1" })
    const record = lastRecord(logSpy)
    expect(record).toMatchObject({
      level: "info",
      msg: "hello",
      requestId: "r1",
    })
    expect(typeof record.time).toBe("string")
  })

  it("routes warn/error to stderr and serializes Error", () => {
    logger.error("boom", { err: new Error("nope") })
    const record = lastRecord(errSpy)
    expect(record.level).toBe("error")
    expect(record.err).toMatchObject({ name: "Error", message: "nope" })
    expect(logSpy).not.toHaveBeenCalled()
  })

  it("child merges base context into every line", () => {
    logger.child({ requestId: "r2", path: "/x" }).warn("careful")
    expect(lastRecord(errSpy)).toMatchObject({
      requestId: "r2",
      path: "/x",
      msg: "careful",
    })
  })

  it("honours LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "error"
    logger.info("suppressed")
    expect(logSpy).not.toHaveBeenCalled()
    logger.error("emitted")
    expect(errSpy).toHaveBeenCalledTimes(1)
  })

  it("serializeError handles non-Errors and nested causes", () => {
    expect(serializeError("plain")).toEqual({ message: "plain" })
    expect(
      serializeError(new Error("outer", { cause: new Error("inner") })),
    ).toMatchObject({ message: "outer", cause: { message: "inner" } })
  })
})
