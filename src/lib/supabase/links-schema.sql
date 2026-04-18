-- ─────────────────────────────────────────────────────────────────────────────
-- NANOTOON: multi-link profile support
--
-- Run this ONCE in your Supabase SQL editor before deploying these code
-- changes. Safe to re-run (uses IF NOT EXISTS).
--
-- Adds profiles.links_json — a JSONB array of { title, url } pairs, max 4
-- entries enforced at the application layer. Lets users add multiple
-- labelled links (e.g. "Follow my Patreon" → patreon.com/...) instead of
-- the old single free-text field.
--
-- The original profiles.links column is KEPT for backward compatibility:
-- existing users who had a value there will continue to see it rendered
-- as a single legacy link until they edit. On the first save after the
-- upgrade, the client writes to links_json and clears links, migrating
-- the account in place.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS links_json jsonb;
