'use client'
import { useState, useEffect, useMemo } from 'react'
import { SeriesCard } from '@/components/SeriesCard'
import { createAnonClient } from '@/lib/supabase/anon'
import { useAuth } from '@/contexts/AuthContext'

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createAnonClient(), [])
  const [favorites, setFavorites] = useState<any[]>([])
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
          .select('*, series(*, profiles!series_author_id_fkey(display_name, handle, avatar_url))')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }) as { data: any[] | null }
        clearTimeout(timeout)
        if (!cancelled) {
          setFavorites(data ?? [])
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
      {loading ? (
        <p className="text-center py-16 text-[#52525b] text-sm">Loading...</p>
      ) : !user ? (
        <p className="text-center py-16 text-[#71717a]">Sign in to see your favorites.</p>
      ) : favorites.length === 0 ? (
        <p className="text-center py-16 text-[#71717a]">
          No favorites yet.<br />
          <span className="text-sm block mt-2">Start reading and tap Favorite inside a series!</span>
        </p>
      ) : (
        <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
          {favorites.map((f, i) => f.series && (
            <SeriesCard
              key={f.series.id}
              title={f.series.title}
              slug={f.series.slug}
              author={f.series.profiles?.display_name || 'Unknown'}
              thumbnailUrl={f.series.thumbnail_url}
              latestChapter={0}
              rating="General"
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
