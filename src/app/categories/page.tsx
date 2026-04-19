'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { SeriesCard } from '@/components/SeriesCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AdsterraBanner } from '@/components/AdsterraBanner'
import { categories } from '@/data/mock'
import { useToast } from '@/components/Toast'
import { createAnonClient } from '@/lib/supabase/anon'
import { latestRating } from '@/lib/seriesRating'
import { hydrateSeriesCounts } from '@/lib/hydrateSeriesCounts'
import { TIME_WINDOWS, timeWindowSince, type TimeWindow } from '@/lib/timeWindow'

export default function CategoriesPage() {
  const { show } = useToast()
  const supabase = useMemo(() => createAnonClient(), [])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [formatFilter, setFormatFilter] = useState('All')
  const [mvTime, setMvTime] = useState<TimeWindow>('All Time')
  const [series, setSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(45)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        let q = supabase.from('series').select('*, profiles!series_author_id_fkey(display_name, handle, avatar_url), chapters(rating, chapter_number)').neq('is_removed', true)
          .order('updated_at', { ascending: false }).limit(limit)
        if (selectedCat) q = q.contains('genres', [selectedCat])
        const { data } = await q
        // Hydrate real like/favorite counts from the source-of-truth tables
        // so cards here match the series-page float menu and user profile.
        const hydrated = await hydrateSeriesCounts(supabase, (data ?? []) as any[])
        if (!cancelled) { setSeries(hydrated); setLoading(false) }
      } catch { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [selectedCat, limit, supabase])

  function handleCatClick(catName: string) {
    if (selectedCat === catName) {
      setSelectedCat(null)
    } else {
      setSelectedCat(catName)
      setLimit(45)
      show(`Filtering: ${catName}`)
      // Auto-scroll on mobile
      if (isMobile && resultsRef.current) {
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    }
  }

  const filteredSeries = formatFilter === 'All' ? series : series.filter(s => s.format === formatFilter)
  // FIX: time pill (Today/Week/Month/Year/All Time) narrows ONLY the Most
  // Viewed slice, same placement and semantics as the Read-tab Most Viewed
  // pills. Latest Updates below stays unfiltered, matching the home page.
  const mvSince = timeWindowSince(mvTime)
  const mvPool = mvSince ? filteredSeries.filter(s => s.updated_at && s.updated_at >= mvSince) : filteredSeries
  const mvSeries = [...mvPool].sort((a, b) => (b.total_views ?? 0) - (a.total_views ?? 0)).slice(0, 9)

  return (
    <div className="px-4 md:px-8 py-6">
      <h2 className="text-base font-semibold text-[#c084fc] mb-3.5">Browse by Category</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 md:gap-3 mb-8">
        {categories.map(cat => (
          <div key={cat.name} onClick={() => handleCatClick(cat.name)}
            className={`rounded-xl p-3 text-center cursor-pointer hover:opacity-80 transition-opacity ${selectedCat === cat.name ? 'ring-2 ring-[#a855f7]' : ''}`} style={{ background: cat.bg }}>
            <div className="text-2xl md:text-3xl mb-1">{cat.emoji}</div>
            <div className="font-semibold text-[0.8rem]">{cat.name}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        <span className="text-[0.75rem] text-[#71717a] shrink-0">Show:</span>
        {['All', 'Series', 'One Shot'].map(f => (
          <button key={f} onClick={() => setFormatFilter(f)}
            className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border transition-all ${formatFilter === f ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{f}</button>
        ))}
      </div>

      <div ref={resultsRef}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-[#c084fc]">Most Viewed</h2>
            <span className="bg-[#27272a] text-[#c084fc] rounded-full px-2.5 py-0.5 text-[0.71rem] font-medium">{selectedCat || 'All'}</span>
            {selectedCat && <button onClick={() => { setSelectedCat(null); setLimit(45) }} className="bg-transparent border border-[#3f3f46] rounded-full px-2.5 py-0.5 text-[0.71rem] text-[#71717a] cursor-pointer hover:border-[#a855f7]">✕ Clear</button>}
          </div>
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {TIME_WINDOWS.map(t => (
              <button key={t} onClick={() => { setMvTime(t); show(`Showing: ${t}`) }} className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border whitespace-nowrap transition-all ${mvTime === t ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{t}</button>
            ))}
          </div>
        </div>
        {loading && mvSeries.length === 0 ? <LoadingSpinner /> : mvSeries.length === 0 ? (
          <p className="text-center py-8 text-[#71717a] text-sm mb-8">No series yet.</p>
        ) : (
          <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9 mb-8">
            {mvSeries.map((s, i) => (
              <SeriesCard key={s.id} title={s.title} slug={s.slug} author={s.profiles?.display_name || 'Unknown'} thumbnailUrl={s.thumbnail_url}
                latestChapter={0} rating={latestRating(s.chapters)} format={s.format} index={i} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />
            ))}
          </div>
        )}

        {/* Adsterra 728x90 banner — moved up from the footer so it sits between
            Most Viewed and Latest Updates. AdsterraBanner itself handles mobile
            scaling + overflow:hidden to prevent the old horizontal-swipe bug. */}
        <AdsterraBanner />

        <h2 className="text-base font-semibold text-[#c084fc] mb-3">Latest Updates</h2>
        {filteredSeries.length > 0 ? (
          <>
            <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
              {filteredSeries.map((s, i) => (
                <SeriesCard key={s.id+'-l'} title={s.title} slug={s.slug} author={s.profiles?.display_name || 'Unknown'} thumbnailUrl={s.thumbnail_url}
                  latestChapter={0} rating={latestRating(s.chapters)} format={s.format} index={i + 9} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />
              ))}
            </div>
            <div className="flex justify-center mt-7">
              <button onClick={() => { setLimit(p => p + 18); show('Loaded more!') }}
                className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]">View More</button>
            </div>
          </>
        ) : !loading && <p className="text-center py-8 text-[#71717a] text-sm">No series yet.</p>}
      </div>
    </div>
  )
}
