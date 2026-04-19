'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SeriesCard } from '@/components/SeriesCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AdsterraBanner } from '@/components/AdsterraBanner'
import { useToast } from '@/components/Toast'
import { createAnonClient } from '@/lib/supabase/anon'
import { latestRating } from '@/lib/seriesRating'
import Link from 'next/link'

// --- 1. Everything stays exactly the same in this component ---
function BrowseContent() {
  const { show } = useToast()
  const supabase = useMemo(() => createAnonClient(), [])
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') || 'mostviewed'
  const [series, setSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // FIX: mobile-aware limit (27 mobile / 45 PC). Seed at 0 so the first-mount
  // effect picks the right seed once isMobile resolves — same pattern as home.
  const [limit, setLimit] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    setMounted(true)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (limit === 0) { setLimit(isMobile ? 27 : 45); return }
    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)
    async function load() {
      try {
        setLoading(true)
        const col = mode === 'latest' ? 'updated_at' : 'total_views'
        const { data } = await supabase.from('series')
          .select('*, profiles!series_author_id_fkey(display_name, handle, avatar_url), chapters(rating, chapter_number)')
          .neq('is_removed', true).order(col, { ascending: false }).limit(limit)
        clearTimeout(timeout); if (!cancelled) { setSeries(data ?? []); setLoading(false) }
      } catch { clearTimeout(timeout); if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [mode, limit, mounted, isMobile, supabase])

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Link href="/" className="flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
        </Link>
        <h1 className="text-xl font-bold text-white">{mode === 'latest' ? 'Latest Updates' : 'Most Viewed'}</h1>
      </div>
      {loading && series.length === 0 ? <LoadingSpinner /> : series.length === 0 ? (
        <p className="text-center py-12 text-[#52525b] text-sm">No series yet.</p>
      ) : (
        <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
          {series.map((s, i) => (
            <SeriesCard key={s.id} title={s.title} slug={s.slug} author={s.profiles?.display_name || 'Unknown'} thumbnailUrl={s.thumbnail_url}
              latestChapter={0} rating={latestRating(s.chapters)} format={s.format} index={i} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />
          ))}
        </div>
      )}
      {/* View More — mobile-aware increment (+6 mobile / +18 PC). */}
      {series.length > 0 && <div className="flex justify-center mt-7">
        <button onClick={() => { setLimit(p => p + (isMobile ? 6 : 18)); show('Loaded more!') }}
          className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]">View More</button>
      </div>}
      {/* Adsterra 728x90 banner — shown as a footer ad on the Browse page
          (both ?mode=mostviewed and ?mode=latest). AdsterraBanner handles
          mobile scaling + overflow:hidden to avoid the horizontal-swipe bug. */}
      <div className="mt-10">
        <AdsterraBanner />
      </div>
    </div>
  )
}

// --- 2. This wrapper just lets Cloudflare build the page ---
export default function BrowsePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <BrowseContent />
    </Suspense>
  )
}