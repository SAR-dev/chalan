// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FormErrors } from "@/components/form-errors"
import { Input } from "@/components/ui/input"

// Before this, `FormErrors` was a plain `role="alert"` banner and
// no input in the app carried `aria-describedby`: a screen-reader user heard
// that *something* failed but could not move to the field that failed, and
// focus stayed wherever the user happened to leave it.

describe("FormErrors", () => {
  it("renders nothing when there are no errors", () => {
    const { container } = render(<FormErrors errors={null} />)
    expect(container).toBeEmptyDOMElement()
    render(<FormErrors errors={{}} />)
    expect(screen.queryByTestId("form-errors")).not.toBeInTheDocument()
  })

  it("announces and lists every message", () => {
    render(
      <FormErrors
        errors={{
          businessName: "Business name: Required",
          email: "Email: A valid email is required",
        }}
      />,
    )
    const summary = screen.getByTestId("form-errors")
    expect(summary).toHaveAttribute("role", "alert")
    expect(summary).toHaveTextContent("There are 2 problems with this form.")
    expect(summary).toHaveTextContent("Business name: Required")
    expect(summary).toHaveTextContent("Email: A valid email is required")
  })

  it("takes focus when it appears, so the user lands on the failures", () => {
    const { rerender } = render(<FormErrors errors={null} />)
    // Renders nothing at all until there is something to say.
    expect(screen.queryByTestId("form-errors")).not.toBeInTheDocument()

    rerender(<FormErrors errors={{ phone: "Phone: Required" }} />)
    expect(screen.getByTestId("form-errors")).toHaveFocus()
  })

  it("counts a single problem in the singular", () => {
    render(<FormErrors errors={{ phone: "Phone: Required" }} />)
    expect(screen.getByTestId("form-errors")).toHaveTextContent(
      "There is 1 problem with this form.",
    )
  })
})

describe("Input error wiring", () => {
  it("marks the control invalid and links the message to it", () => {
    render(
      <>
        <label htmlFor="businessName">Business name</label>
        <Input id="businessName" error="Business name: Required" />
      </>,
    )
    const input = screen.getByLabelText("Business name")
    expect(input).toHaveAttribute("aria-invalid", "true")

    const describedBy = input.getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()
    // The id it points at must resolve to a real node carrying the message.
    const target = document.getElementById(describedBy!.split(" ")[0])
    expect(target).not.toBeNull()
    expect(target).toHaveTextContent("Business name: Required")
  })

  it("renders nothing extra and no invalid state without an error", () => {
    render(
      <>
        <label htmlFor="ok">Email</label>
        <Input id="ok" />
      </>,
    )
    const input = screen.getByLabelText("Email")
    expect(input).not.toHaveAttribute("aria-invalid")
    expect(input).not.toHaveAttribute("aria-describedby")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByTestId("input-error")).not.toBeInTheDocument()
  })

  it("keeps a caller-supplied aria-describedby alongside the error", () => {
    render(
      <Input id="pw" aria-describedby="pw-hint" error="Password: Too short" />,
    )
    const input = document.getElementById("pw") as HTMLInputElement
    const ids = input.getAttribute("aria-describedby")!.split(" ")
    expect(ids).toHaveLength(2)
    expect(document.getElementById(ids[0])).toHaveTextContent(
      "Password: Too short",
    )
    expect(ids[1]).toBe("pw-hint")
  })

  it("does not let a stale aria-invalid prop override a fresh error", () => {
    render(<Input id="x" aria-invalid={false} error="Nope" />)
    expect(document.getElementById("x")).toHaveAttribute("aria-invalid", "true")
  })
})
