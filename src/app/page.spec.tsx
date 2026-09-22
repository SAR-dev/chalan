// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, resetIds } from "@/app/__tests__/test-utils"

let mockSession: ReturnType<typeof makeUser> | null

vi.mock("@/lib/api-auth", () => ({
  requireSession: vi.fn(() => mockSession),
}))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT")
  }),
}))

beforeEach(() => {
  resetIds()
  mockSession = null
})

async function importPage() {
  const Page = (await import("./page")).default
  try {
    await Page()
  } catch {
    // redirect() throws NEXT_REDIRECT to halt rendering.
  }
}

describe("Root page", () => {
  it("redirects anonymous visitors to /landing", async () => {
    await importPage()
    const { redirect } = await import("next/navigation")
    expect(redirect).toHaveBeenCalledWith("/landing")
  })

  it("redirects merchants to /merchant", async () => {
    mockSession = makeUser({ role: "MERCHANT" })
    await importPage()
    const { redirect } = await import("next/navigation")
    expect(redirect).toHaveBeenCalledWith("/merchant")
  })

  it("redirects riders to /rider", async () => {
    mockSession = makeUser({ role: "RIDER" })
    await importPage()
    const { redirect } = await import("next/navigation")
    expect(redirect).toHaveBeenCalledWith("/rider")
  })

  it("redirects warehouse admins to /warehouse", async () => {
    mockSession = makeUser({ role: "WAREHOUSE_ADMIN" })
    await importPage()
    const { redirect } = await import("next/navigation")
    expect(redirect).toHaveBeenCalledWith("/warehouse")
  })

  it("redirects admin-tier roles to /dashboard", async () => {
    mockSession = makeUser({ role: "SUPER_ADMIN" })
    await importPage()
    const { redirect } = await import("next/navigation")
    expect(redirect).toHaveBeenCalledWith("/dashboard")
  })
})
