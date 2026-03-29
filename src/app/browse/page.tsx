'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SeriesCard } from '@/components/SeriesCard'
import { useToast } from '@/components/Toast'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// --- 1. Everything stays exactly the same in this component ---
function BrowseContent() {
  const { show } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') || 'mostviewed'
  const [series, setSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(45)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const col = mode === 'latest' ? 'updated_at' : 'total_views'
        const { data } = await supabase.from('series')
          .select('*, profiles!series_author_id_fkey(display_name, handle, avatar_url)')
          .order(col, { ascending: false }).limit(limit)
        if (!cancelled) { setSeries(data ?? []); setLoading(false) }
      } catch { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [mode, limit, supabase])

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Link href="/" className="flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
        </Link>
        <h1 className="text-xl font-bold text-white">{mode === 'latest' ? 'Latest Updates' : 'Most Viewed'}</h1>
      </div>
      {loading && series.length === 0 ? <p className="text-center py-12 text-[#52525b] text-sm">Loading...</p> : series.length === 0 ? (
        <p className="text-center py-12 text-[#52525b] text-sm">No series yet.</p>
      ) : (
        <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
          {series.map((s, i) => (
            <SeriesCard key={s.id} title={s.title} slug={s.slug} author={s.profiles?.display_name || 'Unknown'} thumbnailUrl={s.thumbnail_url}
              latestChapter={0} rating="General" format={s.format} index={i} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />
          ))}
        </div>
      )}
      {series.length > 0 && <div className="flex justify-center mt-7">
        <button onClick={() => { setLimit(p => p + 18); show('Loaded more!') }}
          className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]">View More</button>
      </div>}
    </div>
  )
}

// --- 2. This wrapper just lets Cloudflare build the page ---
export default function BrowsePage() {
  return (
    <Suspense fallback={<p className="text-center py-12 text-[#52525b] text-sm">Loading...</p>}>
      <BrowseContent />
    </Suspense>
  )
}