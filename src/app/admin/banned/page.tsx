'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { ensureFreshSession } from '@/lib/supabase/write'
import { Avatar } from '@/components/Avatar'
import Link from 'next/link'

function timeAgo(d: string) { const m=Math.floor((Date.now()-new Date(d).getTime())/60000); if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';const dy=Math.floor(h/24);if(dy<30)return dy+'d ago';return Math.floor(dy/30)+'mo ago' }

export default function AdminBannedPage() {
  const { show } = useToast()
  const { user, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [bannedUsers, setBannedUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = user?.email === 'nanotooncontact@gmail.com'

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) { setLoading(false); return }
    let c = false
    async function load() {
      const { data } = await anonDb.from('profiles')
        .select('id, display_name, handle, avatar_url, banned_at')
        .eq('is_banned', true)
        .order('banned_at', { ascending: false }) as any
      if (!c) {
        setBannedUsers(data ?? [])
        setLoading(false)
      }
    }
    load().catch(() => { if (!c) setLoading(false) })
    return () => { c = true }
  }, [user, authLoading, isAdmin, anonDb])

  async function unban(userId: string, name: string) {
    if (!confirm(`Unban "${name}"? They'll be able to sign in and post again.`)) return
    await ensureFreshSession()
    const res = await fetch('/api/admin-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unban', userId }),
    })
    const json = await res.json()
    if (!res.ok) { show('Unban failed: ' + (json.error || 'Unknown error')); return }
    setBannedUsers(prev => prev.filter(u => u.id !== userId))
    show(`"${name}" unbanned!`)
  }

  if (authLoading || loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (!isAdmin) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Access denied</div>

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl font-bold text-[#f87171] mb-1">🚫 Banned Users</h1>
      <p className="text-[#71717a] text-sm mb-6">Users suspended for policy violations. Unban to restore access.</p>

      <h3 className="font-semibold mb-3 text-sm">Banned ({bannedUsers.length})</h3>
      {bannedUsers.length === 0 ? (
        <p className="text-[#52525b] text-xs mb-6">No banned users.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {bannedUsers.map(u => (
            <div key={u.id} className="bg-[#18181b] rounded-xl p-3 border border-[#27272a] flex items-center gap-3">
              {u.avatar_url
                ? <img src={u.avatar_url} className="w-10 h-10 rounded-full object-cover shrink-0" />
                : <Avatar name={u.display_name || 'User'} size={40} />}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{u.display_name || 'User'}</div>
                <div className="text-[0.7rem] text-[#71717a]">@{u.handle || 'user'} · Banned {u.banned_at ? timeAgo(u.banned_at) : ''}</div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Link href={`/user/${u.handle}`} className="px-3 py-1.5 border border-[#3f3f46] rounded-lg text-xs text-[#a1a1aa] hover:border-[#a855f7] no-underline">View</Link>
                <button onClick={() => unban(u.id, u.display_name || 'User')} className="px-3 py-1.5 bg-[#7c3aed] text-white rounded-lg text-xs border-none cursor-pointer hover:bg-[#6d28d9]">Unban</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
