// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage, resetIds } from "@/app/__tests__/test-utils"

let mockUser: ReturnType<typeof makeUser> | null

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({ warehouses: [], total: 0, isLoading: false }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "SUPER_ADMIN" })
})

async function importPage() {
  const { WarehousesPageClient } = await import("./warehouses-client")
  renderPage(<WarehousesPageClient initialData={[]} initialTotal={0} />)
}

describe("Dashboard warehouses page", () => {
  it("renders warehouse management", async () => {
    await importPage()
    expect(
      screen.getByRole("heading", { name: /warehouse/i }),
    ).toBeInTheDocument()
  })
})
