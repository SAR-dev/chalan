// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"

async function importPage() {
  const Page = (await import("./page")).default
  renderPage(<Page />)
}

describe("FAQ page", () => {
  it("renders the FAQ heading", async () => {
    await importPage()
    expect(screen.getByRole("heading", { name: /faq/i })).toBeInTheDocument()
  })

  it("renders a tab for every role", async () => {
    await importPage()
    for (const role of [
      "all",
      "merchant",
      "rider",
      "warehouse",
      "super-admin",
    ]) {
      expect(screen.getByTestId(`faq-tab-${role}`)).toBeInTheDocument()
    }
  })

  it("shows shared and role sections by default", async () => {
    await importPage()
    expect(
      screen.getByRole("heading", { name: "Getting started" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "For merchants: orders" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "For riders" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "For warehouse admins" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "For super admins" }),
    ).toBeInTheDocument()
  })
})
