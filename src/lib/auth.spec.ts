import { afterEach, describe, expect, it, vi } from "vitest"

const mockEnqueue = vi.fn()
const mockFlush = vi.fn()
const mockPasswordResetTemplate = vi.fn()

vi.mock("@/lib/email-outbox", () => ({
  enqueueEmail: (...args: unknown[]) => mockEnqueue(...args),
  flushEmailOutbox: (...args: unknown[]) => mockFlush(...args),
}))

vi.mock("@/lib/mail-templates", () => ({
  passwordResetTemplate: (...args: unknown[]) =>
    mockPasswordResetTemplate(...args),
}))

vi.mock("@/lib/db", () => ({
  pool: {},
}))

vi.mock("better-auth", () => ({
  betterAuth: vi.fn(() => ({})),
}))

vi.mock("better-auth/plugins", () => ({
  admin: vi.fn(() => ({})),
  twoFactor: vi.fn(() => ({})),
}))

afterEach(() => {
  mockEnqueue.mockReset()
  mockFlush.mockReset()
  mockPasswordResetTemplate.mockReset()
})

async function importHandler() {
  const { handlePasswordReset } = await import("@/lib/auth")
  return handlePasswordReset
}

describe("handlePasswordReset", () => {
  it("prepends siteUrl when url is relative", { timeout: 60000 }, async () => {
    mockPasswordResetTemplate.mockResolvedValue({
      subject: "Reset",
      html: "<p>reset</p>",
      text: "reset",
    })
    mockEnqueue.mockResolvedValue(undefined)

    const handler = await importHandler()
    await handler({
      user: { name: "Alice", email: "alice@test.com" },
      url: "/reset-password?token=abc",
    })

    expect(mockPasswordResetTemplate).toHaveBeenCalledWith({
      userName: "Alice",
      resetUrl: "http://localhost:3000/reset-password?token=abc",
    })
  })

  it("keeps full http url unchanged", async () => {
    mockPasswordResetTemplate.mockResolvedValue({
      subject: "Reset",
      html: "<p>reset</p>",
      text: "reset",
    })
    mockEnqueue.mockResolvedValue(undefined)

    const handler = await importHandler()
    await handler({
      user: { name: "Bob", email: "bob@test.com" },
      url: "https://example.com/reset-password?token=xyz",
    })

    expect(mockPasswordResetTemplate).toHaveBeenCalledWith({
      userName: "Bob",
      resetUrl: "https://example.com/reset-password?token=xyz",
    })
  })

  it("enqueues the email to the user with the template output", async () => {
    const templateOutput = {
      subject: "Reset your password",
      html: "<p>Hi Bob</p>",
      text: "Hi Bob",
    }
    mockPasswordResetTemplate.mockResolvedValue(templateOutput)
    mockEnqueue.mockResolvedValue(undefined)

    const handler = await importHandler()
    await handler({
      user: { name: "Bob", email: "bob@test.com" },
      url: "/reset?token=123",
    })

    expect(mockEnqueue).toHaveBeenCalledWith({
      to: "bob@test.com",
      ...templateOutput,
    })
    expect(mockFlush).toHaveBeenCalled()
  })

  it("does not throw when enqueue fails", async () => {
    mockPasswordResetTemplate.mockResolvedValue({
      subject: "Reset",
      html: "<p>reset</p>",
      text: "reset",
    })
    mockEnqueue.mockRejectedValue(new Error("DB down"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const handler = await importHandler()
    await handler({
      user: { name: "Eve", email: "eve@test.com" },
      url: "/reset?token=999",
    })

    expect(spy).toHaveBeenCalledWith(
      "[email-outbox] Password reset enqueue failed:",
      expect.any(Error),
    )
    spy.mockRestore()
  })
})
