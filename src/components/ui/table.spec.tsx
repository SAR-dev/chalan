// @vitest-environment jsdom

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// `<th>` carried no `scope`, so a screen reader could not pair a
// cell with its column once focus moved off the header row.

describe("TableHead (ROADMAP R5.5)", () => {
  it("marks every header cell as a column header", () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>ORD-0001</TableCell>
            <TableCell>Pending</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )

    const headers = container.querySelectorAll("th")
    expect(headers).toHaveLength(2)
    for (const header of headers) {
      expect(header).toHaveAttribute("scope", "col")
    }
  })

  it("applies to the sort buttons' header too", () => {
    // The sortable header renders a `<button>` *inside* the `<th>`; the scope
    // belongs on the cell, not on the button.
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <button type="button">Sort</button>
            </TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    )
    const header = container.querySelector("th")
    expect(header).toHaveAttribute("scope", "col")
    expect(header?.querySelector("button")).not.toBeNull()
  })

  it("lets a caller override the scope", () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <TableHead scope="row">Merchant</TableHead>
          </tr>
        </tbody>
      </table>,
    )
    expect(container.querySelector("th")).toHaveAttribute("scope", "row")
  })
})
