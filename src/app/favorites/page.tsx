'use client'
import { useState, useEffect, useMemo } from 'react'
import { SeriesCard } from '@/components/SeriesCard'
import { GalleryCard } from '@/components/GalleryCard'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [favorites, setFavorites] = useState<any[]>([])
  const [galleryFavs, setGalleryFavs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)

    Promise.all([
      supabase.from('favorites').select('*, series(*, profiles(display_name, handle, avatar_url))')
        .eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('gallery_favorites').select('*, gallery(*, profiles(display_name, handle, avatar_url))')
        .eq('user_id', user.id).order('created_at', { ascending: false }),
    ]).then(([seriesRes, galleryRes]) => {
      clearTimeout(timeout)
      if (!cancelled) {
        setFavorites(seriesRes.data ?? [])
        setGalleryFavs(galleryRes.data ?? [])
        setLoading(false)
      }
    }).catch(() => { clearTimeout(timeout); if (!cancelled) setLoading(false) })

    return () => { cancelled = true; clearTimeout(timeout) }
  }, [user, authLoading, supabase])

  const seriesList = favorites.filter(f => f.series)
  const galleryList = galleryFavs.filter(f => f.gallery)

  return (
    <div className="px-4 md:px-8 py-6">
      <h2 className="text-base font-semibold text-[#c084fc] mb-4">Your Favorites</h2>
      {loading ? (
        <p className="text-center py-16 text-[#52525b] text-sm">Loading...</p>
      ) : !user ? (
        <p className="text-center py-16 text-[#71717a]">Sign in to see your favorites.</p>
      ) : seriesList.length === 0 && galleryList.length === 0 ? (
        <p className="text-center py-16 text-[#71717a]">
          No favorites yet.<br />
          <span className="text-sm block mt-2">Start reading and tap Favorite inside a series!</span>
        </p>
      ) : (
        <>
          {/* Series Section */}
          {seriesList.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-[#a1a1aa] mb-2">Series</h3>
              <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
                {seriesList.map((f, i) => (
                  <SeriesCard
                    key={f.series.id} title={f.series.title} slug={f.series.slug}
                    author={f.series.profiles?.display_name || 'Unknown'}
                    thumbnailUrl={f.series.thumbnail_url} latestChapter={0} rating="General"
                    format={f.series.format} index={i}
                    views={f.series.total_views} likes={f.series.total_likes} favorites={f.series.total_favorites}
                  />
                ))}
              </div>
            </>
          )}

          {/* Gap between sections */}
          {seriesList.length > 0 && galleryList.length > 0 && <div className="h-6" />}

          {/* Gallery Section */}
          {galleryList.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-[#a1a1aa] mb-2">Gallery</h3>
              <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
                {galleryList.map((f, i) => (
                  <GalleryCard key={f.gallery.id} item={f.gallery} index={i} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
