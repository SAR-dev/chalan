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
})
