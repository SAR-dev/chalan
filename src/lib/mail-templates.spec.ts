import { describe, expect, it } from "vitest"
import {
  accountActivationTemplate,
  changeEmailTemplate,
  merchantApprovedTemplate,
  merchantRegisteredTemplate,
  merchantVerifyEmailTemplate,
  orderApprovedTemplate,
  orderDeliveredTemplate,
  orderFailedAttemptTemplate,
  orderInTransitTemplate,
  orderInWarehouseTemplate,
  orderPickedUpTemplate,
  orderReturnedTemplate,
  passwordResetTemplate,
} from "@/lib/mail-templates"

const data = {
  orderCode: "ORD-001",
  merchantName: "Test Merchant",
  recipientName: "John Doe",
  deliveryAddress: "123 Main St",
}

describe("orderApprovedTemplate", () => {
  it("includes order code in subject", async () => {
    const { subject } = await orderApprovedTemplate(data)
    expect(subject).toContain("ORD-001")
  })

  it("includes merchant name in body", async () => {
    const { html } = await orderApprovedTemplate(data)
    expect(html).toContain("Test Merchant")
  })

  it("includes status badge for approved", async () => {
    const { html } = await orderApprovedTemplate(data)
    expect(html).toContain("Approved")
  })
})

describe("orderPickedUpTemplate", () => {
  it("includes subject", async () => {
    const { subject } = await orderPickedUpTemplate(data)
    expect(subject).toContain("Picked Up")
  })
})

describe("orderInWarehouseTemplate", () => {
  it("includes subject", async () => {
    const { subject } = await orderInWarehouseTemplate(data)
    expect(subject).toContain("Received at Warehouse")
  })
})

describe("orderInTransitTemplate", () => {
  it("includes subject", async () => {
    const { subject } = await orderInTransitTemplate(data)
    expect(subject).toContain("Dispatched")
  })
})

describe("orderDeliveredTemplate", () => {
  it("includes subject", async () => {
    const { subject } = await orderDeliveredTemplate(data)
    expect(subject).toContain("Delivered")
  })
})

describe("orderFailedAttemptTemplate", () => {
  it("includes failure reason", async () => {
    const { html } = await orderFailedAttemptTemplate({
      ...data,
      note: "Recipient not available",
    })
    expect(html).toContain("Recipient not available")
  })
})

describe("orderReturnedTemplate", () => {
  it("includes return reason", async () => {
    const { html } = await orderReturnedTemplate({
      ...data,
      reason: "Wrong address",
    })
    expect(html).toContain("Wrong address")
  })
})

describe("passwordResetTemplate", () => {
  const resetData = {
    userName: "Alice",
    resetUrl: "http://localhost:3000/reset-password?token=abc123",
  }

  it("includes site name in subject", async () => {
    const { subject } = await passwordResetTemplate(resetData)
    expect(subject).toContain("Reset your password")
  })

  it("includes user name in body", async () => {
    const { html } = await passwordResetTemplate(resetData)
    expect(html).toContain("Alice")
  })

  it("includes reset URL in body", async () => {
    const { html } = await passwordResetTemplate(resetData)
    expect(html).toContain(resetData.resetUrl)
  })

  it("includes expiry footnote", async () => {
    const { html } = await passwordResetTemplate(resetData)
    expect(html).toContain("1 hour")
  })

  it("includes reset URL in plain text", async () => {
    const { text } = await passwordResetTemplate(resetData)
    expect(text).toContain(resetData.resetUrl)
  })
})

describe("changeEmailTemplate", () => {
  const changeData = {
    userName: "Alice",
    newEmail: "alice-new@example.com",
    verifyUrl: "http://localhost:3000/api/auth/verify-email?token=abc123",
  }

  it("includes site name in subject", async () => {
    const { subject } = await changeEmailTemplate(changeData)
    expect(subject).toContain("Confirm your new email")
  })

  it("includes user name in body", async () => {
    const { html } = await changeEmailTemplate(changeData)
    expect(html).toContain("Alice")
  })

  it("states the new address in body", async () => {
    const { html } = await changeEmailTemplate(changeData)
    expect(html).toContain("alice-new@example.com")
  })

  it("includes confirmation URL in body", async () => {
    const { html } = await changeEmailTemplate(changeData)
    expect(html).toContain(changeData.verifyUrl)
  })

  it("includes expiry footnote", async () => {
    const { html } = await changeEmailTemplate(changeData)
    expect(html).toContain("1 hour")
  })

  it("includes confirmation URL in plain text", async () => {
    const { text } = await changeEmailTemplate(changeData)
    expect(text).toContain(changeData.verifyUrl)
  })
})

