'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { ensureFreshSession } from '@/lib/supabase/write'
import Link from 'next/link'

function timeAgo(d: string) { const m=Math.floor((Date.now()-new Date(d).getTime())/60000); if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';const dy=Math.floor(h/24);if(dy<30)return dy+'d ago';return Math.floor(dy/30)+'mo ago' }

// ─────────────────────────────────────────────────────────────────────────────
// Trash page — two sections now:
//
//   1) Removed series (normal soft-delete) — the original list. Admin can
//      Restore or Delete Forever. "Delete Forever" no longer hard-deletes;
//      it moves the row into limbo (below).
//
//   2) Scheduled for permanent deletion (limbo) — series whose
//      permanent_delete_scheduled_at is set. During this 30-day window the
//      item is hidden from absolutely everyone including admin outside
//      this page, AND the thumbnail is hidden here too so admin can't
//      preview it (per spec, reduces liability for content the admin
//      flagged as policy-violating). Only action is Recover.
//
// 48-hour reset rule: if admin hits Delete Forever on a series that was
// recovered more than 48h ago, the countdown restarts at 30 days. If it
// was recovered within the last 48h, the countdown continues from the
// original schedule. This is enforced server-side in /api/admin-remove.
// ─────────────────────────────────────────────────────────────────────────────

const GRACE_DAYS = 30

function countdownLabel(scheduledIso: string | null | undefined): string {
  if (!scheduledIso) return ''
  const ms = new Date(scheduledIso).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000 - Date.now()
  if (ms <= 0) return 'purging…'
  const d = Math.floor(ms / (24 * 60 * 60 * 1000))
  const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  if (d > 0) return `${d}d ${h}h left`
  const m = Math.floor((ms % (60 * 60 * 1000)) / 60_000)
  return `${h}h ${m}m left`
}

export default function AdminTrashPage() {
  const { show } = useToast()
  const { user, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [removedSeries, setRemovedSeries] = useState<any[]>([])
  const [limboSeries, setLimboSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)

  const isAdmin = user?.email === 'nanotooncontact@gmail.com'

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) { setLoading(false); return }
    let c = false
    async function load() {
      // Opportunistic purge (same pattern as /admin/user).
      try {
        await ensureFreshSession()
        fetch('/api/account-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'purge' }),
        }).catch(() => {})
      } catch {}

      const [r1, r2] = await Promise.all([
        // Normal removed (not in limbo)
        anonDb.from('series').select('*, profiles!series_author_id_fkey(display_name, handle)')
          .eq('is_removed', true)
          .is('permanent_delete_scheduled_at', null)
          .order('removed_at', { ascending: false }),
        // In limbo (scheduled for permanent deletion)
        anonDb.from('series').select('*, profiles!series_author_id_fkey(display_name, handle)')
          .not('permanent_delete_scheduled_at', 'is', null)
          .order('permanent_delete_scheduled_at', { ascending: true }),
      ]) as any[]
      if (!c) {
        setRemovedSeries(r1.data ?? [])
        setLimboSeries(r2.data ?? [])
        setLoading(false)
      }
    }
    load().catch(() => { if (!c) setLoading(false) })

    const iv = setInterval(() => setTick(t => t + 1), 60_000)
    return () => { c = true; clearInterval(iv) }
  }, [user, authLoading, isAdmin, anonDb])

  async function restore(id: string, title: string) {
    if (!confirm(`Restore "${title}"?`)) return
    await ensureFreshSession()
    const res = await fetch('/api/admin-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', contentType: 'Series', contentId: id }),
    })
    const json = await res.json()
    if (!res.ok) { show('Restore failed: ' + (json.error || 'Unknown error')); return }
    setRemovedSeries(prev => prev.filter(s => s.id !== id))
    show(`"${title}" restored!`)
  }

  async function scheduleDelete(id: string, title: string) {
    if (!confirm(`Schedule "${title}" for permanent deletion? It will be fully hidden for ${GRACE_DAYS} days, then purged. You can recover during that window.`)) return
    await ensureFreshSession()
    const res = await fetch('/api/admin-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'permanent-delete', contentType: 'Series', contentId: id }),
    })
    const json = await res.json()
    if (!res.ok) { show('Schedule failed: ' + (json.error || 'Unknown error')); return }
    // Move item from the normal list to the limbo list, using the scheduledAt
    // the server returned so the countdown is accurate even under the
    // 48-hour reset rule.
    const moved = removedSeries.find(s => s.id === id)
    if (moved) {
      const updated = { ...moved, permanent_delete_scheduled_at: json.scheduledAt }
      setRemovedSeries(prev => prev.filter(s => s.id !== id))
      setLimboSeries(prev => [updated, ...prev].sort((a, b) =>
        (a.permanent_delete_scheduled_at || '').localeCompare(b.permanent_delete_scheduled_at || '')))
    }
    show(`"${title}" scheduled for deletion`)
  }

  async function recoverFromLimbo(id: string, title: string) {
    if (!confirm(`Recover "${title}" from permanent-deletion limbo? It'll return to the removed-series list above (still not publicly visible).`)) return
    await ensureFreshSession()
    const res = await fetch('/api/admin-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'recover-from-permanent', contentType: 'Series', contentId: id }),
    })
    const json = await res.json()
    if (!res.ok) { show('Recover failed: ' + (json.error || 'Unknown error')); return }
    const moved = limboSeries.find(s => s.id === id)
    if (moved) {
      const cleared = { ...moved, permanent_delete_scheduled_at: null }
      setLimboSeries(prev => prev.filter(s => s.id !== id))
      setRemovedSeries(prev => [cleared, ...prev])
    }
    show(`"${title}" recovered from limbo`)
  }

  if (authLoading || loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (!isAdmin) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Access denied</div>

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl font-bold text-[#f87171] mb-1">🗑️ Removed Content</h1>
      <p className="text-[#71717a] text-sm mb-6">Content removed for policy violations. Restore, or schedule for permanent deletion (30-day recovery window).</p>

      <h3 className="font-semibold mb-3 text-sm">Removed Series ({removedSeries.length})</h3>
      {removedSeries.length === 0 ? (
        <p className="text-[#52525b] text-xs mb-6">No removed series.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {removedSeries.map(s => (
            <div key={s.id} className="bg-[#18181b] rounded-xl p-3 border border-[#27272a] flex items-center gap-3">
              {s.thumbnail_url ? <img src={s.thumbnail_url} className="w-10 h-14 rounded-lg object-cover shrink-0" /> : <div className="w-10 h-14 rounded-lg bg-[#27272a] shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{s.title}</div>
                <div className="text-[0.7rem] text-[#71717a]">by {s.profiles?.display_name || 'Unknown'} · Removed {s.removed_at ? timeAgo(s.removed_at) : ''}</div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => restore(s.id, s.title)} className="px-3 py-1.5 bg-[#7c3aed] text-white rounded-lg text-xs border-none cursor-pointer hover:bg-[#6d28d9]">Restore</button>
                <button onClick={() => scheduleDelete(s.id, s.title)} className="px-3 py-1.5 border border-red-500/30 rounded-lg text-xs text-[#f87171] cursor-pointer hover:bg-red-500/10 bg-transparent">Delete Forever</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Limbo section ────────────────────────────────────────────
         Series scheduled for permanent deletion. Thumbnails are hidden
         here on purpose — during limbo the admin shouldn't be able to
         preview potentially-illegal content. Only action is Recover. */}
      <h3 className="font-semibold mb-1 text-sm">Scheduled for Permanent Deletion ({limboSeries.length})</h3>
      <p className="text-[#52525b] text-xs mb-3">Fully hidden from everyone (including admin previews). Recover within the countdown or it&apos;s gone for good.</p>
      {limboSeries.length === 0 ? (
        <p className="text-[#52525b] text-xs mb-6">Nothing scheduled.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {limboSeries.map(s => {
            const ms = s.permanent_delete_scheduled_at
              ? new Date(s.permanent_delete_scheduled_at).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000 - Date.now()
              : 0
            const dLeft = Math.floor(ms / (24 * 60 * 60 * 1000))
            const urgent = dLeft <= 3
            const warn = dLeft <= 7 && !urgent
            const pillClass = urgent
              ? 'bg-red-500/10 border-red-500/30 text-[#f87171]'
              : warn
                ? 'bg-amber-500/10 border-amber-500/30 text-[#fbbf24]'
                : 'bg-[#27272a] border-[#3f3f46] text-[#a1a1aa]'
            return (
              <div key={s.id} className="bg-[#18181b] rounded-xl p-3 border border-[#27272a] flex items-center gap-3">
                {/* Thumbnail intentionally hidden during limbo — use a neutral placeholder */}
                <div className="w-10 h-14 rounded-lg bg-[#27272a] shrink-0 flex items-center justify-center text-[#52525b] text-[1rem]">🔒</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{s.title}</div>
                  <div className="text-[0.7rem] text-[#71717a] truncate">by {s.profiles?.display_name || 'Unknown'}</div>
                </div>
                <span className={`shrink-0 text-[0.65rem] md:text-[0.7rem] px-2 py-0.5 rounded-full border ${pillClass}`}>
                  {countdownLabel(s.permanent_delete_scheduled_at)}
                </span>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => recoverFromLimbo(s.id, s.title)} className="px-3 py-1.5 bg-[#7c3aed] text-white rounded-lg text-xs border-none cursor-pointer hover:bg-[#6d28d9]">Recover</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
