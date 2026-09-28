// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ActivatedPage from "./page"

describe("/activated", () => {
  it("welcomes the freshly activated account", () => {
    render(<ActivatedPage />)
    expect(screen.getByTestId("activated-title")).toHaveTextContent(/welcome/i)
    expect(screen.getByTestId("activated-message")).toHaveTextContent(
      /signed out/i,
    )
  })

  it("sends them to sign in", () => {
    render(<ActivatedPage />)
    const cta = screen.getByTestId("activated-continue")
    expect(cta.tagName).toBe("A")
    expect(cta).toHaveAttribute("href", "/login")
    expect(cta).toHaveTextContent(/continue to sign in/i)
  })

  it("keeps the skip-link target the page's main landmark", () => {
    render(<ActivatedPage />)
    expect(document.querySelector("main#main-content")).not.toBeNull()
  })
})
