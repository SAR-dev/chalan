import { NextResponse } from "next/server"
import { getOpenApiSpec } from "@/lib/openapi"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  return NextResponse.json(getOpenApiSpec(siteUrl))
})
