-- ─────────────────────────────────────────────────────────────────────────────
-- NANOTOON: Latest-Updates ranking anti-abuse schema
--
-- Run this ONCE in your Supabase SQL editor before deploying the code changes
-- that reference `max_chapter_added`. It's idempotent (IF NOT EXISTS /
-- COALESCE backfill), so re-running is safe.
--
-- Why:
--   The "Latest Updates" rail is sorted by series.updated_at DESC. Previously
--   every series edit, every chapter title/rating/page edit, and every
--   chapter insert (including re-uploading a chapter number that had just
--   been deleted) was bumping updated_at — which let authors game the ranking
--   by deleting + re-uploading the same chapter number over and over to pop
--   back to the top of the site.
--
-- The fix:
--   updated_at now only bumps when a *genuinely new* chapter is added — i.e.
--   a chapter whose chapter_number is strictly greater than any
--   chapter_number this series has ever had. `max_chapter_added` persists
--   that historical high-water mark across deletes, so re-inserting a deleted
--   number no longer qualifies.
--
--   Rule summary (enforced in code, this column is just the state it needs):
--     • Add chapter N where N > max_chapter_added → bump updated_at, set
--       max_chapter_added = N.
--     • Add chapter N where N <= max_chapter_added → no bump (re-upload of a
--       previously-deleted number, or an out-of-order insert).
--     • Edit series / edit chapter title|rating / add pages to existing
--       chapter / delete chapter → no bump.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE series ADD COLUMN IF NOT EXISTS max_chapter_added integer;

-- Backfill for existing series: set max_chapter_added to the current max
-- chapter_number on each series. For rows that are already set, COALESCE
-- keeps the existing value (re-run-safe).
UPDATE series s
SET max_chapter_added = COALESCE(
  s.max_chapter_added,
  (SELECT MAX(c.chapter_number) FROM chapters c WHERE c.series_id = s.id)
)
WHERE s.max_chapter_added IS NULL;
