'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useRef, useMemo } from 'react'
import { SeriesCard } from '@/components/SeriesCard'
import { Avatar } from '@/components/Avatar'
import { ShareModal } from '@/components/ShareModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { ensureFreshSession, createWriteClient } from '@/lib/supabase/write'
import { latestRating } from '@/lib/seriesRating'
import { readProfileLinks, normalizeUrl } from '@/lib/profileLinks'
import Link from 'next/link'

function fmtNum(n: number) { if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString() }

export default function ProfilePage() {
  const { show } = useToast()
  const { user, profile, refreshProfile, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [showShare, setShowShare] = useState(false)
  const [mySeries, setMySeries] = useState<any[]>([])
  const [formatFilter, setFormatFilter] = useState('All')
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  // FIX: see user/[handle]/page.tsx — counts are read from the real
  // likes/favorites tables, not the stale denormalized columns on series,
  // because RLS prevents those columns from being updated for anyone who
  // isn't the admin.
  const [realTotalLikes, setRealTotalLikes] = useState(0)
  const [realTotalFavorites, setRealTotalFavorites] = useState(0)
  const pfpRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    const timeout = setTimeout(() => { if (!c) setLoading(false) }, 4000)
    let c = false
    Promise.all([
      anonDb.from('series').select('*, chapters(rating, chapter_number)').eq('author_id', user.id).neq('is_removed', true).order('created_at', { ascending: false }),
      anonDb.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
      anonDb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
    ]).then(async ([s, fr, fg]: any) => {
      if (c) return
      const seriesList = s.data ?? []
      setMySeries(seriesList)
      setFollowerCount(fr.count ?? 0)
      setFollowingCount(fg.count ?? 0)
      setLoading(false)

      // FIX: count likes/favorites from source-of-truth tables so the totals
      // reflect actual engagement even when series.total_likes/total_favorites
      // are stale (they only update for the admin under current RLS). Hydrate
      // each series with its per-series count so the SeriesCard tiles below
      // match the aggregate — same source the series-page float menu uses.
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
          setMySeries(hydrated)
          setRealTotalLikes(sumL)
          setRealTotalFavorites(sumF)
        }
      }
    }).catch(() => { if (!c) setLoading(false) })
    return () => { c = true; clearTimeout(timeout) }
  }, [user, anonDb, authLoading]) // FIX: was [user, supabase]

  async function handlePfp(e: React.ChangeEvent<HTMLInputElement>) {
    await ensureFreshSession()
    const f = e.target.files?.[0]; if (!f || !user) return
    const ext = f.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('path', path)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.error) { show('Upload failed: ' + (json.error || 'Unknown error')); return }
      await (createWriteClient() as any).from('profiles').update({ avatar_url: json.url }).eq('id', user.id)
      await refreshProfile(); show('Profile picture updated!'); setTimeout(() => window.location.reload(), 600)
    } catch (err: any) { show('Upload failed: ' + (err?.message || 'Unknown error')) }
  }

  async function delSeries(id: string) {
    await ensureFreshSession()
    if (!confirm('Delete this series?')) return
    // FIX: added error handling — was silently failing without surfacing the error
    const { error } = await (createWriteClient() as any).from('series').delete().eq('id', id)
    if (error) { show('Failed to delete: ' + error.message); return }
    setMySeries(prev => prev.filter(s => s.id !== id))
    show('Series deleted')
  }

  const dn = profile?.display_name || 'User'; const h = profile?.handle || 'user'
  // FIX: total_views comes from series.total_views (kept fresh by /api/views).
  // total_likes/total_favorites come from source-of-truth tables, not stale
  // denormalized columns. See detailed note near the useState above.
  const tv = mySeries.reduce((a, s) => a + (s.total_views ?? 0), 0)
  const tl = realTotalLikes
  const tf = realTotalFavorites

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <div className="flex items-center gap-3.5 mb-5 flex-wrap">
        <div className="relative shrink-0">
          <div className="w-[68px] h-[68px] rounded-full border-[3px] border-[#a855f7] overflow-hidden">
            {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <Avatar name={dn} size={68} className="w-full h-full" />}
          </div>
          <button onClick={() => pfpRef.current?.click()} className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[#7c3aed] border-2 border-[#09090b] rounded-full flex items-center justify-center cursor-pointer">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <input ref={pfpRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={handlePfp} />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{dn}</h2>
          <p className="text-[#71717a] text-sm">@{h}</p>
          <div className="flex gap-3.5 mt-2 text-sm">
            <Link href="/following" className="no-underline text-inherit"><span className="font-semibold">{followingCount}</span> <span className="text-[#71717a]">Following</span></Link>
            <Link href="/followers" className="no-underline text-inherit"><span className="font-semibold">{followerCount}</span> <span className="text-[#71717a]">Followers</span></Link>
          </div>
        </div>
        <button onClick={() => setShowShare(true)} className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] cursor-pointer text-xs flex items-center gap-1 shrink-0 hover:border-[#a855f7]">Share Profile</button>
      </div>
      {(() => {
        // About + links card. Same layout as /user/[handle]. Shows if
        // either bio OR links exist — a profile with only links but no
        // bio still gets a visible, clickable links block.
        const linkItems = readProfileLinks(profile)
        const hasBio = !!profile?.bio
        const hasLinks = linkItems.length > 0
        if (!hasBio && !hasLinks) return null
        return (
          <div className="bg-[#18181b] rounded-2xl p-4 mb-5">
            {hasBio && <>
              <h3 className="font-semibold mb-2 text-sm">About Me</h3>
              <p className="text-[#d4d4d8] text-sm">{profile!.bio}</p>
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

      {/* ─── My Series ─────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <h3 className="font-semibold text-sm mr-1">My Series</h3>
        {mySeries.length > 0 && ['All', 'Series', 'One Shot'].map(f => (
          <button key={f} onClick={() => setFormatFilter(f)}
            className={`px-3 py-1 rounded-full text-[0.73rem] cursor-pointer border transition-all ${formatFilter === f ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7] hover:text-[#c084fc]'}`}>{f}</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : mySeries.length === 0 ? (
        <p className="text-[#71717a] text-sm mb-8">No series yet. Upload your first one!</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {mySeries.filter(s => formatFilter === 'All' || s.format === formatFilter).map((s, i) => (
            <div key={s.id}>
              <SeriesCard title={s.title} slug={s.slug} author={dn} thumbnailUrl={s.thumbnail_url} latestChapter={0} rating={latestRating(s.chapters)} format={s.format} index={i} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />
              <div className="flex gap-1.5 mt-1.5">
                <Link href={`/series/${s.slug}/edit`} className="flex-1 py-1 bg-[#27272a] border border-[#3f3f46] rounded-lg text-[0.7rem] text-[#c084fc] text-center hover:border-[#a855f7] no-underline">Edit</Link>
                <button onClick={() => delSeries(s.id)} className="flex-1 py-1 bg-[#27272a] border border-[#3f3f46] rounded-lg text-[0.7rem] text-[#f87171] hover:border-[#ef4444] cursor-pointer">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showShare && <ShareModal title={`@${h} on NANOTOON`} url={`${typeof window !== 'undefined' ? window.location.origin : ''}/profile`} onClose={() => setShowShare(false)} />}
    </div>
  )
}
