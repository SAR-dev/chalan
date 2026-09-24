// Central env validation. Called once at server startup via instrumentation.ts.
//
// Throws on the first missing/invalid value so the app refuses to boot with a
// clear message instead of crashing deep in a request handler or silently
// misbehaving.
//
// Add new vars here as the app grows — group them by concern.

type EnvError = { key: string; message: string }

function collect(fn: (errors: EnvError[]) => void): EnvError[] {
  const errors: EnvError[] = []
  fn(errors)
  return errors
}

function required(
  errors: EnvError[],
  key: string,
  description: string,
): string | undefined {
  const value = process.env[key]
  if (!value || value.trim() === "") {
    errors.push({ key, message: `${description} is required but not set.` })
    return undefined
  }
  return value
}

function oneOf(
  errors: EnvError[],
  key: string,
  allowed: string[],
  fallback: string,
): string {
  const value = (process.env[key] ?? fallback).toLowerCase()
  if (!allowed.includes(value)) {
    errors.push({
      key,
      message: `Must be one of: ${allowed.map((v) => `"${v}"`).join(", ")}. Got: "${process.env[key]}".`,
    })
  }
  return value
}

function minLength(
  errors: EnvError[],
  key: string,
  min: number,
  description: string,
): void {
  const value = process.env[key]
  if (value && value.length < min) {
    errors.push({
      key,
      message: `${description} must be at least ${min} characters.`,
    })
  }
}

export function validateEnv(): void {
  const errors = collect((e) => {
    required(e, "DATABASE_URL", "PostgreSQL connection string")
    // Optional — set in production to offload read queries to a replica.
    // When unset, all queries go through DATABASE_URL (safe for development).
    if (process.env.DATABASE_URL_READ_ONLY) {
      required(
        e,
        "DATABASE_URL_READ_ONLY",
        "PostgreSQL read-replica connection string",
      )
    }

    const secret = required(e, "BETTER_AUTH_SECRET", "Auth secret key")
    if (secret) {
      minLength(e, "BETTER_AUTH_SECRET", 32, "Auth secret key")
    }

    required(e, "NEXT_PUBLIC_SITE_URL", "App base URL")

    // A deploy with NEXT_PUBLIC_ENV=development in production would silently
    // disable Vercel Analytics and keep localhost in trustedOrigins, so make
    // sure that var is explicitly validated rather than left to its fallback.
    // A deploy with NEXT_PUBLIC_ENV=development in production would silently
    // disable Vercel Analytics — validate the var rather than trusting its
    // fallback.
    oneOf(e, "NEXT_PUBLIC_ENV", ["development", "production"], "development")

    // Used to authenticate the /api/cron/cleanup-sessions endpoint.
    // Generate with: openssl rand -base64 32
    required(e, "CRON_SECRET", "Secret for authenticating cron job requests")

    // Optional — retention period in days for audit log cleanup (default 90).
    // Set in environment to override; validated only when present.
    if (process.env.AUDIT_LOG_RETENTION_DAYS) {
      const days = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 10)
      if (isNaN(days) || days < 1) {
        e.push({
          key: "AUDIT_LOG_RETENTION_DAYS",
          message: "Must be a positive integer (days).",
        })
      }
    }

    // Optional — retention period in days for successful email log cleanup
    // (default 30). Set in environment to override; validated only when present.
    if (process.env.EMAIL_LOG_RETENTION_DAYS) {
      const days = parseInt(process.env.EMAIL_LOG_RETENTION_DAYS, 10)
      if (isNaN(days) || days < 1) {
        e.push({
          key: "EMAIL_LOG_RETENTION_DAYS",
          message: "Must be a positive integer (days).",
        })
      }
    }

    // AES-256-GCM key for SMTP password at rest (64 hex chars = 32 bytes).
    // Optional in development (crypto.ts falls back to a dev key so local
    // setups keep working), REQUIRED in production — silently using the
    // hardcoded dev key would make stored secrets decryptable by anyone with
    // the source. Generate with: openssl rand -hex 32
    const isProd = process.env.NEXT_PUBLIC_ENV === "production"
    const ssk = process.env.SMTP_SECRET_KEY
    if (isProd && !ssk) {
      e.push({
        key: "SMTP_SECRET_KEY",
        message:
          "Required in production (AES-256-GCM key for SMTP password at rest). Generate with `openssl rand -hex 32`.",
      })
    } else if (ssk && !/^[0-9a-f]{64}$/i.test(ssk)) {
      e.push({
        key: "SMTP_SECRET_KEY",
        message:
          "Must be 64 hex characters (32 bytes). Generate with `openssl rand -hex 32`.",
      })
    }

    // Optional — Redis for cross-instance rate limiting. When unset the rate
    // limiter uses an in-memory store; validate the URL when provided.
    if (process.env.REDIS_URL) {
      required(e, "REDIS_URL", "Redis connection string (for rate limiting)")
    }

    const provider = oneOf(
      e,
      "STORAGE_PROVIDER",
      ["local", "r2", "supabase"],
      "local",
    )

    if (provider === "local") {
      required(e, "LOCAL_UPLOADS_DIR", "Local uploads directory path")
    } else if (provider === "r2") {
      required(e, "R2_ACCOUNT_ID", "Cloudflare account ID")
      required(e, "R2_ACCESS_KEY_ID", "R2 API access key")
      required(e, "R2_SECRET_ACCESS_KEY", "R2 API secret key")
      required(e, "R2_BUCKET_NAME", "R2 bucket name")
      required(e, "R2_PUBLIC_URL", "R2 public base URL")
    } else if (provider === "supabase") {
      required(e, "SUPABASE_URL", "Supabase project URL")
      required(e, "SUPABASE_SERVICE_KEY", "Supabase service role key")
      required(e, "SUPABASE_BUCKET", "Supabase storage bucket name")
      required(e, "SUPABASE_PUBLIC_URL", "Supabase public storage URL")
    }
  })

  if (errors.length === 0) return

  const lines = errors
    .map(({ key, message }) => `  ✗ ${key}: ${message}`)
    .join("\n")

  throw new Error(
    `\n\nMissing or invalid environment variables (${errors.length}):\n\n${lines}\n\n` +
      `Check your .env file against env.example and restart the server.\n`,
  )
}
