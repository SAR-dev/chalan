import { ImageResponse } from "next/og"
import {
  BRAND_ICON_FILL,
  BRAND_ICON_PATH,
  BRAND_ICON_VIEWBOX,
} from "@/icons/SiteIcon"

export const runtime = "edge"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params
  const px = Number(size)
  if (![192, 512].includes(px)) {
    return new Response("Unsupported size", { status: 400 })
  }

  // Maskable-safe: brand glyph centered inside the 80% safe zone on a solid
  // background, so the platform's circle crop never clips it.
  const glyph = Math.round(px * 0.56)

  return new ImageResponse(
    <div
      style={{
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={BRAND_ICON_VIEWBOX}
        fill={BRAND_ICON_FILL}
        width={glyph}
        height={glyph}
        aria-hidden="true"
      >
        <path fillRule="evenodd" d={BRAND_ICON_PATH} />
      </svg>
    </div>,
    { width: px, height: px },
  )
}
