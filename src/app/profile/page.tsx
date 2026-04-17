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
import Link from 'next/link'

function fmtNum(n: number) { if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString() }

export default function ProfilePage() {
  const { show } = useToast()
  const { user, profile, refreshProfile, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [showShare, setShowShare] = useState(false)
  const [mySeries, setMySeries] = useState<any[]>([])
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const pfpRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    const timeout = setTimeout(() => { if (!c) setLoading(false) }, 4000)
    let c = false
    Promise.all([
      anonDb.from('series').select('*').eq('author_id', user.id).neq('is_removed', true).order('created_at', { ascending: false }),
      anonDb.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
      anonDb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
    ]).then(([s, fr, fg]: any) => {
      if (!c) {
        setMySeries(s.data ?? [])
        setFollowerCount(fr.count ?? 0)
        setFollowingCount(fg.count ?? 0)
        setLoading(false)
      }
    }).catch(() => { if (!c) setLoading(false) })
    return () => { c = true; clearTimeout(timeout) }
  }, [user, anonDb]) // FIX: was [user, supabase]

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
  const tv = mySeries.reduce((a, s) => a + (s.total_views ?? 0), 0)
  const tl = mySeries.reduce((a, s) => a + (s.total_likes ?? 0), 0)
  const tf = mySeries.reduce((a, s) => a + (s.total_favorites ?? 0), 0)

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
      {profile?.bio && <div className="bg-[#18181b] rounded-2xl p-4 mb-5"><h3 className="font-semibold mb-2 text-sm">About Me</h3><p className="text-[#d4d4d8] text-sm">{profile.bio}</p>{profile.links && <p className="text-[#c084fc] mt-2 text-xs">{profile.links}</p>}</div>}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[[fmtNum(tv),'Total Views'],[fmtNum(tl),'Total Likes'],[fmtNum(tf),'Total Favorites']].map(([n,l]) => (
          <div key={l} className="bg-[#18181b] rounded-2xl p-4 text-center"><div className="text-xl font-bold text-[#c084fc]">{n}</div><div className="text-[#71717a] text-xs mt-0.5">{l}</div></div>
        ))}
      </div>

      {/* ─── My Series ─────────────────────────────────────── */}
      <h3 className="font-semibold mb-3 text-sm">My Series</h3>
      {loading ? <LoadingSpinner /> : mySeries.length === 0 ? (
        <p className="text-[#71717a] text-sm mb-8">No series yet. Upload your first one!</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {mySeries.map((s, i) => (
            <div key={s.id}>
              <SeriesCard title={s.title} slug={s.slug} author={dn} thumbnailUrl={s.thumbnail_url} latestChapter={0} rating="General" format={s.format} index={i} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />
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
