-- Custom SQL migration file, put your code below! --
-- Prerequisites for human-readable entity IDs.
-- Sequences are defined in the Drizzle schema (pgSequence) and created
-- automatically by db:push or db:generate. This migration only covers
-- objects that Drizzle Kit cannot auto-generate.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION "public".gen_entity_code(entity_prefix text, seq_val bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
  SELECT upper(entity_prefix) || '-' || lpad(seq_val::text, 6, '0')
$$;
