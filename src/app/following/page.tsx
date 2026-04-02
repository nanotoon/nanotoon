'use client'
import { useState, useEffect, useMemo } from 'react'
import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

export default function FollowingPage() {
  const { show } = useToast()
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [following, setFollowing] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)

    supabase.from('follows')
      .select('*, profiles(id, display_name, handle, avatar_url)')
      .eq('follower_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }: any) => {
        clearTimeout(timeout)
        if (!cancelled) { setFollowing(data ?? []); setLoading(false) }
      })
      .catch(() => { clearTimeout(timeout); if (!cancelled) setLoading(false) })

    return () => { cancelled = true; clearTimeout(timeout) }
  }, [user, authLoading, supabase])

  async function unfollow(targetId: string, name: string) {
    if (!confirm(`Unfollow ${name}?`)) return
    await supabase.from('follows').delete().eq('follower_id', user!.id).eq('following_id', targetId)
    setFollowing(prev => prev.filter(f => f.following_id !== targetId))
    show(`Unfollowed ${name}`)
  }

  return (
    <div className="px-4 md:px-8 py-6">
      <h2 className="text-base font-semibold text-[#c084fc] mb-3.5">People You Follow</h2>
      {loading ? (
        <p className="text-center py-6 text-[#52525b] text-sm">Loading...</p>
      ) : !user ? (
        <p className="text-center py-6 text-[#71717a]">Sign in to see who you follow.</p>
      ) : following.length === 0 ? (
        <p className="text-center py-6 text-[#71717a]">Not following anyone yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2 md:gap-3 mb-4">
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
      )}
    </div>
  )
}
