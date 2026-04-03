'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago'; return Math.floor(h / 24) + 'd ago'
}

export default function NotificationsPage() {
  const { show } = useToast()
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [notifs, setNotifs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)
    supabase.from('notifications')
      .select('*, actor:profiles(display_name, handle, avatar_url)')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }: any) => {
        clearTimeout(timeout)
        if (!cancelled) { setNotifs(data ?? []); setLoading(false) }
      }).catch(() => { clearTimeout(timeout); if (!cancelled) setLoading(false) })
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [user, authLoading, supabase])

  async function markAllRead() {
    if (!user) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
    show('All marked as read')
  }

  return (
    <div className="max-w-[680px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
          </Link>
          <h1 className="text-xl font-bold text-[#c084fc]">Notifications</h1>
        </div>
        <button onClick={markAllRead} className="text-xs text-[#c084fc] bg-transparent border-none cursor-pointer">Mark all read</button>
      </div>
      {loading ? (
        <p className="text-center py-12 text-[#52525b] text-sm">Loading...</p>
      ) : !user ? (
        <p className="text-center py-12 text-[#71717a]">Sign in to see notifications.</p>
      ) : notifs.length === 0 ? (
        <p className="text-center py-12 text-[#71717a]">No notifications yet.</p>
      ) : (
        <div className="bg-[#18181b] rounded-2xl px-4">
          {notifs.map(n => (
            <div key={n.id} onClick={async () => {
              await supabase.from('notifications').update({ read: true }).eq('id', n.id)
              setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
            }} className="flex items-start gap-2.5 py-3 border-b border-[#27272a] last:border-b-0 cursor-pointer hover:bg-white/[0.02]">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? 'opacity-0' : 'bg-red-600'}`}></div>
              {n.actor?.avatar_url
                ? <img src={n.actor.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                : <Avatar name={n.actor?.display_name || 'Someone'} size={32} />}
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${n.read ? 'text-[#a1a1aa]' : 'text-[#e4e4e7]'}`}>
                  <strong>{n.actor?.display_name || 'Someone'}</strong> {n.message}
                </div>
                <div className="text-[0.7rem] text-[#52525b] mt-0.5">{n.created_at ? timeAgo(n.created_at) : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
