// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AuditDiffCell } from "./audit-diff"

describe("AuditDiffCell", () => {
  it("renders a placeholder when metadata is missing", () => {
    render(<AuditDiffCell metadata={null} />)
    expect(screen.queryByTestId("audit-diff")).not.toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders a placeholder when metadata has no diff", () => {
    render(<AuditDiffCell metadata={{ baseRate: 60 }} />)
    expect(screen.queryByTestId("audit-diff")).not.toBeInTheDocument()
  })

  it("renders a placeholder when the diff is empty", () => {
    render(<AuditDiffCell metadata={{ diff: {} }} />)
    expect(screen.queryByTestId("audit-diff")).not.toBeInTheDocument()
  })

  it("renders each changed field with from and to values", () => {
    render(
      <AuditDiffCell
        metadata={{
          diff: {
            status: { from: "PENDING", to: "ACTIVE" },
            baseRate: { from: 50, to: 60 },
          },
        }}
      />,
    )
    const diff = screen.getByTestId("audit-diff")
    expect(diff).toHaveTextContent("status")
    expect(diff).toHaveTextContent("PENDING → ACTIVE")
    expect(diff).toHaveTextContent("baseRate")
    expect(diff).toHaveTextContent("50 → 60")
  })

  it("formats empty, boolean, and array values readably", () => {
    render(
      <AuditDiffCell
        metadata={{
          diff: {
            warehouseId: { from: null, to: "wh_1" },
            isActive: { from: true, to: false },
            pickupProofRefs: { from: ["/a.png"], to: ["/a.png", "/b.png"] },
          },
        }}
      />,
    )
    const diff = screen.getByTestId("audit-diff")
    expect(diff).toHaveTextContent("warehouseId")
    expect(diff).toHaveTextContent("— → wh_1")
    expect(diff).toHaveTextContent("isActive")
    expect(diff).toHaveTextContent("Yes → No")
    expect(diff).toHaveTextContent("/a.png → /a.png, /b.png")
  })
})
