'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'

export default function FollowersPage() {
  const { user } = useAuth()
  const supabase = useMemo(() => createAnonClient(), [])
  const [followers, setFollowers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    let c = false
    async function load() {
      try {
        const { data } = await supabase.from('follows').select('*, profiles!follows_follower_id_fkey(id, display_name, handle, avatar_url)')
          .eq('following_id', user!.id).order('created_at', { ascending: false }) as { data: any[] | null }
        if (!c) { setFollowers(data ?? []); setLoading(false) }
      } catch { if (!c) setLoading(false) }
    }
    load()
    return () => { c = true }
  }, [user, supabase])

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl font-bold text-[#c084fc] mb-4">Followers</h1>
      {loading ? <p className="text-center py-6 text-[#52525b] text-sm">Loading...</p> : followers.length === 0 ? (
        <p className="text-center py-6 text-[#71717a]">No followers yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {followers.map(f => { const p = f.profiles; if (!p) return null; return (
            <div key={f.follower_id} className="bg-[#18181b] rounded-2xl p-3 flex items-center gap-2.5 border border-[#27272a]">
              {p.avatar_url ? <img src={p.avatar_url} className="w-9 h-9 rounded-full object-cover" /> : <Avatar name={p.display_name} size={36} />}
              <div className="flex-1 min-w-0"><div className="font-medium text-sm">{p.display_name}</div><div className="text-[0.7rem] text-[#71717a]">@{p.handle}</div></div>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
