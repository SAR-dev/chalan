import { headers } from "next/headers"
import { loginPathWithNext } from "@/lib/auth-redirect"

/**
 * Login URL for server components: reads the path the edge proxy forwarded
 * in the `x-pathname` request header (same mechanism as the CSP `x-nonce`)
 * and appends it as ?next=.
 */
export async function loginRedirectPath(): Promise<string> {
  const header = (await headers()).get("x-pathname")
  return loginPathWithNext(header)
}
