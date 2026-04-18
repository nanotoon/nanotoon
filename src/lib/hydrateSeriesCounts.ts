// ─────────────────────────────────────────────────────────────────────────────
// Accurate like/favorite counts for series-list pages.
//
// Why this exists:
//   RLS on the `series` table only lets the series author or the admin UPDATE
//   that row. So `series.total_likes` / `series.total_favorites` only get
//   written when the author or the admin likes/favs — for every other user,
//   the update silently fails and the columns go stale. That's why the
//   homepage tabs (Read, Categories, Favorites, Following) showed low/
//   inconsistent numbers while the series-page float menu and user profile
//   looked correct: the float menu and profile already count directly from
//   the source-of-truth `likes` / `favorites` tables.
//
//   This helper applies the same source-of-truth hydration to any list of
//   series, so every card across the site shows the same numbers as the
//   float menu. Exactly the same pattern already used in
//   src/app/user/[handle]/page.tsx and src/app/profile/page.tsx.
//
// What it touches:
//   ONLY `total_likes` and `total_favorites` on each series. Every other
//   field (including `total_views`, which IS kept fresh via /api/views)
//   is passed through unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export async function hydrateSeriesCounts<T extends { id: string }>(
  db: any,
  list: T[]
): Promise<(T & { total_likes: number; total_favorites: number })[]> {
  if (!list || list.length === 0) return list as any
  const seriesIds = list.map(s => s.id)

  const [likesRows, favsRows] = await Promise.all([
    db.from('likes').select('series_id').in('series_id', seriesIds),
    db.from('favorites').select('series_id').in('series_id', seriesIds),
  ]) as any[]

  const likeCounts = new Map<string, number>()
  const favCounts = new Map<string, number>()
  for (const r of ((likesRows?.data ?? []) as any[])) {
    likeCounts.set(r.series_id, (likeCounts.get(r.series_id) ?? 0) + 1)
  }
  for (const r of ((favsRows?.data ?? []) as any[])) {
    favCounts.set(r.series_id, (favCounts.get(r.series_id) ?? 0) + 1)
  }

  return list.map((s: any) => ({
    ...s,
    total_likes: likeCounts.get(s.id) ?? 0,
    total_favorites: favCounts.get(s.id) ?? 0,
  }))
}
