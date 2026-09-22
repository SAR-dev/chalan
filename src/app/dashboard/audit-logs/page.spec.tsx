// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { makeUser, renderPage } from "@/app/__tests__/test-utils"

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: makeUser({ role: "SUPER_ADMIN" }) }),
}))
vi.mock("@/features/audit-logs/hooks/use-audit-logs", () => ({
  useAuditLogs: () => ({
    auditLogs: [],
    total: 0,
    page: 1,
    setPage: vi.fn(),
    limit: 10,
    setLimit: vi.fn(),
    query: "",
    setQuery: vi.fn(),
    sortId: undefined,
    sortDir: undefined,
    onSortChange: vi.fn(),
    isLoading: false,
  }),
}))

async function importAndRender() {
  const { AuditLogsClient } = await import("./audit-logs-client")
  renderPage(<AuditLogsClient initialData={[]} initialTotal={0} />)
}

describe("Dashboard audit-logs page", () => {
  it("renders audit logs", async () => {
    await importAndRender()
    expect(screen.getByRole("heading", { name: /audit/i })).toBeInTheDocument()
  })
})
