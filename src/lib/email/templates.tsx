// The React Email component tree — the single place that imports `react-email`.
//
// Lazy on purpose: `mail-templates.ts` is reachable from `auth.ts` →
// `api-auth.ts`, so a static import here would pull react-email and the
// server renderer behind it into the module graph of nearly every API route,
// for a dependency only mail rendering needs. Everything user/DB-derived
// arrives as a React child and is escaped by React itself, so no template has
// to hand-escape a name, address, order code or note.
//
// One plain header, one ink, no per-status theming, and no accent colour at
// all: every email is the same layout with different copy, set in greyscale so
// it reads the same in every client and never depends on colour being
// supported or the recipient's mail theme.

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
  hidePlatformBranding?: boolean
}

const FONT = "Arial, sans-serif"
/**
 * Body and headline ink, and the CTA fill. One near-black rather than a pure
 * `#000`, which reads as a hole against white on low-quality screens.
 */
const INK = "#1f2937"
/** Secondary ink: fact labels, the platform name, the closing note. */
const MUTED = "#6b7280"
/** The single rule colour — the only thing on the page that is not text. */
const RULE = "#e5e7eb"
/**
 * Natural width of the content column.
 *
 * Paired with `width: 100%` on the container so a phone simply narrows the
 * column instead of overflowing — a fixed width here is the classic
 * email-client bug where the template renders off-screen with no way to
 * scroll it back.
 */
const WIDTH = "480px"

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
                // Same ink as the body — the size and weight carry the
                // hierarchy, so the headline still reads first without
                // needing a colour to mark it out.
                color: INK,
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
                    // Black fill, white label — the strongest contrast the
                    // palette can offer, so the one action in the email needs
                    // no colour to be the obvious thing to click.
                    backgroundColor: INK,
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
                    // `MUTED`, not a lighter grey: at 12px a third, fainter
                    // step measured ~2.5:1 against white, which is below the
                    // 4.5:1 a reader needs. Collapsing it also leaves the
                    // palette at one ink and one secondary — genuinely two
                    // tones, not three shades of the same idea.
                    color: MUTED,
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
