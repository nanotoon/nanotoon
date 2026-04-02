'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { SeriesCard } from '@/components/SeriesCard'
import { GalleryCard } from '@/components/GalleryCard'
import { useToast } from '@/components/Toast'
import { createClient } from '@/lib/supabase/client'

export default function HomePage() {
  const { show } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'read' | 'gallery'>('read')
  const [formatFilter, setFormatFilter] = useState('All')
  const [mvTime, setMvTime] = useState('Today')
  const [mostViewed, setMostViewed] = useState<any[]>([])
  const [latest, setLatest] = useState<any[]>([])
  const [galleryItems, setGalleryItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [galleryLoading, setGalleryLoading] = useState(true)
  const [latestLimit, setLatestLimit] = useState(45)
  const [galleryLimit, setGalleryLimit] = useState(45)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check(); setMounted(true)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Load series data
  useEffect(() => {
    if (activeTab !== 'read') return
    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)

    async function load() {
      try {
        setLoading(true)
        let mvQ = supabase.from('series')
          .select('*, profiles(display_name, handle, avatar_url)')
          .order('total_views', { ascending: false }).limit(9)
        if (formatFilter !== 'All') mvQ = mvQ.eq('format', formatFilter)

        let latQ = supabase.from('series')
          .select('*, profiles(display_name, handle, avatar_url)')
          .order('updated_at', { ascending: false }).limit(latestLimit)
        if (formatFilter !== 'All') latQ = latQ.eq('format', formatFilter)

        const [mv, lt] = await Promise.all([mvQ, latQ])
        if (!cancelled) {
          setMostViewed(mv.data ?? [])
          setLatest(lt.data ?? [])
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      } finally {
        clearTimeout(timeout)
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [formatFilter, latestLimit, supabase, activeTab])

  // Load gallery data
  useEffect(() => {
    if (activeTab !== 'gallery') return
    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setGalleryLoading(false) }, 8000)

    async function loadGallery() {
      try {
        setGalleryLoading(true)
        const { data } = await supabase.from('gallery')
          .select('*, profiles(display_name, handle, avatar_url)')
          .order('created_at', { ascending: false })
          .limit(galleryLimit)
        if (!cancelled) {
          setGalleryItems(data ?? [])
          setGalleryLoading(false)
        }
      } catch {
        if (!cancelled) setGalleryLoading(false)
      } finally {
        clearTimeout(timeout)
      }
    }
    loadGallery()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [supabase, activeTab, galleryLimit])

  const timePills = ['Today', 'Week', 'Month', 'Year', 'All Time']
  if (!mounted) return <div className="min-h-screen" />

  return (
    <div className="px-4 md:px-8 pb-10">
      <div className="py-10 md:py-14 text-center">
        <h1 className="text-2xl md:text-5xl font-bold text-white tracking-tight leading-tight mb-2">
          Explore the World of{' '}
          <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">AI Comics.</span>
        </h1>
        <p className="text-[#71717a] text-sm md:text-lg">Share your vision. Tell your story.</p>
      </div>

      {/* Tab selector: Read / Gallery */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => setActiveTab('read')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer border transition-all ${activeTab === 'read' ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>
          Read
        </button>
        <button onClick={() => setActiveTab('gallery')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer border transition-all ${activeTab === 'gallery' ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>
          Gallery
        </button>
      </div>

      {activeTab === 'read' && (
        <>
          <div className="flex items-center gap-1.5 mb-6 flex-wrap">
            <span className="text-[0.75rem] text-[#71717a] shrink-0">Show:</span>
            {['All', 'Series', 'One Shot'].map(f => (
              <button key={f} onClick={() => { setFormatFilter(f); setLatestLimit(45) }}
                className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border transition-all ${formatFilter === f ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>
                {f}
              </button>
            ))}
          </div>

          <section className="mb-9">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <Link href="/browse?mode=mostviewed" className="text-base font-semibold text-[#c084fc] no-underline flex items-center gap-1 hover:text-[#a855f7]">
                Most Viewed <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
              <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {timePills.map(t => (
                  <button key={t} onClick={() => { setMvTime(t); show(`Showing: ${t}`) }}
                    className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border whitespace-nowrap transition-all ${mvTime === t ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="text-center py-12 text-[#52525b] text-sm">Loading...</p>
            ) : mostViewed.length === 0 ? (
              <p className="text-center py-12 text-[#52525b] text-sm">No series uploaded yet. Be the first!</p>
            ) : (
              <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
                {mostViewed.slice(0, isMobile ? 6 : 9).map((s, i) => (
                  <SeriesCard
                    key={s.id} title={s.title} slug={s.slug}
                    author={s.profiles?.display_name || 'Unknown'}
                    thumbnailUrl={s.thumbnail_url}
                    latestChapter={0} rating="General" format={s.format} index={i}
                    views={s.total_views} likes={s.total_likes} favorites={s.total_favorites}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <Link href="/browse?mode=latest" className="text-base font-semibold text-[#c084fc] no-underline flex items-center gap-1 mb-3 hover:text-[#a855f7]">
              Latest Updates <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>

            {!loading && latest.length === 0 ? (
              <p className="text-center py-12 text-[#52525b] text-sm">No series yet.</p>
            ) : (
              <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
                {latest.map((s, i) => (
                  <SeriesCard
                    key={s.id} title={s.title} slug={s.slug}
                    author={s.profiles?.display_name || 'Unknown'}
                    thumbnailUrl={s.thumbnail_url}
                    latestChapter={0} rating="General" format={s.format} index={i + 9}
                    views={s.total_views} likes={s.total_likes} favorites={s.total_favorites}
                  />
                ))}
              </div>
            )}

            {latest.length > 0 && (
              <div className="flex justify-center mt-7">
                <button
                  onClick={() => { setLatestLimit(prev => prev + 18); show('Loaded more!') }}
                  className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]"
                >
                  View More
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'gallery' && (
        <section>
          <h2 className="text-base font-semibold text-[#c084fc] mb-3">Gallery</h2>
          {galleryLoading ? (
            <p className="text-center py-12 text-[#52525b] text-sm">Loading...</p>
          ) : galleryItems.length === 0 ? (
            <p className="text-center py-12 text-[#52525b] text-sm">No gallery artworks yet. Be the first!</p>
          ) : (
            <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
              {galleryItems.map((g, i) => (
                <GalleryCard key={g.id} item={g} index={i} />
              ))}
            </div>
          )}
          {galleryItems.length > 0 && (
            <div className="flex justify-center mt-7">
              <button onClick={() => { setGalleryLimit(prev => prev + 18); show('Loaded more!') }}
                className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]">
                View More
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
