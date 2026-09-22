import { NextResponse } from "next/server"

/** Unauthenticated — 401 with no body. */
export function unauthorized() {
  return NextResponse.json(null, { status: 401 })
}

/** Structured error response with a message. */
export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/** Common shortcuts. */
export function forbidden(message = "Forbidden") {
  return errorResponse(message, 403)
}

export function notFound(message = "Not found") {
  return errorResponse(message, 404)
}

export function badRequest(message: string) {
  return errorResponse(message, 400)
}

export function conflict(message: string) {
  return errorResponse(message, 409)
}

export function serverError(message = "Internal server error") {
  return errorResponse(message, 500)
}
