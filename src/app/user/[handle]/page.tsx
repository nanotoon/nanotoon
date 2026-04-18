'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { SeriesCard } from '@/components/SeriesCard'
import { Avatar } from '@/components/Avatar'
import { ShareModal } from '@/components/ShareModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { createWriteClient, getAuthUserId, ensureFreshSession } from '@/lib/supabase/write'
import { latestRating } from '@/lib/seriesRating'
import { TIME_WINDOWS, timeWindowSince, type TimeWindow } from '@/lib/timeWindow'
import { readProfileLinks, normalizeUrl } from '@/lib/profileLinks'
import Link from 'next/link'

function fmtNum(n: number) { if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString() }

export default function PublicProfilePage() {
  const params = useParams()
  const handleParam = params.handle as string
  const { show } = useToast()
  const { user, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [showShare, setShowShare] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [theirSeries, setTheirSeries] = useState<any[]>([])
  const [formatFilter, setFormatFilter] = useState('All')
  const [timeFilter, setTimeFilter] = useState<TimeWindow>('All Time')
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // FIX: Real totals come from the likes/favorites/views tables directly.
  // The denormalized series.total_likes / series.total_favorites columns are
  // only writable by the series author or the admin under RLS, so for everyone
  // else they go stale — which is why the profile page was showing wrong
  // numbers. We now derive totals from the source-of-truth tables (and from
  // series.total_views, which IS kept fresh via the new /api/views endpoint).
  const [realTotalLikes, setRealTotalLikes] = useState(0)
  const [realTotalFavorites, setRealTotalFavorites] = useState(0)

  useEffect(() => {
    if (!handleParam) return
    let c = false
    // FIX: don't block on authLoading. The page itself is a public profile; we
    // only need `user` to decide whether to show a "Following" toggle. So we
    // kick off the load immediately and only do the follow-check piece once
    // auth settles. Previously the render was gated on `authLoading || loading`
    // together, which meant a slow auth init could leave the page spinning
    // forever even though the public data was already fetched.
    const timeout = setTimeout(() => { if (!c) setLoading(false) }, 8000)
    async function load() {
      try {
        // Look up profile by handle
        const { data: p } = await anonDb.from('profiles').select('*').eq('handle', handleParam).maybeSingle() as { data: any }
        if (c) return
        if (!p) { setNotFound(true); setLoading(false); clearTimeout(timeout); return }
        setProfile(p)

        const [s, fr, fg] = await Promise.all([
          anonDb.from('series').select('*, chapters(rating, chapter_number)').eq('author_id', p.id).neq('is_removed', true).order('created_at', { ascending: false }),
          anonDb.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', p.id),
          anonDb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', p.id),
        ]) as any[]
        if (c) return
        const seriesList = s.data ?? []
        setTheirSeries(seriesList)
        setFollowerCount(fr.count ?? 0)
        setFollowingCount(fg.count ?? 0)

        // FIX: Let the page become interactive as soon as the series list is
        // known. Everything below (accurate like/fav counts, follow state) is
        // additive and shouldn't keep the spinner up.
        clearTimeout(timeout)
        setLoading(false)

        // Compute REAL totals from the likes/favorites tables. This is what
        // profile users actually expect to see.
        // FIX: Previously only the aggregate totals used real counts, but the
        // per-series SeriesCard below still received s.total_likes /
        // s.total_favorites from the stale denormalized series columns — which
        // only reflect admin + author likes under current RLS. So the tiles kept
        // reading "2" even though the aggregate read the correct "3". We now
        // pull the raw rows, bucket them per series_id, and hydrate each series
        // with its true count so the cards and the aggregate both match the
        // series-page float menu.
        const seriesIds = seriesList.map((x: any) => x.id)
        if (seriesIds.length > 0) {
          const [likesRows, favsRows] = await Promise.all([
            anonDb.from('likes').select('series_id').in('series_id', seriesIds),
            anonDb.from('favorites').select('series_id').in('series_id', seriesIds),
          ]) as any[]
          const likeCounts = new Map<string, number>()
          const favCounts = new Map<string, number>()
          for (const r of (likesRows.data ?? []) as any[]) likeCounts.set(r.series_id, (likeCounts.get(r.series_id) ?? 0) + 1)
          for (const r of (favsRows.data ?? []) as any[]) favCounts.set(r.series_id, (favCounts.get(r.series_id) ?? 0) + 1)
          const hydrated = seriesList.map((s: any) => ({
            ...s,
            total_likes: likeCounts.get(s.id) ?? 0,
            total_favorites: favCounts.get(s.id) ?? 0,
          }))
          let sumL = 0, sumF = 0
          for (const v of likeCounts.values()) sumL += v
          for (const v of favCounts.values()) sumF += v
          if (!c) {
            setTheirSeries(hydrated)
            setRealTotalLikes(sumL)
            setRealTotalFavorites(sumF)
          }
        } else {
          if (!c) { setRealTotalLikes(0); setRealTotalFavorites(0) }
        }

        // Check if current user follows this profile (only once auth is ready)
        if (user && user.id !== p.id) {
          const { data: f } = await anonDb.from('follows').select('*').eq('follower_id', user.id).eq('following_id', p.id).maybeSingle() as { data: any }
          if (!c) setIsFollowing(!!f)
        }
      } catch {
        clearTimeout(timeout)
        if (!c) setLoading(false)
      }
    }
    load()
    return () => { c = true; clearTimeout(timeout) }
  }, [handleParam, user, anonDb])

  async function toggleFollow() {
    await ensureFreshSession()
    if (!user) { show('Sign in to follow!'); return }
    if (!profile) return
    const uid = getAuthUserId()
    const wc = createWriteClient()
    if (!uid || !wc) { show('Sign in to follow!'); return }
    if (uid === profile.id) { show("Can't follow yourself"); return }
    if (isFollowing) {
      const { error } = await (wc as any).from('follows').delete().eq('follower_id', uid).eq('following_id', profile.id)
      if (error) { show('Error: ' + error.message); return }
      setIsFollowing(false)
      setFollowerCount(c => Math.max(0, c - 1))
      show('Unfollowed')
    } else {
      const { error } = await (wc as any).from('follows').insert({ follower_id: uid, following_id: profile.id })
      if (error) { show('Error: ' + error.message); return }
      setIsFollowing(true)
      setFollowerCount(c => c + 1)
      // Notify the user who was just followed
      ;(wc as any).from('notifications').insert({
        user_id: profile.id, actor_id: uid, type: 'follow',
        message: 'started following you',
      }).then(() => {}, () => {})
      show('Following!')
    }
  }

  // Admin-only: ban this user. Mirrors the adminRemove flow on the series page.
  async function banUser() {
    if (!profile) return
    if (!confirm(`Ban "${profile.display_name || 'this user'}" for policy violations? They will be signed out and notified.`)) return
    if (!confirm('Are you sure? You can always unban them later from /admin/banned.')) return
    await ensureFreshSession()
    const res = await fetch('/api/admin-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ban', userId: profile.id }),
    })
    const json = await res.json()
    if (!res.ok) { show('Ban failed: ' + (json.error || 'Unknown error')); return }
    setProfile((p: any) => p ? { ...p, is_banned: true, banned_at: new Date().toISOString() } : p)
    show('User banned. They will be signed out on their next action.')
  }

  // FIX: Don't gate render on authLoading — public profile doesn't need auth
  // to be readable, and a slow auth init was keeping the spinner up forever.
  if (loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (notFound) return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <p className="text-center py-20 text-[#71717a]">User @{handleParam} not found.</p>
    </div>
  )
  if (!profile) return null

  const dn = profile.display_name || 'User'
  const h = profile.handle || 'user'
  const isSelf = !!user && user.id === profile.id
  // Admin can ban any user other than themselves. Same email check used
  // elsewhere (admin/trash, adminRemove on series page).
  const isAdmin = user?.email === 'nanotooncontact@gmail.com' && !isSelf
  const isBanned = !!profile.is_banned
  // FIX: total_views comes from series (now kept fresh by /api/views for
  // everyone), but total_likes/total_favorites come from direct counts of the
  // likes/favorites tables — NOT from the stale series.total_likes /
  // series.total_favorites columns, which only update for the admin under RLS.
  const tv = theirSeries.reduce((a, s) => a + (s.total_views ?? 0), 0)
  const tl = realTotalLikes
  const tf = realTotalFavorites

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      {isBanned && (
        <div className="mb-4 bg-red-500/5 border border-red-500/20 rounded-2xl p-3 flex items-center gap-2">
          <span className="text-base">🚫</span>
          <span className="text-[#f87171] text-xs">This account has been suspended for policy violations.</span>
        </div>
      )}
      <div className="flex items-center gap-3.5 mb-5 flex-wrap">
        <div className="relative shrink-0">
          <div className="w-[68px] h-[68px] rounded-full border-[3px] border-[#a855f7] overflow-hidden">
            {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <Avatar name={dn} size={68} className="w-full h-full" />}
          </div>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{dn}</h2>
          <p className="text-[#71717a] text-sm">@{h}</p>
          <div className="flex gap-3.5 mt-2 text-sm">
            <span><span className="font-semibold">{followingCount}</span> <span className="text-[#71717a]">Following</span></span>
            <span><span className="font-semibold">{followerCount}</span> <span className="text-[#71717a]">Followers</span></span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {!isSelf && (
            <button onClick={toggleFollow} className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${isFollowing ? 'border-purple-500/40 text-[#c084fc] bg-purple-500/10' : 'bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-[#6d28d9]'}`}>
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
          <button onClick={() => setShowShare(true)} className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] cursor-pointer text-xs flex items-center gap-1 hover:border-[#a855f7]">Share Profile</button>
          {isAdmin && !isBanned && (
            <button onClick={banUser} className="px-3 py-1.5 border border-red-500/30 rounded-lg bg-transparent text-[#f87171] cursor-pointer text-xs hover:bg-red-500/10">Ban User</button>
          )}
        </div>
      </div>
      {(() => {
        // About + links card. Kept together because the old layout had them
        // in one box; now we conditionally show each half depending on what
        // the profile actually has.
        const linkItems = readProfileLinks(profile)
        const hasBio = !!profile.bio
        const hasLinks = linkItems.length > 0
        if (!hasBio && !hasLinks) return null
        return (
          <div className="bg-[#18181b] rounded-2xl p-4 mb-5">
            {hasBio && <>
              <h3 className="font-semibold mb-2 text-sm">About</h3>
              <p className="text-[#d4d4d8] text-sm">{profile.bio}</p>
            </>}
            {hasLinks && (
              <div className={hasBio ? 'mt-3' : ''}>
                {linkItems.map((l, i) => (
                  <a key={i} href={normalizeUrl(l.url)} target="_blank" rel="noopener noreferrer"
                     className="text-[#c084fc] text-xs block truncate hover:text-[#a855f7] no-underline">
                    {l.title || l.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })()}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[[fmtNum(tv),'Total Views'],[fmtNum(tl),'Total Likes'],[fmtNum(tf),'Total Favorites']].map(([n,l]) => (
          <div key={l} className="bg-[#18181b] rounded-2xl p-4 text-center"><div className="text-xl font-bold text-[#c084fc]">{n}</div><div className="text-[#71717a] text-xs mt-0.5">{l}</div></div>
        ))}
      </div>

      {/* ─── Their Series ─────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h3 className="font-semibold text-sm mr-1">Series</h3>
          {theirSeries.length > 0 && ['All', 'Series', 'One Shot'].map(f => (
            <button key={f} onClick={() => setFormatFilter(f)}
              className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border transition-all ${formatFilter === f ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{f}</button>
          ))}
        </div>
        {theirSeries.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {TIME_WINDOWS.map(t => (
              <button key={t} onClick={() => setTimeFilter(t)}
                className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border whitespace-nowrap transition-all ${timeFilter === t ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{t}</button>
            ))}
          </div>
        )}
      </div>
      {theirSeries.length === 0 ? (
        <p className="text-[#71717a] text-sm mb-8">No series yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {(() => {
            // "Recency" filter for a creator's series list — which of their
            // works was most recently active (uploaded or updated). Uses
            // series.updated_at, same column as the rest of the app.
            const since = timeWindowSince(timeFilter)
            return theirSeries.filter(s =>
              (formatFilter === 'All' || s.format === formatFilter)
              && (!since || (s.updated_at && s.updated_at >= since))
            )
          })().map((s, i) => (
            <SeriesCard key={s.id} title={s.title} slug={s.slug} author={dn} thumbnailUrl={s.thumbnail_url} latestChapter={0} rating={latestRating(s.chapters)} format={s.format} index={i} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />
          ))}
        </div>
      )}

      {showShare && <ShareModal title={`@${h} on NANOTOON`} url={`${typeof window !== 'undefined' ? window.location.origin : ''}/user/${h}`} onClose={() => setShowShare(false)} />}
    </div>
  )
}
