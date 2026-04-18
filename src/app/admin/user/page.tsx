'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { ensureFreshSession } from '@/lib/supabase/write'
import { Avatar } from '@/components/Avatar'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// Admin user-deletion limbo page.
//
// Shows profiles whose owner pressed "Delete Account" in settings and are
// currently inside the 30-day recovery window. Admin can ONLY recover from
// here — there is no manual delete button. The reason (per spec): if the
// admin account gets hacked, an attacker can't accelerate the deletion.
// After 30 days a scheduled purge (opportunistically triggered on this page
// load via POST /api/account-delete {action:"purge"}) removes them.
// ─────────────────────────────────────────────────────────────────────────────

const GRACE_DAYS = 30

function daysLeft(startIso: string | null | undefined): number {
  if (!startIso) return GRACE_DAYS
  const elapsedDays = Math.floor((Date.now() - new Date(startIso).getTime()) / (24 * 60 * 60 * 1000))
  return Math.max(0, GRACE_DAYS - elapsedDays)
}

function countdownLabel(startIso: string | null | undefined): string {
  if (!startIso) return `${GRACE_DAYS}d left`
  const ms = new Date(startIso).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000 - Date.now()
  if (ms <= 0) return 'purging…'
  const d = Math.floor(ms / (24 * 60 * 60 * 1000))
  const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  if (d > 0) return `${d}d ${h}h left`
  const m = Math.floor((ms % (60 * 60 * 1000)) / 60_000)
  return `${h}h ${m}m left`
}

export default function AdminUserPage() {
  const { show } = useToast()
  const { user, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [pendingUsers, setPendingUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // Tick every minute so the countdown labels refresh without a reload.
  const [, setTick] = useState(0)

  const isAdmin = user?.email === 'nanotooncontact@gmail.com'

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) { setLoading(false); return }
    let c = false
    async function load() {
      // Opportunistically purge expired rows while we're here. The purge
      // endpoint is admin-gated on the server side. Fire-and-forget — we
      // don't need to block rendering on it, and if it fails it can
      // simply run on a later visit.
      try {
        await ensureFreshSession()
        fetch('/api/account-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'purge' }),
        }).catch(() => {})
      } catch {}

      const { data } = await anonDb.from('profiles')
        .select('id, display_name, handle, avatar_url, deletion_scheduled_at')
        .eq('deletion_status', 'pending')
        .order('deletion_scheduled_at', { ascending: true }) as any
      if (!c) {
        setPendingUsers(data ?? [])
        setLoading(false)
      }
    }
    load().catch(() => { if (!c) setLoading(false) })

    // Countdown ticker — re-render every minute so the labels update.
    const iv = setInterval(() => setTick(t => t + 1), 60_000)
    return () => { c = true; clearInterval(iv) }
  }, [user, authLoading, isAdmin, anonDb])

  async function recover(userId: string, name: string) {
    if (!confirm(`Recover account "${name}"? Their profile and series become visible again.`)) return
    await ensureFreshSession()
    const res = await fetch('/api/account-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'recover', userId }),
    })
    const json = await res.json()
    if (!res.ok) { show('Recover failed: ' + (json.error || 'Unknown error')); return }
    setPendingUsers(prev => prev.filter(u => u.id !== userId))
    show(`"${name}" recovered!`)
  }

  if (authLoading || loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (!isAdmin) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Access denied</div>

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl font-bold text-[#f87171] mb-1">⏳ Pending Account Deletions</h1>
      <p className="text-[#71717a] text-sm mb-1">
        Accounts users asked to delete. Recovery is the only available action here — manual deletion is disabled on purpose (hack-abuse protection).
      </p>
      <p className="text-[#52525b] text-xs mb-6">After {GRACE_DAYS} days in this list the account and all its series are permanently removed.</p>

      <h3 className="font-semibold mb-3 text-sm">Pending ({pendingUsers.length})</h3>
      {pendingUsers.length === 0 ? (
        <p className="text-[#52525b] text-xs mb-6">No accounts pending deletion.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {pendingUsers.map(u => {
            const left = daysLeft(u.deletion_scheduled_at)
            // Colour the countdown pill by urgency so anything near the end
            // stands out. Matches the trash page style.
            const urgent = left <= 3
            const warn = left <= 7 && !urgent
            const pillClass = urgent
              ? 'bg-red-500/10 border-red-500/30 text-[#f87171]'
              : warn
                ? 'bg-amber-500/10 border-amber-500/30 text-[#fbbf24]'
                : 'bg-[#27272a] border-[#3f3f46] text-[#a1a1aa]'
            return (
              <div key={u.id} className="bg-[#18181b] rounded-xl p-3 border border-[#27272a] flex items-center gap-3">
                {u.avatar_url
                  ? <img src={u.avatar_url} className="w-10 h-10 rounded-full object-cover shrink-0" />
                  : <Avatar name={u.display_name || 'User'} size={40} />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{u.display_name || 'User'}</div>
                  <div className="text-[0.7rem] text-[#71717a] truncate">@{u.handle || 'user'}</div>
                </div>
                <span className={`shrink-0 text-[0.65rem] md:text-[0.7rem] px-2 py-0.5 rounded-full border ${pillClass}`}>
                  {countdownLabel(u.deletion_scheduled_at)}
                </span>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => recover(u.id, u.display_name || 'User')}
                    className="px-3 py-1.5 bg-[#7c3aed] text-white rounded-lg text-xs border-none cursor-pointer hover:bg-[#6d28d9]">
                    Recover
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
