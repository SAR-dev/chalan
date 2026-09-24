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

  it("answers questions in every group", async () => {
    await importPage()
    expect(
      screen.getByRole("heading", { name: "Getting started" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Pricing & COD" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Pickup & delivery" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Account & security" }),
    ).toBeInTheDocument()
  })
})