describe("merchantRegisteredTemplate", () => {
  const merchantData = {
    ownerName: "Bob Smith",
    businessName: "Acme Corp",
    verificationUrl: "http://localhost:3000/verify?token=abc",
  }

  it("includes business name in subject", async () => {
    const { subject } = await merchantRegisteredTemplate(merchantData)
    expect(subject).toContain("Acme Corp")
  })

  it("includes owner name in body", async () => {
    const { html } = await merchantRegisteredTemplate(merchantData)
    expect(html).toContain("Bob Smith")
  })

  it("includes verification URL", async () => {
    const { html } = await merchantRegisteredTemplate(merchantData)
    expect(html).toContain(merchantData.verificationUrl)
  })
})

describe("merchantApprovedTemplate", () => {
  const merchantData = {
    ownerName: "Bob Smith",
    businessName: "Acme Corp",
  }

  it("includes approved status in subject", async () => {
    const { subject } = await merchantApprovedTemplate(merchantData)
    expect(subject).toContain("Approved")
  })

  it("includes business name in body", async () => {
    const { html } = await merchantApprovedTemplate(merchantData)
    expect(html).toContain("Acme Corp")
  })
})

describe("merchantVerifyEmailTemplate", () => {
  const merchantData = {
    ownerName: "Bob Smith",
    businessName: "Acme Corp",
    verificationUrl: "http://localhost:3000/verify?token=xyz",
  }

  it("includes verify subject", async () => {
    const { subject } = await merchantVerifyEmailTemplate(merchantData)
    expect(subject).toContain("Verify")
  })

  it("includes verification URL", async () => {
    const { html } = await merchantVerifyEmailTemplate(merchantData)
    expect(html).toContain(merchantData.verificationUrl)
  })
})

describe("XSS protection via React escaping", () => {
  const xssData = {
    orderCode: '<script>alert("xss")</script>',
    merchantName: "Bob <img src=x onerror=alert(1)>",
    recipientName: 'John & "Jane"',
    deliveryAddress: "123 Main St",
  }

  it("escapes script tags in order code", async () => {
    const { html } = await orderApprovedTemplate(xssData)
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("escapes img onerror in merchant name", async () => {
    const { html } = await orderApprovedTemplate(xssData)
    expect(html).not.toContain("<img ")
    expect(html).toContain("&lt;img")
  })

  it("escapes ampersand and quotes in recipient name", async () => {
    const { html } = await orderApprovedTemplate(xssData)
    expect(html).toContain("John &amp; &quot;Jane&quot;")
  })
})

describe("merchant email footers", () => {
  // The `hidePlatformBranding` toggle was removed with the branding feature,
  // so the platform footer and its rule are unconditional now. Kept as a
  // positive assertion: an earlier version dropped both when the toggle was
  // set, and a future conditional would silently bring that back.
  it("keeps the platform footer by default", async () => {
    const { html, text } = await merchantRegisteredTemplate({
      ownerName: "Bob Smith",
      businessName: "Acme Corp",
      verificationUrl: "http://localhost:3000/verify?token=abc",
    })
    expect(html).toContain("automated message")
    expect(text).toContain("automated message")
  })
})

describe("accountActivationTemplate", () => {
  it("includes the activation link as the CTA", async () => {
    const { html, text } = await accountActivationTemplate({
      userName: "Amy Staff",
      contextName: "Acme Corp",
      activationUrl: "http://localhost:3000/activate?token=raw-token",
    })
    expect(html).toContain("Activate your account")
    expect(html).toContain("http://localhost:3000/activate?token=raw-token")
    expect(text).toContain("http://localhost:3000/activate?token=raw-token")
  })

  it("mentions the inviting context when provided", async () => {
    const { html } = await accountActivationTemplate({
      userName: "Amy",
      contextName: "Acme Corp",
      activationUrl: "http://localhost:3000/activate?token=t",
    })
    expect(html).toContain("Acme Corp")
  })

  it("states the 24h expiry footnote", async () => {
    const { html } = await accountActivationTemplate({
      userName: "Amy",
      activationUrl: "http://localhost:3000/activate?token=t",
    })
    expect(html).toContain("24 hours")
  })
})
