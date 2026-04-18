'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import { SeriesCard } from '@/components/SeriesCard'
import { createAnonClient } from '@/lib/supabase/anon'
import { useAuth } from '@/contexts/AuthContext'
import { latestRating } from '@/lib/seriesRating'
import { hydrateSeriesCounts } from '@/lib/hydrateSeriesCounts'

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createAnonClient(), [])
  const [favorites, setFavorites] = useState<any[]>([])
  const [formatFilter, setFormatFilter] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Wait for auth to finish before doing anything
    if (authLoading) return

    if (!user) {
      setLoading(false)
      return
    }

    let cancelled = false

    // Hard timeout — never spin forever
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 8000)

    async function load() {
      try {
        const { data } = await supabase
          .from('favorites')
          .select('*, series(*, profiles!series_author_id_fkey(display_name, handle, avatar_url), chapters(rating, chapter_number))')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false }) as { data: any[] | null }
        clearTimeout(timeout)
        if (!cancelled) {
          // Hydrate real like/favorite counts on the nested series objects so
          // the cards here match the series-page float menu and user profile.
          const rows = data ?? []
          const seriesList = rows.map(r => r.series).filter(Boolean)
          const hydrated = await hydrateSeriesCounts(supabase, seriesList as any[])
          const byId = new Map<string, any>(hydrated.map((s: any) => [s.id, s]))
          const merged = rows.map(r => r.series ? { ...r, series: byId.get(r.series.id) ?? r.series } : r)
          setFavorites(merged)
          setLoading(false)
        }
      } catch {
        clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      }
    }
    load()

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [user, authLoading, supabase])

  return (
    <div className="px-4 md:px-8 py-6">
      <h2 className="text-base font-semibold text-[#c084fc] mb-4">Your Favorites</h2>
      {user && !loading && favorites.length > 0 && (
        <div className="flex items-center gap-1.5 mb-5 flex-wrap">
          <span className="text-[0.75rem] text-[#71717a] shrink-0">Show:</span>
          {['All', 'Series', 'One Shot'].map(f => (
            <button key={f} onClick={() => setFormatFilter(f)}
              className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border transition-all ${formatFilter === f ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{f}</button>
          ))}
        </div>
      )}
      {loading ? (
        <LoadingSpinner />
      ) : !user ? (
        <p className="text-center py-16 text-[#71717a]">Sign in to see your favorites.</p>
      ) : favorites.length === 0 ? (
        <p className="text-center py-16 text-[#71717a]">
          No favorites yet.<br />
          <span className="text-sm block mt-2">Start reading and tap Favorite inside a series!</span>
        </p>
      ) : (
        <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
          {favorites.map((f, i) => f.series && !f.series.is_removed && (formatFilter === 'All' || f.series.format === formatFilter) && (
            <SeriesCard
              key={f.series.id}
              title={f.series.title}
              slug={f.series.slug}
              author={f.series.profiles?.display_name || 'Unknown'}
              thumbnailUrl={f.series.thumbnail_url}
              latestChapter={0}
              rating={latestRating(f.series.chapters)}
              format={f.series.format}
              index={i}
              views={f.series.total_views}
              likes={f.series.total_likes}
              favorites={f.series.total_favorites}
            />
          ))}
        </div>
      )}
    </div>
  )
}
