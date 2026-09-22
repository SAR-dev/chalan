import mjml from "mjml"
import { siteConfig } from "@/config/site"

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface OrderEmailData {
  orderCode: string
  merchantName: string
  recipientName: string
  deliveryAddress: string
}

export interface MerchantEmailData {
  ownerName: string
  businessName: string
  verificationUrl?: string
}

export interface MerchantVerifyEmailData {
  ownerName: string
  businessName: string
  verificationUrl: string
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Escape a value before it goes into HTML. Every piece of user/DB data
 *  (names, addresses, order codes, notes) must pass through this. */
function esc(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? ""

// ---------------------------------------------------------------------------
// MJML wrapper — one plain header, one accent color, no per-status theming
// ---------------------------------------------------------------------------

async function renderEmail(status: string, body: string): Promise<string> {
  const brand = esc(siteConfig.name)
  const result = await mjml(`
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" />
      <mj-text color="#1f2937" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#ffffff" width="480px">
    <mj-section padding="32px 24px 8px">
      <mj-column>
        <mj-text font-size="14px" color="#6b7280">${brand}</mj-text>
        <mj-text font-size="20px" font-weight="bold" padding-top="4px">${esc(status)}</mj-text>
      </mj-column>
    </mj-section>

    <mj-section padding="8px 24px 24px">
      <mj-column>
        ${body}
      </mj-column>
    </mj-section>

    <mj-section padding="16px 24px" border-top="1px solid #e5e7eb">
      <mj-column>
        <mj-text font-size="12px" color="#9ca3af">This is an automated message. Please do not reply.</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`)
  return result.html
}

/** Plain-text counterpart, unchanged in spirit — simple and readable. */
function renderText(
  status: string,
  lines: (string | false | null | undefined)[],
): string {
  const brand = siteConfig.name
  const body = lines.filter(Boolean).join("\n\n")
  return `${brand}\n${status}\n\n${body}\n\n---\nThis is an automated message. Please do not reply.`
}

/** One row renderer for the "field: value" facts every email shows. */
function factRows(rows: [string, string][]): string {
  return rows
    .map(
      ([label, value]) => `
      <mj-text font-size="14px" padding="4px 0">
        <span style="color:#6b7280">${esc(label)}:</span> <strong>${esc(value)}</strong>
      </mj-text>`,
    )
    .join("")
}

function ctaButton(href: string, label: string): string {
  return `<mj-button href="${esc(href)}" background-color="#2563eb" border-radius="6px" font-size="14px" padding="16px 0 0">${esc(label)}</mj-button>`
}

interface EmailTemplate {
  status: string
  greetingName: string
  message: string
  rows?: [string, string][]
  cta?: { href: string; label: string }
  footnote?: string
}

/** One shared builder every template below funnels through — this is what
 *  keeps the six near-identical order emails from being six copies. */
async function buildTemplate(t: EmailTemplate) {
  const html = await renderEmail(
    t.status,
    `
    <mj-text font-size="15px" line-height="1.6">
      <p>Hi ${esc(t.greetingName)},</p>
      <p>${esc(t.message)}</p>
    </mj-text>
    ${t.rows ? factRows(t.rows) : ""}
    ${t.footnote ? `<mj-text font-size="14px" line-height="1.6" color="#6b7280" padding-top="8px"><p>${esc(t.footnote)}</p></mj-text>` : ""}
    ${t.cta ? ctaButton(t.cta.href, t.cta.label) : ""}
    `,
  )

  const text = renderText(t.status, [
    `Hi ${t.greetingName},`,
    t.message,
    ...(t.rows ? t.rows.map(([label, value]) => `${label}: ${value}`) : []),
    t.footnote,
    t.cta ? `${t.cta.label}: ${t.cta.href}` : null,
  ])

  return { html, text }
}

// ---------------------------------------------------------------------------
// Merchant emails
// ---------------------------------------------------------------------------

export async function merchantRegisteredTemplate(data: MerchantEmailData) {
  const { html, text } = await buildTemplate({
    status: "Registration received",
    greetingName: data.ownerName,
    message: `Thank you for registering ${data.businessName} on ${siteConfig.name}. Please verify your email to activate your account.`,
    footnote: "This link expires in 24 hours.",
    cta: data.verificationUrl
      ? { href: data.verificationUrl, label: "Verify email" }
      : { href: siteUrl(), label: "View dashboard" },
  })
  return { subject: `Registration Received — ${data.businessName}`, html, text }
}

export async function merchantApprovedTemplate(data: MerchantEmailData) {
  const { html, text } = await buildTemplate({
    status: "Account approved",
    greetingName: data.ownerName,
    message: `Your business ${data.businessName} has been approved. You can now log in and start creating orders.`,
    cta: { href: siteUrl(), label: `Log in to ${siteConfig.name}` },
  })
  return { subject: `Your Merchant Account Has Been Approved`, html, text }
}

export async function merchantVerifyEmailTemplate(
  data: MerchantVerifyEmailData,
) {
  const { html, text } = await buildTemplate({
    status: "Verify your email",
    greetingName: data.ownerName,
    message: `Thank you for registering ${data.businessName} on ${siteConfig.name}. Please verify your email address below.`,
    footnote:
      "This link expires in 24 hours. If you didn't register, you can safely ignore this email.",
    cta: { href: data.verificationUrl, label: "Verify email" },
  })
  return { subject: `Verify your email — ${data.businessName}`, html, text }
}

// ---------------------------------------------------------------------------
// Password reset emails
// ---------------------------------------------------------------------------

export async function passwordResetTemplate(data: {
  userName: string
  resetUrl: string
}) {
  const { html, text } = await buildTemplate({
    status: "Reset your password",
    greetingName: data.userName,
    message:
      "We received a request to reset your password. Click the button below to set a new one.",
    footnote:
      "This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.",
    cta: { href: data.resetUrl, label: "Reset password" },
  })
  return { subject: `Reset your password — ${siteConfig.name}`, html, text }
}

// ---------------------------------------------------------------------------
// Order emails
// ---------------------------------------------------------------------------

function orderRows(
  data: OrderEmailData,
  extra?: [string, string][],
): [string, string][] {
  return [
    ["Order Code", data.orderCode],
    ["Recipient", data.recipientName],
    ...(extra ?? []),
  ]
}

export async function orderApprovedTemplate(data: OrderEmailData) {
  const { html, text } = await buildTemplate({
    status: "Order Approved",
    greetingName: data.merchantName,
    message:
      "Your order has been approved and a pickup rider has been assigned.",
    rows: orderRows(data, [["Delivery Address", data.deliveryAddress]]),
    cta: { href: siteUrl(), label: "View dashboard" },
  })
  return {
    subject: `Order ${data.orderCode} Approved — Pickup Scheduled`,
    html,
    text,
  }
}

export async function orderPickedUpTemplate(data: OrderEmailData) {
  const { html, text } = await buildTemplate({
    status: "Order picked up",
    greetingName: data.merchantName,
    message:
      "Your parcel has been picked up by the rider and is on its way to the warehouse.",
    rows: orderRows(data),
    cta: { href: siteUrl(), label: "View dashboard" },
  })
  return { subject: `Order ${data.orderCode} Picked Up`, html, text }
}

export async function orderInWarehouseTemplate(data: OrderEmailData) {
  const { html, text } = await buildTemplate({
    status: "Order at warehouse",
    greetingName: data.merchantName,
    message:
      "Your parcel is now in the warehouse and will be dispatched for delivery soon.",
    rows: orderRows(data, [["Delivery Address", data.deliveryAddress]]),
    cta: { href: siteUrl(), label: "View dashboard" },
  })
  return {
    subject: `Order ${data.orderCode} Received at Warehouse`,
    html,
    text,
  }
}

export async function orderInTransitTemplate(data: OrderEmailData) {
  const { html, text } = await buildTemplate({
    status: "Order dispatched",
    greetingName: data.merchantName,
    message:
      "Your parcel has been dispatched and is heading to the delivery address.",
    rows: orderRows(data, [["Delivery Address", data.deliveryAddress]]),
    cta: { href: siteUrl(), label: "View dashboard" },
  })
  return {
    subject: `Order ${data.orderCode} Dispatched for Delivery`,
    html,
    text,
  }
}

export async function orderDeliveredTemplate(data: OrderEmailData) {
  const { html, text } = await buildTemplate({
    status: "Order delivered",
    greetingName: data.merchantName,
    message: "Your parcel has been delivered successfully.",
    rows: orderRows(data, [["Delivered To", data.deliveryAddress]]),
    footnote: "COD will be settled and reflected in your payout shortly.",
    cta: { href: siteUrl(), label: "View dashboard" },
  })
  return { subject: `Order ${data.orderCode} Delivered`, html, text }
}

export async function orderFailedAttemptTemplate(
  data: OrderEmailData & { note: string },
) {
  const { html, text } = await buildTemplate({
    status: "Delivery attempt failed",
    greetingName: data.merchantName,
    message: "Unfortunately, a delivery attempt for your parcel has failed.",
    rows: orderRows(data, [["Failure Reason", data.note]]),
    footnote:
      "Our team will assess the situation and attempt redelivery or initiate a return.",
    cta: { href: siteUrl(), label: "View dashboard" },
  })
  return {
    subject: `Order ${data.orderCode} — Delivery Attempt Failed`,
    html,
    text,
  }
}

export async function orderReturnedTemplate(
  data: OrderEmailData & { reason: string },
) {
  const { html, text } = await buildTemplate({
    status: "Order returned",
    greetingName: data.merchantName,
    message: "Your parcel has been returned to the warehouse.",
    rows: orderRows(data, [["Return Reason", data.reason]]),
    footnote: "Please contact support to arrange collection of the parcel.",
    cta: { href: siteUrl(), label: "View dashboard" },
  })
  return { subject: `Order ${data.orderCode} — Parcel Returned`, html, text }
}
