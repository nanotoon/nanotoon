// ─────────────────────────────────────────────────────────────────────────────
// Profile links helpers.
//
// Users can attach up to 4 labelled links to their profile (title + url).
// The fresh storage column is profiles.links_json — a JSONB array of
// { title, url } objects. Older accounts have a plain-string value in the
// legacy profiles.links column; until such a user opens Settings and saves
// their updated links, we fall back to that string so nothing disappears.
//
// Exports:
//   readProfileLinks(profile)   → normalized array of { title, url }
//   normalizeUrl(url)           → adds https:// if no scheme; safe to pass
//                                 to <a href={...}>
// ─────────────────────────────────────────────────────────────────────────────

export type ProfileLink = { title: string; url: string }

export const MAX_PROFILE_LINKS = 4

export function readProfileLinks(profile: any): ProfileLink[] {
  if (!profile) return []
  // Preferred: the new JSONB column.
  const j = profile.links_json
  if (Array.isArray(j)) {
    return j
      .filter((x: any) => x && typeof x.url === 'string' && x.url.trim().length > 0)
      .slice(0, MAX_PROFILE_LINKS)
      .map((x: any) => ({
        title: (typeof x.title === 'string' && x.title.trim()) ? x.title.trim() : x.url.trim(),
        url: x.url.trim(),
      }))
  }
  // Legacy fallback: the old free-text `links` column. Treat the whole value
  // as one link. If the user wrote multiple URLs separated by commas or
  // whitespace, we still only show the first — they can upgrade by opening
  // Settings → Edit Links. The row gets rewritten to links_json on save.
  const legacy = (profile.links ?? '').toString().trim()
  if (!legacy) return []
  // Grab the first URL-ish token if there are multiple
  const first = legacy.split(/[\s,]+/).find((t: string) => t.length > 0) ?? legacy
  return [{ title: first, url: first }]
}

export function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  // If the user typed a scheme already, keep it.
  if (/^https?:\/\//i.test(t)) return t
  // mailto: / tel: / any other scheme → leave as-is.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t
  // Bare domain / path → assume https.
  return 'https://' + t
}
