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

  // `redact.ts` existed but was never called from here, so the helpers
  // guarded the mailer while the log line itself was raw — and the log line is
  // what reaches container stdout, CI output and whatever aggregates them
  describe("redaction (ROADMAP P0.7)", () => {
    it("redacts a credential in the message", () => {
      logger.info("reset https://app.test/reset?token=SUPERSECRET123")
      const record = lastRecord(logSpy)
      expect(record.msg).toContain("[redacted]")
      expect(record.msg).not.toContain("SUPERSECRET123")
    })

    it("redacts credentials in string fields", () => {
      logger.info("delivery failed", {
        url: "https://app.test/track/abc?verify=ANOTHERSECRET",
      })
      const record = lastRecord(logSpy)
      expect(record.url).toContain("[redacted]")
      expect(record.url).not.toContain("ANOTHERSECRET")
    })

    it("leaves non-string fields untouched", () => {
      logger.info("counts", { attempts: 3, ok: true, ids: ["a", "b"] })
      expect(lastRecord(logSpy)).toMatchObject({
        attempts: 3,
        ok: true,
        ids: ["a", "b"],
      })
    })

    it("redacts a token embedded in an error message and stack", () => {
      const err = new Error("POST https://app.test/activate?token=RAWTOKEN99")
      const serialized = serializeError(err)
      expect(serialized.message).not.toContain("RAWTOKEN99")
      expect(String(serialized.stack)).not.toContain("RAWTOKEN99")
      expect(serialized.message).toContain("[redacted]")
    })
  })
})
