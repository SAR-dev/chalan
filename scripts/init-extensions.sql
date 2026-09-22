-- PostgreSQL extensions for the delivery-management project.
--
-- This file runs automatically on first database init via docker-entrypoint-initdb.d.
-- Extensions are loaded in order of dependency. The extensions schema keeps
-- pg_stat_statements out of the public namespace.
--
-- NOTE: pg_cron is NOT created here because it requires shared_preload_libraries
-- to be set BEFORE the server starts. It is configured in the Docker compose files
-- and scheduled via scripts/setup-pg-cron.sql (run separately after migration).
-- 

-- ── Fuzzy text search ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Cryptographic helpers (gen_random_uuid, etc.) ──────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Additional B-tree operator classes for GIN indexes ─────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ── Query statistics (requires shared_preload_libraries) ────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA extensions;
