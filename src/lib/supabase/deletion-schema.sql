-- ─────────────────────────────────────────────────────────────────────────────
-- NANOTOON: account deletion + permanent-delete limbo schema
--
-- Run this ONCE in your Supabase SQL editor before deploying these code
-- changes. Everything is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS), so re-running is safe.
--
-- What this adds:
--
-- 1) profiles.deletion_status + profiles.deletion_scheduled_at
--    Implements user-initiated account deletion with a 30-day grace window.
--    `deletion_status` is one of:
--        NULL       → normal account
--        'pending'  → user clicked Delete Account and confirmed; invisible
--                     to the public and locked out, but recoverable for
--                     30 days. After 30 days the purge deletes everything.
--    `deletion_scheduled_at` is when the pending state began. Countdown =
--    30 days - (now - deletion_scheduled_at).
--
-- 2) series.permanent_delete_scheduled_at + series.permanent_delete_recovered_at
--    Implements the admin trash "Delete Forever" limbo. When admin clicks
--    Delete Forever on a removed series, `permanent_delete_scheduled_at`
--    is set to now(). A purge removes the row after 30 days. Admin can
--    hit Recover in that window to bring it back; that sets
--    `permanent_delete_recovered_at` and clears `permanent_delete_scheduled_at`.
--
--    48-hour reset rule: if admin hits Delete Forever *again* on the same
--    series, the countdown normally continues from where it was (so an
--    attacker can't reset it by toggling). BUT if more than 48 hours have
--    passed since `permanent_delete_recovered_at`, the countdown is
--    considered fresh and restarts at 30 days. This matches the user's
--    spec: "if its being recovered over 48 hrs, and being deleted forever
--    again, then it’ll reset to 30 days".
-- ─────────────────────────────────────────────────────────────────────────────

-- Accounts
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_status text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;

-- Series (soft-delete already handled by is_removed/removed_at; these columns
-- are ONLY for the permanent-delete 30-day limbo the admin triggers from
-- /admin/trash)
ALTER TABLE series ADD COLUMN IF NOT EXISTS permanent_delete_scheduled_at timestamptz;
ALTER TABLE series ADD COLUMN IF NOT EXISTS permanent_delete_recovered_at timestamptz;

-- Optional but recommended for performance:
CREATE INDEX IF NOT EXISTS idx_profiles_deletion_status
  ON profiles (deletion_status)
  WHERE deletion_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_series_perm_delete_sched
  ON series (permanent_delete_scheduled_at)
  WHERE permanent_delete_scheduled_at IS NOT NULL;

-- RLS policy addendum (OPTIONAL but recommended):
-- Hide pending-deletion profiles from the public. The client code in this
-- codebase ALSO filters defensively, but adding an RLS rule is the only
-- way to be certain anonymous queries can't see them.
--
-- Example (adapt to your existing policies):
--   CREATE POLICY "profiles_public_read"
--     ON profiles FOR SELECT
--     USING (
--       deletion_status IS NULL
--       OR auth.jwt() ->> 'email' = 'nanotooncontact@gmail.com'
--     );
--
-- If you already have a profiles SELECT policy, add the deletion_status
-- IS NULL clause to it with AND.
