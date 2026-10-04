// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CreateMailConfigDialog } from "./create-mail-config-dialog"

const validForm = {
  label: "Primary SMTP",
  host: "smtp.example.com",
  port: "587",
  secure: false,
  user: "smtp-user",
  pass: "super-secret-pass",
  fromEmail: "noreply@example.com",
  fromName: "Chalan",
}

type DialogProps = React.ComponentProps<typeof CreateMailConfigDialog>

function renderDialog(overrides: Partial<DialogProps> = {}) {
  const props: DialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    form: validForm,
    onFormChange: vi.fn(),
    onSubmit: vi.fn(),
    onTest: vi.fn(),
    testTo: "admin@example.com",
    onTestToChange: vi.fn(),
    ...overrides,
  }
  render(<CreateMailConfigDialog {...props} />)
  return props
}

describe("CreateMailConfigDialog — test recipient", () => {
  it("asks where the test should go, prefilled with the admin's address", () => {
    renderDialog()
    const input = screen.getByTestId("mail-config-test-to")
    expect(input).toHaveValue("admin@example.com")
    expect(screen.getByLabelText("Send test to")).toBe(input)
    // The field says what it is for — and that it is not persisted.
    expect(
      screen.getByText(/delivered here.*not stored with the config/i),
    ).toBeInTheDocument()
  })

  it("reports typed changes to the page (which owns the state)", () => {
    const props = renderDialog()
    fireEvent.change(screen.getByTestId("mail-config-test-to"), {
      target: { value: "ops@example.com" },
    })
    expect(props.onTestToChange).toHaveBeenCalledWith("ops@example.com")
  })

  it("blocks the test send while the recipient is not a valid email", () => {
    // Every other required field is filled — the recipient is the only reason
    // the button is disabled, which is what makes this assertion meaningful.
    renderDialog({ testTo: "not-an-address" })
    expect(screen.getByTestId("mail-config-send-test")).toBeDisabled()
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument()
    expect(
      screen.getByText("A test email needs a valid recipient address."),
    ).toBeInTheDocument()
  })

  it("unlocks the test send once the recipient is valid", () => {
    renderDialog({ testTo: "ops@example.com" })
    expect(screen.getByTestId("mail-config-send-test")).toBeEnabled()
    // No error under a valid address — only the explanatory hint.
    expect(
      screen.queryByText("Enter a valid email address."),
    ).not.toBeInTheDocument()
  })
})
