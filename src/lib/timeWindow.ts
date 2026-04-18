// ─────────────────────────────────────────────────────────────────────────────
// Shared time-window pills used by the tab pages.
//
// All tabs (Read / Categories / Favorites / Following / user profile) surface a
// "Today / Week / Month / Year / All Time" selector. They should behave the
// same way — same labels, same boundaries, same ISO-string formatter — so
// every tab is extracted to this one place and imported.
//
// The boundary for each window is the start of the rolling period relative
// to "now" in the viewer's local timezone:
//   • Today       → 24h ago
//   • This Week   → 7 days ago
//   • This Month  → 30 days ago
//   • This Year   → 365 days ago
//   • All Time    → null (no filter)
// "Rolling" rather than "since the start of this calendar week/month/year"
// because it's simpler to explain and it never produces an empty result the
// first day/hour of a new month.
// ─────────────────────────────────────────────────────────────────────────────

export type TimeWindow = 'Today' | 'Week' | 'Month' | 'Year' | 'All Time'

export const TIME_WINDOWS: TimeWindow[] = ['Today', 'Week', 'Month', 'Year', 'All Time']

/**
 * Returns the ISO string at the start of the rolling window, or null for
 * "All Time". Use this as the `.gte(...)` bound on a timestamptz column
 * like `updated_at` / `created_at`.
 */
export function timeWindowSince(w: TimeWindow): string | null {
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000
  switch (w) {
    case 'Today':    return new Date(now - 1 * DAY).toISOString()
    case 'Week':     return new Date(now - 7 * DAY).toISOString()
    case 'Month':    return new Date(now - 30 * DAY).toISOString()
    case 'Year':     return new Date(now - 365 * DAY).toISOString()
    case 'All Time': return null
  }
}
