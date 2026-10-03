// Structured JSON logger.
//
// Every line is a single JSON object so container stdout/stderr can be parsed
// by any log aggregator. Replaces ad-hoc `console.*` in the request/error path
// and lets callers attach context (requestId, method, path, userId, …) without
// string interpolation.
//
// Usage:
//   logger.error("Unhandled route error", { requestId, method, path, err })
//   const reqLogger = logger.child({ requestId, path })
//   reqLogger.info("payment submitted", { merchantId })

import { redactSecrets } from "@/lib/redact"

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface LogFields {
  [key: string]: unknown
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
  child(fields: LogFields): Logger
}

function configuredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase()
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw
  }
  return "info"
}

/** Turn an unknown thrown value into a JSON-safe object. */
export function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    const out: LogFields = { name: err.name, message: err.message }
    if (err.stack) out.stack = err.stack
    if (err.cause !== undefined) out.cause = serializeError(err.cause)
    // An error message routinely embeds the failing URL — and for an auth or
    // Verify route that URL carries the token.
    return redactFields(out)
  }
  return { message: redactSecrets(String(err)) }
}

/** Redact every string leaf. Non-strings pass through untouched. */
function redactFields(fields: LogFields): LogFields {
  const out: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    out[key] = typeof value === "string" ? redactSecrets(value) : value
  }
  return out
}

function emit(
  level: LogLevel,
  msg: string,
  base: LogFields,
  fields?: LogFields,
): void {
  if (LEVELS[level] < LEVELS[configuredLevel()]) return

  // `err` is serialized (JSON.stringify(new Error()) is `{}`).
  const { err, ...rest } = fields ?? {}
  const record: LogFields = {
    level,
    time: new Date().toISOString(),
    // Redacted before anything is written. This was already the intent
    // But `redact.ts` was never called from here, so the
    // helpers guarded the mailer while the log line itself was raw — and the
    // log line is what ends up in container stdout, CI output and whatever
    // Aggregates them.
    msg: redactSecrets(msg),
    ...redactFields(base),
    ...redactFields(rest),
  }
  if (err !== undefined) record.err = serializeError(err)

  const line = JSON.stringify(record)
  // warn/error → stderr so they are separable from normal output.
  if (LEVELS[level] >= LEVELS.warn) console.error(line)
  else console.log(line)
}

function makeLogger(base: LogFields): Logger {
  return {
    debug: (msg, fields) => emit("debug", msg, base, fields),
    info: (msg, fields) => emit("info", msg, base, fields),
    warn: (msg, fields) => emit("warn", msg, base, fields),
    error: (msg, fields) => emit("error", msg, base, fields),
    child: (fields) => makeLogger({ ...base, ...fields }),
  }
}

export const logger: Logger = makeLogger({})
