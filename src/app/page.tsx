'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { SeriesCard } from '@/components/SeriesCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AdsterraBanner } from '@/components/AdsterraBanner'
import { useToast } from '@/components/Toast'
import { createAnonClient } from '@/lib/supabase/anon'
import { latestRating } from '@/lib/seriesRating'
import { hydrateSeriesCounts } from '@/lib/hydrateSeriesCounts'
import { TIME_WINDOWS, timeWindowSince, type TimeWindow } from '@/lib/timeWindow'

export default function HomePage() {
  const { show } = useToast()
  const supabase = useMemo(() => createAnonClient(), [])
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [formatFilter, setFormatFilter] = useState('All')
  const [mvTime, setMvTime] = useState<TimeWindow>('All Time')
  const [mostViewed, setMostViewed] = useState<any[]>([])
  const [latest, setLatest] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [latestLimit, setLatestLimit] = useState(45)

  useEffect(() => { function c() { setIsMobile(window.innerWidth < 768) }; c(); setMounted(true); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c) }, [])

  useEffect(() => {
    let cancelled = false
    // Safety timeout — never let homepage loading hang
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) { setLoading(false); console.warn('Homepage safety timeout fired') }
    }, 6000)
    async function load() {
      try {
        setLoading(true)
        let mvQ = supabase.from('series').select('*, profiles!series_author_id_fkey(display_name, handle, avatar_url), chapters(rating, chapter_number)').neq('is_removed', true).order('total_views', { ascending: false }).limit(9)
        if (formatFilter !== 'All') mvQ = mvQ.eq('format', formatFilter)
        // FIX: the Today/Week/Month/Year/All Time pills used to only flip the
        // button styles — mvTime was never fed into the query. Now we filter
        // by updated_at (the closest proxy we have; there's no view-event
        // log to compute true "views in last N days"), which gives the
        // intuitive "popular recently" reading.
        const mvSince = timeWindowSince(mvTime)
        if (mvSince) mvQ = mvQ.gte('updated_at', mvSince)
        let latQ = supabase.from('series').select('*, profiles!series_author_id_fkey(display_name, handle, avatar_url), chapters(rating, chapter_number)').neq('is_removed', true).order('updated_at', { ascending: false }).limit(latestLimit)
        if (formatFilter !== 'All') latQ = latQ.eq('format', formatFilter)
        const [mv, lt] = await Promise.all([mvQ, latQ])
        if (mv.error) console.error('Most viewed query error:', mv.error.message)
        if (lt.error) console.error('Latest query error:', lt.error.message)
        // Hydrate real like/favorite counts from the source-of-truth tables
        // so cards here match the series-page float menu and user profile.
        // See src/lib/hydrateSeriesCounts.ts for the full explanation.
        const [mvHydrated, ltHydrated] = await Promise.all([
          hydrateSeriesCounts(supabase, (mv.data ?? []) as any[]),
          hydrateSeriesCounts(supabase, (lt.data ?? []) as any[]),
        ])
        if (!cancelled) { setMostViewed(mvHydrated); setLatest(ltHydrated) }
      } catch (err: any) { console.error('Home page load error:', err) } finally { clearTimeout(safetyTimeout); if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true; clearTimeout(safetyTimeout) }
  }, [formatFilter, latestLimit, mvTime, supabase])

  if (!mounted) return <div className="min-h-screen" />

  return (
    <div className="px-4 md:px-8 pb-10">
      <div className="py-10 md:py-14 text-center">
        <h1 className="text-2xl md:text-5xl font-bold text-white tracking-tight leading-tight mb-2">Explore the World of{' '}<span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">AI Comics.</span></h1>
        <p className="text-[#71717a] text-sm md:text-lg">Share your vision. Tell your story.</p>
      </div>
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        <span className="text-[0.75rem] text-[#71717a] shrink-0">Show:</span>
        {['All', 'Series', 'One Shot'].map(f => (
          <button key={f} onClick={() => { setFormatFilter(f); setLatestLimit(45) }} className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border transition-all ${formatFilter === f ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{f}</button>
        ))}
      </div>
      <section className="mb-9">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <Link href="/browse?mode=mostviewed" className="text-base font-semibold text-[#c084fc] no-underline flex items-center gap-1 hover:text-[#a855f7]">Most Viewed <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></Link>
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {TIME_WINDOWS.map(t => (<button key={t} onClick={() => { setMvTime(t); show(`Showing: ${t}`) }} className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border whitespace-nowrap transition-all ${mvTime === t ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{t}</button>))}
          </div>
        </div>
        {loading ? <LoadingSpinner /> : mostViewed.length === 0 ? <p className="text-center py-12 text-[#52525b] text-sm">No series uploaded yet. Be the first!</p> : (
          <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">{mostViewed.slice(0, isMobile ? 6 : 9).map((s, i) => (<SeriesCard key={s.id} title={s.title} slug={s.slug} author={s.profiles?.display_name || 'Unknown'} thumbnailUrl={s.thumbnail_url} latestChapter={0} rating={latestRating(s.chapters)} format={s.format} index={i} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />))}</div>
        )}
      </section>
      {/* Adsterra 728x90 banner — moved up from the footer so it sits between
          Most Viewed and Latest Updates. AdsterraBanner itself handles mobile
          scaling + overflow:hidden to prevent the old horizontal-swipe bug. */}
      <AdsterraBanner />
      <section>
        <Link href="/browse?mode=latest" className="text-base font-semibold text-[#c084fc] no-underline flex items-center gap-1 mb-3 hover:text-[#a855f7]">Latest Updates <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></Link>
        {!loading && latest.length === 0 ? <p className="text-center py-12 text-[#52525b] text-sm">No series yet.</p> : (
          <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">{latest.map((s, i) => (<SeriesCard key={s.id} title={s.title} slug={s.slug} author={s.profiles?.display_name || 'Unknown'} thumbnailUrl={s.thumbnail_url} latestChapter={0} rating={latestRating(s.chapters)} format={s.format} index={i + 9} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />))}</div>
        )}
        {latest.length > 0 && <div className="flex justify-center mt-7"><button onClick={() => { setLatestLimit(prev => prev + 18); show('Loaded more!') }} className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]">View More</button></div>}
      </section>
    </div>
  )
}
