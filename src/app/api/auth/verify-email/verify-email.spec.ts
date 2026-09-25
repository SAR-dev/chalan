import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const delegated: Request[] = []
const dbState = { selectCalls: 0, lookups: [] as unknown[][] }

// Better Auth's change-email confirmation link lands on this same path (the
// static segment wins over the /api/auth/[...all] catch-all) — the route
// hands dotted JWT tokens to Better Auth's own handler.
vi.mock("@/lib/auth", () => ({
  auth: {
    handler: (req: Request) => {
      delegated.push(req)
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "/merchant/account" },
        }),
      )
    },
  },
}))

// Merchant (cuid) tokens keep the app-side lookup in `merchant`.
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      dbState.selectCalls++
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(dbState.lookups.shift() ?? []),
          }),
        }),
      }
    },
    update: () => {
      throw new Error("update should not be called")
    },
  },
  dbRead: {},
  pool: {},
}))

vi.mock("@/lib/mail-templates", () => ({
  merchantWelcomeTemplate: vi.fn(),
}))

vi.mock("@/lib/mailer", () => ({
  sendMail: vi.fn(),
}))

beforeEach(() => {
  delegated.length = 0
  dbState.selectCalls = 0
  dbState.lookups.length = 0
})

describe("GET /api/auth/verify-email", () => {
  it("redirects to login when the token is missing", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/auth/verify-email"),
    )
    expect(res.headers.get("location")).toContain("/login?error=missing-token")
    expect(delegated).toHaveLength(0)
    expect(dbState.selectCalls).toBe(0)
  })

  it("delegates Better Auth JWT tokens to Better Auth's handler", async () => {
    const res = await GET(
      new Request(
        "http://localhost:3000/api/auth/verify-email?token=aaa.bbb.ccc&callbackURL=%2Fmerchant%2Facount",
      ),
    )
    expect(delegated).toHaveLength(1)
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("/merchant/account")
    // Never reaches the merchant cuid lookup.
    expect(dbState.selectCalls).toBe(0)
  })

  it("keeps merchant cuid tokens on the app-side lookup", async () => {
    dbState.lookups.push([])
    const res = await GET(
      new Request(
        "http://localhost:3000/api/auth/verify-email?token=cuid123456",
      ),
    )
    expect(delegated).toHaveLength(0)
    expect(dbState.selectCalls).toBe(1)
    expect(res.headers.get("location")).toContain("error=invalid-token")
  })
})
