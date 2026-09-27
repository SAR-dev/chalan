import { beforeEach, describe, expect, it, vi } from "vitest"

const mockSendMail = vi.fn()
const insertCalls: { table: string; values: Record<string, unknown> }[] = []

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: mockSendMail }),
  },
}))

vi.mock("@/lib/db", () => ({
  db: {
    insert: (table: any) => ({
      values: (v: any) => {
        const name =
          typeof table?._?.name === "string" ? table._.name : "unknown"
        insertCalls.push({ table: name, values: v })
        return Promise.resolve()
      },
    }),
  },
  dbRead: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                host: "smtp.test.com",
                port: 587,
                secure: false,
                user: "user",
                pass: "pass",
                fromEmail: "test@test.com",
                fromName: "Test",
              },
            ]),
        }),
      }),
    }),
  },
}))

vi.mock("@/lib/db/schema", () => ({
  emailLog: { _: { name: "email_log" } },
  mailConfig: { isActive: { _: { name: "isActive" } } },
}))

describe("sendMail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertCalls.length = 0
    delete process.env.LOG_EMAIL_BODY
  })

  it("skips send when MAIL_DISABLED=1", async () => {
    process.env.MAIL_DISABLED = "1"
    const { sendMail } = await import("@/lib/mailer")
    await sendMail({ to: "test@test.com", subject: "Test", text: "Hello" })
    expect(mockSendMail).not.toHaveBeenCalled()
    delete process.env.MAIL_DISABLED
  })

  it("sends successfully and logs SENT in email_log", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "123" })
    const { sendMail } = await import("@/lib/mailer")
    await sendMail({ to: "a@b.com", subject: "Hi", html: "<b>Hi</b>" })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const sent = insertCalls.find((c) => c.table === "email_log")
    expect(sent).toBeDefined()
    expect(sent!.values).toMatchObject({ status: "SENT", to: "a@b.com" })
  })

  it("exhausts retries, logs FAILED email_log, then throws", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP error"))
    const { sendMail } = await import("@/lib/mailer")
    await expect(
      sendMail({ to: "fail@test.com", subject: "Fail", text: "..." }),
    ).rejects.toThrow("SMTP error")
    expect(mockSendMail).toHaveBeenCalledTimes(3)
    const failedLog = insertCalls.find((c) => c.table === "email_log")
    expect(failedLog?.values).toMatchObject({
      status: "FAILED",
      to: "fail@test.com",
    })
  })

  it("succeeds on retry", async () => {
    mockSendMail
      .mockRejectedValueOnce(new Error("Temp error"))
      .mockResolvedValueOnce({ messageId: "456" })
    const { sendMail } = await import("@/lib/mailer")
    await sendMail({ to: "retry@test.com", subject: "Retry", text: "..." })
    expect(mockSendMail).toHaveBeenCalledTimes(2)
    const sent = insertCalls.find((c) => c.table === "email_log")
    expect(sent?.values).toMatchObject({ status: "SENT", to: "retry@test.com" })
  })

  // ROADMAP P0.7 — a live token in stdout is a live token in the log
  // aggregator, in `docker logs`, and in CI output.
  it("omits the body from the console log unless LOG_EMAIL_BODY=1", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "789" })
    const logs: string[] = []
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "))
    })
    const { sendMail } = await import("@/lib/mailer")
    try {
      await sendMail({
        to: "leak@test.com",
        subject: "Reset your password",
        text: "Reset: http://localhost:3000/reset-password?token=super-secret-token-123&next=/dashboard",
      })
    } finally {
      logSpy.mockRestore()
    }
    const records = logs.map((line) => JSON.parse(line))
    const sending = records.find((r) => r.msg === "Sending email")
    // Envelope only: P4.4 moved the body behind an opt-in flag.
    expect(sending).toMatchObject({
      level: "info",
      to: "leak@test.com",
      subject: "Reset your password",
    })
    expect(sending).not.toHaveProperty("body")
    expect(logs.join("\n")).not.toContain("super-secret-token-123")
  })

  it("redacts link tokens from the body when LOG_EMAIL_BODY=1", async () => {
    process.env.LOG_EMAIL_BODY = "1"
    mockSendMail.mockResolvedValueOnce({ messageId: "790" })
    const logs: string[] = []
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "))
    })
    const { sendMail } = await import("@/lib/mailer")
    try {
      await sendMail({
        to: "leak@test.com",
        subject: "Reset your password",
        text: "Reset: http://localhost:3000/reset-password?token=super-secret-token-123&next=/dashboard",
      })
    } finally {
      logSpy.mockRestore()
      delete process.env.LOG_EMAIL_BODY
    }
    const records = logs.map((line) => JSON.parse(line))
    const sending = records.find((r) => r.msg === "Sending email")
    // Even opted in, a live token must never reach stdout.
    expect(sending.body).toContain("token=[redacted]")
    expect(logs.join("\n")).not.toContain("super-secret-token-123")
  })

  it("keeps the activation link in email_log (bounded) for the admin log view", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "abc" })
    const { sendMail } = await import("@/lib/mailer")
    await sendMail({
      to: "verify@test.com",
      subject: "Verify",
      text: "Verify: http://localhost:3000/api/auth/verify-email?token=activation-token-abc",
    })
    const sent = insertCalls.find((c) => c.table === "email_log")
    // Truncated, but still there: single-use, 24h, admin-only, 10-day retention.
    expect(sent?.values.textBody).toContain("token=activation-token-abc")
  })

  it("truncates an oversized body in email_log", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "def" })
    const { sendMail } = await import("@/lib/mailer")
    await sendMail({
      to: "big@test.com",
      subject: "Big",
      text: "x".repeat(5_000),
    })
    const sent = insertCalls.find((c) => c.table === "email_log")
    const body = sent?.values.textBody as string
    expect(body.length).toBeLessThan(5_000)
    expect(body).toContain("[truncated 3000 chars]")
  })
})
