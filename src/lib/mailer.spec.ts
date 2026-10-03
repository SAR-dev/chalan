import { beforeEach, describe, expect, it, vi } from "vitest"

const mockSendMail = vi.fn()
const mockCreateTransport = vi.fn()
const insertCalls: { table: string; values: Record<string, unknown> }[] = []

// Config returned by the mocked `getSmtpConfig` DB read. Tests mutate `.pass`
// to prove the cached transporter is invalidated on a credential change.
const smtpState = vi.hoisted(() => ({
  rows: [
    {
      host: "smtp.test.com",
      port: "587",
      secure: false,
      user: "user",
      pass: "pass",
      fromEmail: "test@test.com",
      fromName: "Test",
    },
  ],
}))

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mockCreateTransport.mockImplementation(() => ({
      sendMail: mockSendMail,
    })),
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
          limit: () => Promise.resolve(smtpState.rows),
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
    // Fresh module state per test: the mailer caches its transporter in a
    // module-level variable, so the cache-invalidation test needs isolation.
    vi.resetModules()
    insertCalls.length = 0
    delete process.env.LOG_EMAIL_BODY
    smtpState.rows = [
      {
        host: "smtp.test.com",
        port: "587",
        secure: false,
        user: "user",
        pass: "pass",
        fromEmail: "test@test.com",
        fromName: "Test",
      },
    ]
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
    expect(sent!.values).toMatchObject({
      status: "SENT",
      to: "a@b.com",
      attempts: 1,
    })
  })

  it("does not store an HTML body in email_log", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "123" })
    const { sendMail } = await import("@/lib/mailer")
    await sendMail({ to: "a@b.com", subject: "Hi", html: "<b>Hi</b>" })
    const sent = insertCalls.find((c) => c.table === "email_log")
    expect(sent!.values).not.toHaveProperty("body")
    expect(sent!.values.textBody).toBe("Hi")
  })

  it("fails on a single attempt, logs FAILED email_log, then throws", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP error"))
    const { sendMail } = await import("@/lib/mailer")
    await expect(
      sendMail({ to: "fail@test.com", subject: "Fail", text: "..." }),
    ).rejects.toThrow("SMTP error")
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const failedLog = insertCalls.find((c) => c.table === "email_log")
    expect(failedLog?.values).toMatchObject({
      status: "FAILED",
      to: "fail@test.com",
      attempts: 1,
    })
  })

  it("keeps the sender's configured from header", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "123" })
    const { sendMail } = await import("@/lib/mailer")
    await sendMail({ to: "a@b.com", subject: "Hi", html: "<b>Hi</b>" })
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: '"Test" <test@test.com>' }),
    )
  })

  it("recreates the transporter when the SMTP password changes", async () => {
    mockSendMail.mockResolvedValue({ messageId: "123" })
    const { sendMail } = await import("@/lib/mailer")
    await sendMail({ to: "a@b.com", subject: "Hi", text: "Hi" })
    expect(mockCreateTransport).toHaveBeenCalledTimes(1)

    // Delete + recreate with the same host/port/user but a corrected password
    // must NOT reuse the old (password-cached) transporter.
    smtpState.rows = [
      {
        host: "smtp.test.com",
        port: "587",
        secure: false,
        user: "user",
        pass: "corrected-pass",
        fromEmail: "test@test.com",
        fromName: "Test",
      },
    ]
    await sendMail({ to: "b@c.com", subject: "Hi", text: "Hi" })
    expect(mockCreateTransport).toHaveBeenCalledTimes(2)
    expect(mockCreateTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: { user: "user", pass: "corrected-pass" },
      }),
    )
  })

  // — a live token in stdout is a live token in the log
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
    // Envelope only: the body sits behind an opt-in flag.
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

describe("sendTestMail", () => {
  const testConfig = {
    host: "smtp.test.com",
    port: "465",
    secure: true,
    user: "test-user",
    pass: "test-pass",
    fromEmail: "no-reply@test.com",
    fromName: "Chalan Test",
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    insertCalls.length = 0
  })

  it("builds a transporter from the given config and sends a test email", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "test-1" })
    const { sendTestMail } = await import("@/lib/mailer")
    const result = await sendTestMail(testConfig, "admin@test.com")
    expect(result).toEqual({ messageId: "test-1" })
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.test.com",
        port: 465,
        secure: true,
        auth: { user: "test-user", pass: "test-pass" },
      }),
    )
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Chalan Test" <no-reply@test.com>',
        to: "admin@test.com",
        subject: "SMTP configuration test",
      }),
    )
  })

  it("does not write an email_log row (pre-save diagnostic)", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "test-2" })
    const { sendTestMail } = await import("@/lib/mailer")
    await sendTestMail(testConfig, "admin@test.com")
    expect(insertCalls).toHaveLength(0)
  })

  it("propagates SMTP failures so the caller can surface them", async () => {
    mockSendMail.mockRejectedValue(
      new Error("Invalid login: 535 5.7.8 Username and Password not accepted"),
    )
    const { sendTestMail } = await import("@/lib/mailer")
    await expect(sendTestMail(testConfig, "admin@test.com")).rejects.toThrow(
      "535 5.7.8 Username and Password not accepted",
    )
  })
})
