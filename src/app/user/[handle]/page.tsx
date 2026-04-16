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
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!handleParam) return
    let c = false
    const timeout = setTimeout(() => { if (!c) setLoading(false) }, 6000)
    async function load() {
      try {
        // Look up profile by handle
        const { data: p } = await anonDb.from('profiles').select('*').eq('handle', handleParam).maybeSingle() as { data: any }
        if (c) return
        if (!p) { setNotFound(true); setLoading(false); clearTimeout(timeout); return }
        setProfile(p)

        const [s, fr, fg] = await Promise.all([
          anonDb.from('series').select('*').eq('author_id', p.id).neq('is_removed', true).order('created_at', { ascending: false }),
          anonDb.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', p.id),
          anonDb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', p.id),
        ]) as any[]
        if (!c) {
          setTheirSeries(s.data ?? [])
          setFollowerCount(fr.count ?? 0)
          setFollowingCount(fg.count ?? 0)
        }

        // Check if current user follows this profile
        if (user && user.id !== p.id) {
          const { data: f } = await anonDb.from('follows').select('*').eq('follower_id', user.id).eq('following_id', p.id).maybeSingle() as { data: any }
          if (!c) setIsFollowing(!!f)
        }

        clearTimeout(timeout)
        if (!c) setLoading(false)
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

  if (loading || authLoading) return <div className="min-h-screen"><LoadingSpinner /></div>
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
  const tv = theirSeries.reduce((a, s) => a + (s.total_views ?? 0), 0)
  const tl = theirSeries.reduce((a, s) => a + (s.total_likes ?? 0), 0)
  const tf = theirSeries.reduce((a, s) => a + (s.total_favorites ?? 0), 0)

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
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
        </div>
      </div>
      {profile.bio && <div className="bg-[#18181b] rounded-2xl p-4 mb-5"><h3 className="font-semibold mb-2 text-sm">About</h3><p className="text-[#d4d4d8] text-sm">{profile.bio}</p>{profile.links && <p className="text-[#c084fc] mt-2 text-xs">{profile.links}</p>}</div>}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[[fmtNum(tv),'Total Views'],[fmtNum(tl),'Total Likes'],[fmtNum(tf),'Total Favorites']].map(([n,l]) => (
          <div key={l} className="bg-[#18181b] rounded-2xl p-4 text-center"><div className="text-xl font-bold text-[#c084fc]">{n}</div><div className="text-[#71717a] text-xs mt-0.5">{l}</div></div>
        ))}
      </div>

      {/* ─── Their Series ─────────────────────────────────── */}
      <h3 className="font-semibold mb-3 text-sm">Series</h3>
      {theirSeries.length === 0 ? (
        <p className="text-[#71717a] text-sm mb-8">No series yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {theirSeries.map((s, i) => (
            <SeriesCard key={s.id} title={s.title} slug={s.slug} author={dn} thumbnailUrl={s.thumbnail_url} latestChapter={0} rating="General" format={s.format} index={i} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />
          ))}
        </div>
      )}

      {showShare && <ShareModal title={`@${h} on NANOTOON`} url={`${typeof window !== 'undefined' ? window.location.origin : ''}/user/${h}`} onClose={() => setShowShare(false)} />}
    </div>
  )
}
