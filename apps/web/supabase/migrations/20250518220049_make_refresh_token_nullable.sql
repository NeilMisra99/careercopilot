-- Migration: Make refresh_token_encrypted nullable now that token data can live in KV
-- Created: 2025-06-01

ALTER TABLE public.user_email_integrations
ALTER COLUMN refresh_token_encrypted DROP NOT NULL;

-- Optionally, ensure access_token_encrypted remains nullable (no-op if already):
ALTER TABLE public.user_email_integrations
ALTER COLUMN access_token_encrypted DROP NOT NULL;

-- No data backfill is required; existing rows already have values. 