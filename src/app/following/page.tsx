'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { SeriesCard } from '@/components/SeriesCard'
import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { createWriteClient, ensureFreshSession, getAuthUserId } from '@/lib/supabase/write'
import { latestRating } from '@/lib/seriesRating'
import { hydrateSeriesCounts } from '@/lib/hydrateSeriesCounts'
import { TIME_WINDOWS, timeWindowSince, type TimeWindow } from '@/lib/timeWindow'

export default function FollowingPage() {
  const { show } = useToast()
  const { user, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [following, setFollowing] = useState<any[]>([])
  const [feedSeries, setFeedSeries] = useState<any[]>([])
  const [formatFilter, setFormatFilter] = useState('All')
  const [timeFilter, setTimeFilter] = useState<TimeWindow>('All Time')
  const [loading, setLoading] = useState(true)
  // FIX: View More on the Series-from-Followed grid. Caps/steps are mobile-
  // aware: 45 PC max / 27 mobile max, +18 PC / +6 mobile per press (same
  // numbers as home & favorites, even though the grid is 4-per-row here
  // — user asked for these exact values).
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [feedLimit, setFeedLimit] = useState(0)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    setMounted(true)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    if (!mounted) return
    if (feedLimit === 0) { setFeedLimit(isMobile ? 27 : 45); return }

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
          // Fetch series from followed users — limit is mobile-aware and
          // grows via View More.
          const seriesRes = await anonDb.from('series')
            .select('*, profiles!series_author_id_fkey(display_name, handle, avatar_url), chapters(rating, chapter_number)')
            .neq('is_removed', true).in('author_id', followedIds)
            .order('updated_at', { ascending: false })
            .limit(feedLimit) as any

          if (!cancelled) {
            // Hydrate real like/favorite counts from the source-of-truth tables
            // so cards here match the series-page float menu and user profile.
            const hydrated = await hydrateSeriesCounts(anonDb, (seriesRes.data ?? []) as any[])
            if (!cancelled) setFeedSeries(hydrated)
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
  }, [user, authLoading, anonDb, feedLimit, mounted, isMobile])

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
                <Link href={`/user/${p.handle}`} className="flex items-center gap-2 md:gap-2.5 flex-1 min-w-0 no-underline text-inherit">
                  {p.avatar_url
                    ? <img src={p.avatar_url} className="w-7 h-7 md:w-9 md:h-9 rounded-full object-cover" alt={p.display_name} />
                    : <Avatar name={p.display_name} size={36} className="w-7 h-7 md:w-9 md:h-9" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[0.7rem] md:text-sm truncate">{p.display_name}</div>
                    <div className="text-[0.6rem] md:text-[0.7rem] text-[#71717a] truncate">@{p.handle}</div>
                  </div>
                </Link>
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
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-sm mr-1">Series from Followed</h3>
              {['All', 'Series', 'One Shot'].map(f => (
                <button key={f} onClick={() => setFormatFilter(f)}
                  className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border transition-all ${formatFilter === f ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{f}</button>
              ))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {TIME_WINDOWS.map(t => (
                <button key={t} onClick={() => setTimeFilter(t)}
                  className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border whitespace-nowrap transition-all ${timeFilter === t ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {(() => {
              // Feed filter: "what have my follows been working on lately" —
              // so filter by the series' updated_at (when the latest chapter
              // was added / series was edited), same column used as the order
              // in the fetch. 'All Time' keeps the full feed.
              const since = timeWindowSince(timeFilter)
              return feedSeries.filter(s =>
                (formatFilter === 'All' || s.format === formatFilter)
                && (!since || (s.updated_at && s.updated_at >= since))
              )
            })().map((s, i) => (
              <SeriesCard
                key={s.id}
                title={s.title}
                slug={s.slug}
                author={s.profiles?.display_name || 'Unknown'}
                thumbnailUrl={s.thumbnail_url}
                latestChapter={0}
                rating={latestRating(s.chapters)}
                format={s.format}
                index={i}
                views={s.total_views}
                likes={s.total_likes}
                favorites={s.total_favorites}
              />
            ))}
          </div>
          {/* View More — mobile-aware increment (+6 mobile / +18 PC). We show
              it whenever the server returned exactly feedLimit rows, i.e.
              there may be more available. If a filter has narrowed the
              visible list, the grid might still be short, but the button
              stays offered because more rows really do exist on the server. */}
          {feedSeries.length >= feedLimit && (
            <div className="flex justify-center mt-2 mb-8">
              <button onClick={() => { setFeedLimit(l => l + (isMobile ? 6 : 18)); show('Loaded more!') }}
                className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]">View More</button>
            </div>
          )}
        </>)}
      </>)}
    </div>
  )
}
