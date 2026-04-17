// Returns the rating of the chapter with the highest chapter_number.
// Used by every listing page to display the MATURE tag on SeriesCard
// based on whether the most recent chapter is mature.
export function latestRating(chapters: { rating?: string | null; chapter_number?: number | null }[] | null | undefined): string {
  if (!chapters || chapters.length === 0) return 'General'
  let best = chapters[0]
  for (const c of chapters) {
    if ((c.chapter_number ?? 0) > (best.chapter_number ?? 0)) best = c
  }
  return best.rating || 'General'
}
