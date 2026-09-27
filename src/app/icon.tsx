import { ImageResponse } from "next/og"
import {
  BRAND_ICON_FILL,
  BRAND_ICON_PATH,
  BRAND_ICON_VIEWBOX,
} from "@/icons/SiteIcon"

export const size = { width: 32, height: 32 }

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={BRAND_ICON_VIEWBOX}
        fill={BRAND_ICON_FILL}
        width={28}
        height={28}
        aria-hidden="true"
      >
        <path fillRule="evenodd" d={BRAND_ICON_PATH} />
      </svg>
    </div>,
    { width: 32, height: 32 },
  )
}
