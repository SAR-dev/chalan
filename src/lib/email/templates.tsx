// The React Email component tree — the single place that imports `react-email`.
//
// Lazy on purpose: `mail-templates.ts` is reachable from `auth.ts` →
// `api-auth.ts`, so a static import here would pull react-email and the
// server renderer behind it into the module graph of nearly every API route,
// for a dependency only mail rendering needs. Everything user/DB-derived
// arrives as a React child and is escaped by React itself, so no template has
// to hand-escape a name, address, order code or note.
//
// One plain header, one accent color, no per-status theming: all thirteen
// emails are the same layout with different copy.

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  render,
  Section,
  Text,
} from "react-email"
import { siteConfig } from "@/config/site"
import { isValidHexColor } from "@/lib/brand-color"

/** Everything a rendered email needs. Callers build one of these per mail. */
export interface EmailSpec {
  /** Headline, doubled as the `text` body's first line. */
  status: string
  greetingName: string
  message: string
  /** "label: value" facts — order code, recipient, address, reason. */
  rows?: [string, string][]
  cta?: { href: string; label: string }
  footnote?: string
  brandColor?: string
  hidePlatformBranding?: boolean
}

/** Platform accent — merchants without a brand color keep this exact color. */
const DEFAULT_ACCENT = "#2563eb"

const FONT = "Arial, sans-serif"
const INK = "#1f2937"
const MUTED = "#6b7280"
const FAINT = "#9ca3af"
const RULE = "#e5e7eb"
const WIDTH = "480px"

/** A merchant-supplied color is only trusted once it parses as hex. */
function resolveAccent(brandColor?: string): string {
  return brandColor && isValidHexColor(brandColor)
    ? brandColor.trim()
    : DEFAULT_ACCENT
}

/** The "label: value" fact list every order/merchant email shows. */
function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <>
      {rows.map(([label, value]) => (
        <Text
          key={`${label}: ${value}`}
          style={{
            fontSize: "14px",
            lineHeight: "22px",
            color: INK,
            margin: "4px 0",
          }}
        >
          <span style={{ color: MUTED }}>{label}:</span>{" "}
          <strong>{value}</strong>
        </Text>
      ))}
    </>
  )
}

function EmailLayout({ spec }: { spec: EmailSpec }) {
  const accent = resolveAccent(spec.brandColor)
  const showBranding = !spec.hidePlatformBranding

  return (
    <Html lang="en" dir="ltr">
      <Head />
      {/* Inbox preview line — the first thing a recipient reads before opening. */}
      <Preview>{spec.message}</Preview>
      <Body
        style={{
          backgroundColor: "#ffffff",
          fontFamily: FONT,
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{
            width: "100%",
            maxWidth: WIDTH,
            margin: "0 auto",
            fontFamily: FONT,
          }}
        >
          <Section style={{ padding: "32px 24px 8px" }}>
            {showBranding ? (
              <Text
                style={{
                  fontSize: "14px",
                  lineHeight: "20px",
                  color: MUTED,
                  margin: 0,
                }}
              >
                {siteConfig.name}
              </Text>
            ) : null}
            <Heading
              as="h1"
              style={{
                fontSize: "20px",
                lineHeight: "28px",
                fontWeight: 700,
                color: accent,
                margin: "4px 0 0",
              }}
            >
              {spec.status}
            </Heading>
          </Section>

          <Section style={{ padding: "8px 24px 24px" }}>
            <Text
              style={{
                fontSize: "15px",
                lineHeight: "1.6",
                color: INK,
                margin: "0 0 8px",
              }}
            >
              Hi {spec.greetingName},
            </Text>
            <Text
              style={{
                fontSize: "15px",
                lineHeight: "1.6",
                color: INK,
                margin: "0 0 8px",
              }}
            >
              {spec.message}
            </Text>

            {spec.rows ? <Facts rows={spec.rows} /> : null}

            {spec.footnote ? (
              <Text
                style={{
                  fontSize: "14px",
                  lineHeight: "1.6",
                  color: MUTED,
                  margin: "8px 0 0",
                }}
              >
                {spec.footnote}
              </Text>
            ) : null}

            {spec.cta ? (
              <Section style={{ padding: "16px 0 0" }}>
                <Button
                  href={spec.cta.href}
                  style={{
                    backgroundColor: accent,
                    borderRadius: "6px",
                    boxSizing: "border-box",
                    color: "#ffffff",
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    lineHeight: "20px",
                    padding: "12px 20px",
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  {spec.cta.label}
                </Button>
              </Section>
            ) : null}
          </Section>

          {showBranding ? (
            <>
              <Hr style={{ borderColor: RULE, margin: "0 24px" }} />
              <Section style={{ padding: "16px 24px" }}>
                <Text
                  style={{
                    fontSize: "12px",
                    lineHeight: "18px",
                    color: FAINT,
                    margin: 0,
                  }}
                >
                  This is an automated message. Please do not reply.
                </Text>
              </Section>
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  )
}

/** Render one spec to an HTML body. Callers pair it with their own plain text. */
export async function renderEmailHtml(spec: EmailSpec): Promise<string> {
  return render(<EmailLayout spec={spec} />)
}
