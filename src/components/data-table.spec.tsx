// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { downloadCsv } from "@/lib/csv"

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: null }),
}))

vi.mock("@/lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csv")>()
  return { ...actual, downloadCsv: vi.fn() }
})

type Item = { id: string; name: string; value: number }

const columns: DataTableColumn<Item>[] = [
  {
    id: "name",
    header: "Name",
    cell: (r) => r.name,
    sortable: true,
    sortValue: (r) => r.name,
  },
  {
    id: "value",
    header: "Value",
    cell: (r) => r.value,
    sortable: true,
    sortValue: (r) => r.value,
  },
]

const data: Item[] = [
  { id: "1", name: "Charlie", value: 20 },
  { id: "2", name: "Alice", value: 30 },
  { id: "3", name: "Bob", value: 10 },
]

function getKey(row: Item) {
  return row.id
}

describe("DataTable", () => {
  beforeEach(() => {
    vi.mocked(downloadCsv).mockClear()
  })

  it("renders all rows", () => {
    render(<DataTable columns={columns} data={data} getRowKey={getKey} />)
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
    expect(screen.getByText("Charlie")).toBeInTheDocument()
  })

  it("renders column headers", () => {
    render(<DataTable columns={columns} data={data} getRowKey={getKey} />)
    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Value")).toBeInTheDocument()
  })

  it("shows empty message when data is empty", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        getRowKey={getKey}
        emptyMessage="No items found."
      />,
    )
    expect(screen.getByText("No items found.")).toBeInTheDocument()
  })

  it("paginates with default page size", () => {
    const bigData = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
      value: i,
    }))
    render(<DataTable columns={columns} data={bigData} getRowKey={getKey} />)
    expect(screen.getByText("Item 0")).toBeInTheDocument()
    expect(screen.queryByText("Item 20")).not.toBeInTheDocument()
    expect(screen.getByText("1\u201320 of 25")).toBeInTheDocument()
  })

  it("navigates to next page", async () => {
    const user = userEvent.setup()
    const bigData = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
      value: i,
    }))
    render(<DataTable columns={columns} data={bigData} getRowKey={getKey} />)
    const nextBtn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-label") === "Next page")!
    await user.click(nextBtn)
    expect(screen.getByText("Item 20")).toBeInTheDocument()
    expect(screen.queryByText("Item 0")).not.toBeInTheDocument()
  })

  it("sorts columns when sortable headers are clicked", async () => {
    const user = userEvent.setup()
    render(<DataTable columns={columns} data={data} getRowKey={getKey} />)
    const nameHeader = screen.getByText("Name")
    await user.click(nameHeader)
    const rows = screen.getAllByRole("row")
    expect(within(rows[1]).getByText("Alice")).toBeInTheDocument()
    expect(within(rows[2]).getByText("Bob")).toBeInTheDocument()
    expect(within(rows[3]).getByText("Charlie")).toBeInTheDocument()
  })

  it("searches rows when searchable is enabled", async () => {
    const user = userEvent.setup()
    const onBulk = vi.fn()
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        searchable
        bulkActions={[{ label: "Delete", onClick: onBulk }]}
      />,
    )
    const input = screen.getByPlaceholderText("Search...")
    await user.type(input, "Bob")
    expect(screen.getByText("Bob")).toBeInTheDocument()
    expect(screen.queryByText("Alice")).not.toBeInTheDocument()
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument()
  })

  it("displays record count when pagination is disabled", () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        id="test"
        pageSize={0}
      />,
    )
    expect(screen.getByText("3 records")).toBeInTheDocument()
  })

  it("calls onRowClick when a row is clicked", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        onRowClick={onClick}
      />,
    )
    await user.click(screen.getByText("Bob"))
    expect(onClick).toHaveBeenCalledWith(data[2])
  })

  it("shows all of a new column set when columns change under a stable id", () => {
    // Regression test: previously, visibleColumnIds was computed once on
    // mount and never reconciled against a later `columns` prop change for
    // the same `id`, so switching to a column set with different ids (e.g.
    // a tab change reusing the same DataTable id) silently dropped any
    // column whose id wasn't in the original set.
    const otherColumns: DataTableColumn<Item>[] = [
      {
        id: "name",
        header: "Name",
        cell: (r) => r.name,
      },
      {
        id: "extra",
        header: "Extra",
        cell: (r) => `extra-${r.id}`,
      },
    ]
    const { rerender } = render(
      <DataTable
        id="shared"
        columns={columns}
        data={data}
        getRowKey={getKey}
      />,
    )
    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Value")).toBeInTheDocument()

    rerender(
      <DataTable
        id="shared"
        columns={otherColumns}
        data={data}
        getRowKey={getKey}
      />,
    )
    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Extra")).toBeInTheDocument()
    expect(screen.queryByText("Value")).not.toBeInTheDocument()
  })

  it("hides pagination when pageSize is 0", () => {
    const bigData = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
      value: i,
    }))
    render(
      <DataTable
        columns={columns}
        data={bigData}
        getRowKey={getKey}
        pageSize={0}
      />,
    )
    // All 25 rows should be visible
    expect(screen.getByText("Item 0")).toBeInTheDocument()
    expect(screen.getByText("Item 24")).toBeInTheDocument()
    // No pagination text
    expect(screen.queryByText(/\d+\u2013\d+ of \d+/)).not.toBeInTheDocument()
  })

  it("calls onRefresh once when the refresh button is clicked", async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(
      <DataTable
        id="refresh-test"
        columns={columns}
        data={data}
        getRowKey={getKey}
        onRefresh={onRefresh}
      />,
    )
    await user.click(screen.getByLabelText("Refresh table"))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  // ---- Bulk selection tests ----

  it("renders checkboxes when selectable is true", () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        bulkActions={[{ label: "Delete", onClick: vi.fn() }]}
      />,
    )
    // Select-all is in the accessibility tree now: dropping the
    // `aria-hidden="true"` that was hiding this entire cell from `getAllByRole`
    // — which is what made bulk select invisible to a screen reader.
    const checkboxes = screen.getAllByRole("checkbox")
    expect(checkboxes).toHaveLength(4)
    expect(screen.getByLabelText("Select all rows")).toBeInTheDocument()
  })

  it("does not render checkboxes by default", () => {
    render(<DataTable columns={columns} data={data} getRowKey={getKey} />)
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("selects and deselects individual rows", async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        bulkActions={[{ label: "Delete", onClick: vi.fn() }]}
      />,
    )
    const checkboxes = screen.getAllByRole("checkbox")
    // First row checkbox (index 1, after select-all at index 0)
    const rowCheckbox = checkboxes[1]
    await user.click(rowCheckbox)
    expect(rowCheckbox).toBeChecked()
    await user.click(rowCheckbox)
    expect(rowCheckbox).not.toBeChecked()
  })

  it("shows selected count and bulk actions toolbar when rows are selected", async () => {
    const user = userEvent.setup()
    const onBulk = vi.fn()
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        bulkActions={[{ label: "Delete", onClick: onBulk }]}
      />,
    )
    // No toolbar initially
    expect(screen.queryByText(/\d+ selected/)).not.toBeInTheDocument()
    // Select one row
    const rowCheckbox = screen.getAllByRole("checkbox")[1]
    await user.click(rowCheckbox)
    expect(screen.getByText("1 selected")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })

  it("calls bulk action with selected rows after confirmation", async () => {
    const user = userEvent.setup()
    const onBulk = vi.fn()
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        bulkActions={[{ label: "Process", onClick: onBulk }]}
      />,
    )
    const checkboxes = () => screen.getAllByRole("checkbox")
    // Index 0 is select-all (it is back in the accessibility tree):
    // selecting everything, then unchecking Alice, leaves Charlie + Bob.
    await user.click(checkboxes()[0])
    await user.click(checkboxes()[2])
    await user.click(screen.getByRole("button", { name: "Process" }))
    // Confirmation dialog appears
    expect(
      screen.getByText("2 items will be affected. Do you want to proceed?"),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Process" }))
    expect(onBulk).toHaveBeenCalledTimes(1)
    const selected = onBulk.mock.calls[0][0]
    expect(selected).toHaveLength(2)
    expect(selected[0].id).toBe("1") // Charlie
    expect(selected[1].id).toBe("3") // Bob
  })

  it("selects all visible rows with select-all checkbox", async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        bulkActions={[{ label: "Delete", onClick: vi.fn() }]}
      />,
    )
    // Find it by label rather than by index — it sits at index 0 now that the
    // aria-hidden was dropped (this loop asserts every checkbox, which is the
    // behaviour under test).
    const selectAll = screen.getByLabelText("Select all rows")
    await user.click(selectAll)
    const rowCheckboxes = screen.getAllByRole("checkbox")
    rowCheckboxes.forEach((cb) => expect(cb).toBeChecked())
    // Deselect all
    await user.click(selectAll)
    rowCheckboxes.forEach((cb) => expect(cb).not.toBeChecked())
  })

  it("clears selection after bulk action via clearSelection callback", async () => {
    const user = userEvent.setup()
    const onBulk = vi.fn((_rows, clearSelection) => clearSelection())
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        bulkActions={[{ label: "Delete", onClick: onBulk }]}
      />,
    )
    const checkbox = screen.getAllByRole("checkbox")[1]
    await user.click(checkbox)
    expect(screen.getByText("1 selected")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(screen.getByRole("button", { name: "Delete" }))
    expect(screen.queryByText(/\d+ selected/)).not.toBeInTheDocument()
  })

  it("supports controlled selection via selectedKeys and onSelectionChange", async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    const selectedKeys = new Set<string>(["2"])
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        bulkActions={[{ label: "Delete", onClick: vi.fn() }]}
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
      />,
    )
    // Select-all is in the tree as well, so the list is
    // [select-all, Charlie, Alice, Bob] — Alice, pre-selected via
    // `selectedKeys`, sits at index 2.
    const checkboxes = screen.getAllByRole("checkbox")
    expect(checkboxes).toHaveLength(4)
    expect(checkboxes[2]).toBeChecked()
    // Toggle a different row: Charlie is the first row, now at index 1.
    await user.click(checkboxes[1])
    expect(onSelectionChange).toHaveBeenCalled()
    const newKeys = onSelectionChange.mock.calls[0][0]
    expect(newKeys).toBeInstanceOf(Set)
    // Re-render with updated keys
    rerender(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={getKey}
        bulkActions={[{ label: "Delete", onClick: onSelectionChange }]}
        selectedKeys={new Set([...newKeys])}
        onSelectionChange={onSelectionChange}
      />,
    )
  })

  // ---- Refresh behaviour ----
  //
  // A refresh must not look like data loss. Previously `loading` swapped every
  // row for a skeleton, so a key change (page/search/filter) or a post-mutation
  // revalidate made the table appear to empty out. Rows now survive a refresh
  // and the table is marked busy instead; skeletons are only for a genuine
  // first load, when there is nothing on screen to keep.

  it("keeps existing rows on screen while a refresh is in flight", () => {
    const { rerender, container } = render(
      <DataTable id="dash" columns={columns} data={data} getRowKey={getKey} />,
    )
    expect(screen.getByText("Alice")).toBeInTheDocument()

    rerender(
      <DataTable
        id="dash"
        columns={columns}
        data={data}
        getRowKey={getKey}
        loading
      />,
    )

    // Every row is still there...
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
    expect(screen.getByText("Charlie")).toBeInTheDocument()
    // ...and none of them was swapped for a skeleton.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })

  it("marks the table busy and shows the refresh overlay while loading", () => {
    render(
      <DataTable
        id="busy"
        columns={columns}
        data={data}
        getRowKey={getKey}
        loading
      />,
    )
    expect(screen.getByTestId("table-busy")).toHaveAttribute(
      "aria-busy",
      "true",
    )
    expect(screen.getByTestId("table-refreshing-busy")).toBeInTheDocument()
  })

  it("shows no overlay and no aria-busy when the table is idle", () => {
    render(
      <DataTable id="idle" columns={columns} data={data} getRowKey={getKey} />,
    )
    expect(
      screen.queryByTestId("table-refreshing-idle"),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId("table-idle")).not.toHaveAttribute("aria-busy")
  })

  it("falls back to skeleton rows on a first load, not the empty message", () => {
    const { container } = render(
      <DataTable
        id="first"
        columns={columns}
        data={[]}
        getRowKey={getKey}
        loading
        emptyMessage="No items found."
      />,
    )
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
    // "No records" is a lie while the first load is still running.
    expect(screen.queryByText("No items found.")).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("table-refreshing-first"),
    ).not.toBeInTheDocument()
  })

  it("shows the empty message once a settled load really has no rows", () => {
    render(
      <DataTable
        id="settled"
        columns={columns}
        data={[]}
        getRowKey={getKey}
        emptyMessage="No items found."
      />,
    )
    expect(screen.getByText("No items found.")).toBeInTheDocument()
  })

  it("keeps rows and shows the overlay during a bulk action", () => {
    render(
      <DataTable
        id="bulk"
        columns={columns}
        data={data}
        getRowKey={getKey}
        bulkActions={[{ label: "Delete", onClick: vi.fn() }]}
        bulkLoading
      />,
    )
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByTestId("table-refreshing-bulk")).toBeInTheDocument()
  })

  // ---- Derived CSV export ----

  it("shows the CSV button and exports derived rows", async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        id="csv-table"
        columns={columns}
        data={data}
        getRowKey={getKey}
      />,
    )
    await user.click(screen.getByRole("button", { name: /download csv/i }))
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    const [filename, content] = vi.mocked(downloadCsv).mock.calls[0]
    expect(filename).toContain("csv-table")
    expect(content).toContain("Name,Value")
    expect(content).toContain("Charlie,20")
    expect(content).toContain("Alice,30")
    expect(content).toContain("Bob,10")
  })

  it("hides the CSV button when the table has no rows", () => {
    render(
      <DataTable
        id="csv-empty"
        columns={columns}
        data={[]}
        getRowKey={getKey}
      />,
    )
    expect(
      screen.queryByRole("button", { name: /download csv/i }),
    ).not.toBeInTheDocument()
  })

  it("hides the CSV button when no column is exportable", () => {
    const nonExportableColumns: DataTableColumn<Item>[] = [
      { id: "name", header: <span>Name</span>, cell: (r) => r.name },
      { id: "value", header: "Value", cell: (r) => r.value },
    ]
    render(
      <DataTable
        id="csv-non-exportable"
        columns={nonExportableColumns}
        data={data}
        getRowKey={getKey}
      />,
    )
    expect(
      screen.queryByRole("button", { name: /download csv/i }),
    ).not.toBeInTheDocument()
  })
})
