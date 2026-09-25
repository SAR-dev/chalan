import {
  badRequest,
  errorResponse,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"

function authErrorMessage(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("body" in err)) {
    return undefined
  }
  const body = (err as { body?: unknown }).body
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return undefined
  }
  const message = (body as { message?: unknown }).message
  return typeof message === "string" && message.length > 0 ? message : undefined
}

export function authErrorResponse(err: unknown, fallback: string): Response {
  const status =
    typeof err === "object" && err !== null && "statusCode" in err
      ? (err as { statusCode?: unknown }).statusCode
      : undefined

  if (status === 400) return badRequest(authErrorMessage(err) ?? fallback)
  if (status === 401) return unauthorized()
  if (status === 403) return forbidden(authErrorMessage(err) ?? fallback)
  if (status === 404) return notFound(authErrorMessage(err) ?? fallback)
  if (typeof status === "number" && status >= 400 && status < 500) {
    return errorResponse(authErrorMessage(err) ?? fallback, status)
  }
  return errorResponse(fallback, 500)
}
