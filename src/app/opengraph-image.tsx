import { ImageResponse } from "next/og"
import { siteConfig } from "@/config/site"

export const runtime = "edge"
export const alt = siteConfig.name
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        padding: "80px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
          marginBottom: "40px",
        }}
      >
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "16px",
            background: "#3b82f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "36px",
          }}
        >
          📦
        </div>
        <span style={{ fontSize: "48px", fontWeight: 700, color: "#f8fafc" }}>
          {siteConfig.name}
        </span>
      </div>
      <p
        style={{
          fontSize: "28px",
          color: "#94a3b8",
          textAlign: "center",
          maxWidth: "800px",
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {siteConfig.tagline}
      </p>
    </div>,
    { ...size },
  )
}
