-- ─────────────────────────────────────────────────────────────────────────────
-- pg_cron setup for delivery-management
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this script ONCE as a superuser (postgres role) AFTER the app schema
-- migration has been applied. It replaces the HTTP-based cron endpoints with
-- native PostgreSQL scheduled jobs that run inside the database process.
--
-- Prerequisites:
--   1. pg_cron must be in shared_preload_libraries (see docker-compose files)
--   2. The app schema (Drizzle migrations) must have been applied
--   3. This script must be run as a superuser:
--        psql $DATABASE_URL -f scripts/setup-pg-cron.sql
--        -- or on Neon: paste into SQL Editor and run as postgres
--
-- The HTTP endpoints (api/cron/*) are preserved as a fallback for:
--   - Vercel deployments (no pg_cron available)
--   - Manual one-off cleanup runs
--   - Environments where pg_cron cannot be installed
--
-- To remove pg_cron jobs later:
--   SELECT cron.unschedule('cleanup-sessions');
--   SELECT cron.unschedule('cleanup-audit-logs');
--   SELECT cron.unschedule('cleanup-email-logs');
-- ─────────────────────────────────────────────────────────────────────────────

-- Create the pg_cron extension (requires shared_preload_libraries)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on the cron schema to the app role (if using a dedicated role)
-- GRANT USAGE ON SCHEMA cron TO app;

-- ── Job 1: Clean expired sessions + verification tokens ─────────────────────
-- Runs daily at 03:00 UTC. Sessions expire after 7 days (lib/auth.ts),
-- verification tokens are short-lived. Equivalent to:
--   POST /api/cron/cleanup-sessions
SELECT cron.schedule(
  'cleanup-sessions',          -- job name (for unschedule)
  '0 3 * * *',                 -- daily at 03:00 UTC
  $$
    DELETE FROM "session" WHERE "expiresAt" < now();
    DELETE FROM "verification" WHERE "expiresAt" < now();
  $$
);

-- ── Job 2: Clean old audit log entries ──────────────────────────────────────
-- Runs daily at 03:30 UTC. Default retention: 30 days.
-- Equivalent to: POST /api/cron/cleanup-audit-logs
SELECT cron.schedule(
  'cleanup-audit-logs',
  '30 3 * * *',
  $$
    DELETE FROM "audit_log"
    WHERE "createdAt" < now() - interval '1 day' * coalesce(
      nullif(current_setting('app.audit_log_retention_days', true), '')::int,
      30
    );
  $$
);

-- ── Job 3: Clean old sent email log entries ─────────────────────────────────
-- Runs daily at 04:00 UTC. Default retention: 10 days.
-- FAILED entries are preserved for debugging.
-- Equivalent to: POST /api/cron/cleanup-email-logs
SELECT cron.schedule(
  'cleanup-email-logs',
  '0 4 * * *',
  $$
    DELETE FROM "email_log"
    WHERE status = 'SENT'
      AND "markedSentAt" < now() - interval '1 day' * coalesce(
        nullif(current_setting('app.email_log_retention_days', true), '')::int,
        10
      );
  $$
);

-- ── Job 4: Clean orphaned uploads (HTTP only — NOT scheduled by pg_cron) ─────
-- Intended schedule: daily at 04:30 UTC.
-- Equivalent to: POST /api/cron/cleanup-uploads
--
-- Unlike jobs 1-3, this sweep lists and deletes files in storage (local disk /
-- R2), which only the app can do — there is no SQL equivalent, and
-- pg_cron has no HTTP client (this deployment installs no pg_net/http
-- extension). Schedule the endpoint over HTTP instead:
--   - Docker cron container: docker/compose.cluster.yml (04:30 line, configured;
--     ships with ?dryRun=1 — remove that query param after reviewing a week of
--     dry-run logs, per ROADMAP 5.6 acceptance)
--   - System crontab / manual run:
--       30 4 * * * curl -s -X POST "http://localhost:3000/api/cron/cleanup-uploads" \
--         -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1
--   - Vercel: not in vercel.json (free plan limit) — trigger manually or from
--     an external scheduler.
-- Grace period: UPLOAD_SWEEP_MIN_AGE_HOURS (default 48) — files younger than
-- that are never deleted, because ImageUpload stores on file select, before
-- the owning form is submitted.

-- ── Verification ────────────────────────────────────────────────────────────
-- Run this to confirm jobs are registered:
--   SELECT jobid, jobname, schedule, command FROM cron.job;
--
-- To check job run history:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
