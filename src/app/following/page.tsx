'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import { SeriesCard } from '@/components/SeriesCard'
import { GalleryCard } from '@/components/GalleryCard'
import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { createWriteClient, ensureFreshSession, getAuthUserId } from '@/lib/supabase/write'

export default function FollowingPage() {
  const { show } = useToast()
  const { user, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [following, setFollowing] = useState<any[]>([])
  const [feedSeries, setFeedSeries] = useState<any[]>([])
  const [feedGallery, setFeedGallery] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }

    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 6000)

    async function load() {
      try {
        const uid = getAuthUserId() || user!.id

        // Get who we follow
        const { data: followData } = await anonDb
          .from('follows')
          .select('*, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url)')
          .eq('follower_id', uid)
          .order('created_at', { ascending: false }) as { data: any[] | null }

        if (cancelled) return
        const follows = followData ?? []
        setFollowing(follows)

        // Get IDs of followed users
        const followedIds = follows.map((f: any) => f.following_id).filter(Boolean)

        if (followedIds.length > 0) {
          // Fetch series & gallery from followed users
          const [seriesRes, galleryRes] = await Promise.all([
            anonDb.from('series')
              .select('*, profiles!series_author_id_fkey(display_name, handle, avatar_url)')
              .in('author_id', followedIds)
              .order('updated_at', { ascending: false })
              .limit(20),
            anonDb.from('gallery')
              .select('*, profiles!gallery_author_id_fkey(display_name, handle, avatar_url)')
              .in('author_id', followedIds)
              .order('created_at', { ascending: false })
              .limit(20),
          ]) as any[]

          if (!cancelled) {
            setFeedSeries(seriesRes.data ?? [])
            setFeedGallery(galleryRes.data ?? [])
          }
        }

        clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      } catch {
        clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [user, authLoading, anonDb])

  async function unfollow(targetId: string, name: string) {
    if (!confirm(`Unfollow ${name}?`)) return
    await ensureFreshSession()
    const wc = createWriteClient()
    if (!wc) { show('Sign in to unfollow'); return }
    const uid = getAuthUserId()
    if (!uid) return
    await (wc as any).from('follows').delete().eq('follower_id', uid).eq('following_id', targetId)
    setFollowing(prev => prev.filter(f => f.following_id !== targetId))
    setFeedSeries(prev => prev.filter(s => s.author_id !== targetId))
    setFeedGallery(prev => prev.filter(g => g.author_id !== targetId))
    show(`Unfollowed ${name}`)
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-[960px] mx-auto">
      <h2 className="text-base font-semibold text-[#c084fc] mb-3.5">People You Follow</h2>
      {loading ? (
        <LoadingSpinner />
      ) : !user ? (
        <p className="text-center py-6 text-[#71717a]">Sign in to see who you follow.</p>
      ) : following.length === 0 ? (
        <p className="text-center py-6 text-[#71717a]">Not following anyone yet.</p>
      ) : (<>
        <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2 md:gap-3 mb-6">
          {following.map(f => {
            const p = f.profiles
            if (!p) return null
            return (
              <div key={f.following_id} className="bg-[#18181b] rounded-xl md:rounded-2xl p-2 md:p-3 flex items-center gap-2 md:gap-2.5 border border-[#27272a]">
                {p.avatar_url
                  ? <img src={p.avatar_url} className="w-7 h-7 md:w-9 md:h-9 rounded-full object-cover" alt={p.display_name} />
                  : <Avatar name={p.display_name} size={36} className="w-7 h-7 md:w-9 md:h-9" />
                }
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[0.7rem] md:text-sm truncate">{p.display_name}</div>
                  <div className="text-[0.6rem] md:text-[0.7rem] text-[#71717a] truncate">@{p.handle}</div>
                </div>
                <button
                  onClick={() => unfollow(f.following_id, p.display_name)}
                  className="text-[0.58rem] md:text-[0.68rem] text-[#71717a] bg-transparent border border-[#3f3f46] rounded-md px-1.5 md:px-2 py-0.5 md:py-1 cursor-pointer hover:border-[#ef4444] hover:text-[#f87171] shrink-0"
                >
                  <span className="hidden md:inline">Following</span>
                  <span className="md:hidden">✕</span>
                </button>
              </div>
            )
          })}
        </div>

        {/* ─── Series from followed users ─────────────────── */}
        {feedSeries.length > 0 && (<>
          <h3 className="font-semibold mb-3 text-sm">Series from Followed</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {feedSeries.map((s, i) => (
              <SeriesCard
                key={s.id}
                title={s.title}
                slug={s.slug}
                author={s.profiles?.display_name || 'Unknown'}
                thumbnailUrl={s.thumbnail_url}
                latestChapter={0}
                rating="General"
                format={s.format}
                index={i}
                views={s.total_views}
                likes={s.total_likes}
                favorites={s.total_favorites}
              />
            ))}
          </div>
        </>)}

        {/* ─── Gallery from followed users ────────────────── */}
        {feedGallery.length > 0 && (<>
          <h3 className="font-semibold mb-3 text-sm">Gallery from Followed</h3>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {feedGallery.map((g, i) => (
              <GalleryCard key={g.id} item={g} index={i} />
            ))}
          </div>
        </>)}
      </>)}
    </div>
  )
}
