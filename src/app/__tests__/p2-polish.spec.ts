import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Everything here is a *structural* claim - either dead code came
// back, or a file that has to exist in four places quietly does not. None of it
// is visible in a rendered screenshot, so it is pinned against the source.

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf-8")
}

describe("pageSizeOptions stays deleted", () => {
  // Rows per page is already a first-class, *persisted* preference: it lives on
  // the user row, is validated against MAX_TABLE_ROWS_PER_PAGE in
  // src/lib/validation.ts, is edited in Account Settings, and DataTable uses it
  // as the default size for every table. The footer plumbing this removed was a
  // second control for the same preference — unconfigured, so it never appeared,
  // and per-table, so it would not have survived a reload anyway.
  const offenders: string[] = []
  for (const file of [
    "src/components/data-table/types.ts",
    "src/components/data-table/index.tsx",
    "src/components/data-table/pagination.tsx",
    "e2e/selectors.ts",
  ]) {
    if (read(file).includes("pageSizeOptions")) offenders.push(file)
  }

  it("leaves no trace of the prop, the select or its selector", () => {
    expect(offenders).toEqual([])
  })

  it("keeps the account preference as the single source of truth", () => {
    const dataTable = read("src/components/data-table/index.tsx")
    expect(dataTable).toContain("currentUser?.tableRowsPerPage")
    expect(dataTable).toContain("DEFAULT_TABLE_ROWS_PER_PAGE")
  })
})

describe("log tables take their headers from the shared module", () => {
  const audit = read("src/app/dashboard/audit-logs/audit-logs-client.tsx")
  const email = read("src/app/dashboard/email-logs/page.tsx")

  it("has no non-empty header spelled out in the page", () => {
    // `header: ""` is an intentionally blank cell (the expander column), not a
    // label, so only headers carrying text are checked.
    expect(audit).not.toMatch(/header:\s*"[^"]+"/)
    expect(email).not.toMatch(/header:\s*"[^"]+"/)
  })

  it("pulls them from columnLabels instead", () => {
    expect(audit).toContain("columnLabels.auditLog.")
    expect(email).toContain("columnLabels.emailLog.")
    expect(read("src/config/table-column-labels.ts")).toContain("auditLog: {")
    expect(read("src/config/table-column-labels.ts")).toContain("emailLog: {")
  })

  it("drops the empty-state branch nothing could reach", () => {
    // `DataTable` shows skeleton rows for a first load and an overlay once rows
    // exist, so `isLoading ?` in front of an empty message decided between two
    // states this message is never rendered in.
    for (const file of [
      "src/app/dashboard/audit-logs/audit-logs-client.tsx",
      "src/app/dashboard/email-logs/page.tsx",
    ]) {
      expect(
        read(file),
        `${file} reintroduces a loading branch in emptyMessage`,
      ).not.toMatch(/emptyMessage=\{\s*isLoading/)
    }
  })
})

describe("every role portal has a 404 of its own", () => {
  const segments: Array<[file: string, home: string]> = [
    ["src/app/dashboard/not-found.tsx", "/dashboard"],
    ["src/app/merchant/not-found.tsx", "/merchant"],
    ["src/app/warehouse/not-found.tsx", "/warehouse"],
    ["src/app/rider/not-found.tsx", "/rider"],
  ]

  for (const [file, home] of segments) {
    it(`renders an in-shell 404 for ${file}`, () => {
      expect(existsSync(join(process.cwd(), file)), `${file} is missing`).toBe(
        true,
      )
      const raw = read(file)
      // The shared component keeps the markup in one place; a page that
      // re-implements it will drift from its three siblings.
      expect(raw).toContain("SegmentNotFound")
      expect(raw).toContain(home)
    })
  }

  it("keeps the shared 404 reachable from inside the portal's shell", () => {
    const shared = read("src/components/segment-not-found.tsx")
    expect(shared).toContain('data-testid="segment-not-found-home"')
  })
})

describe("heavy dependencies are loaded on demand", () => {
  it("keeps react-markdown out of the client bundle", () => {
    // `markdown.tsx` had "use client", which pulled react-markdown + remark-gfm
    // (~139 KB raw in the measured build) into the client bundles of /terms,
    // /privacy and /help — three pages whose content is a string on the server.
    // With the directive gone it renders where it is used: on the server.
    const raw = read("src/components/markdown.tsx")
    expect(raw.startsWith('"use client"')).toBe(false)
    expect(raw).toContain("ReactMarkdown")
  })

  it("keeps @aws-sdk/client-s3 behind the r2 switch", () => {
    const raw = read("src/lib/storage/index.ts")
    // A static import would load the SDK for STORAGE_PROVIDER=local — the
    // default, and the only value the tests and local dev ever use.
    expect(raw).not.toMatch(/import\s*{[^}]*}\s*from\s*"\.\/r2"/)
    expect(raw).toMatch(/await import\("\.\/r2"\)/)
    expect((raw.match(/await import\("\.\/r2"\)/g) ?? []).length).toBe(4)
  })

  it("splits recharts out of the dashboard's initial bundle", () => {
    for (const file of [
      "src/app/dashboard/cod-settlement/page.tsx",
      "src/app/dashboard/delivery-performance/page.tsx",
    ]) {
      const raw = read(file)
      expect(raw, `${file} must load charts lazily`).toContain("next/dynamic")
      expect(raw).toMatch(/import\("@\/components\/charts\//)
      // The barrel was the eager path: importing it pulled every chart (and
      // recharts with them) regardless of which one the page drew.
      expect(raw).not.toMatch(/from "@\/components\/charts"/)
    }
  })

  it("leaves no barrel for the next page to import by accident", () => {
    expect(
      existsSync(join(process.cwd(), "src/components/charts/index.ts")),
      "the charts barrel is back - import the chart file directly",
    ).toBe(false)
  })
})
