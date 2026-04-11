'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { ensureFreshSession } from '@/lib/supabase/write'
import Link from 'next/link'

function timeAgo(d: string) { const m=Math.floor((Date.now()-new Date(d).getTime())/60000); if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';const dy=Math.floor(h/24);if(dy<30)return dy+'d ago';return Math.floor(dy/30)+'mo ago' }

export default function AdminTrashPage() {
  const { show } = useToast()
  const { user, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [removedSeries, setRemovedSeries] = useState<any[]>([])
  const [removedGallery, setRemovedGallery] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = user?.email === 'nanotooncontact@gmail.com'

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) { setLoading(false); return }
    let c = false
    async function load() {
      const [s, g] = await Promise.all([
        anonDb.from('series').select('*, profiles!series_author_id_fkey(display_name, handle)').eq('is_removed', true).order('removed_at', { ascending: false }),
        anonDb.from('gallery').select('*, profiles!gallery_author_id_fkey(display_name, handle)').eq('is_removed', true).order('removed_at', { ascending: false }),
      ]) as any[]
      if (!c) {
        setRemovedSeries(s.data ?? [])
        setRemovedGallery(g.data ?? [])
        setLoading(false)
      }
    }
    load().catch(() => { if (!c) setLoading(false) })
    return () => { c = true }
  }, [user, authLoading, isAdmin, anonDb])

  async function restore(type: 'Series' | 'Gallery', id: string, title: string) {
    if (!confirm(`Restore "${title}"?`)) return
    await ensureFreshSession()
    const res = await fetch('/api/admin-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', contentType: type, contentId: id }),
    })
    const json = await res.json()
    if (!res.ok) { show('Restore failed: ' + (json.error || 'Unknown error')); return }
    if (type === 'Series') setRemovedSeries(prev => prev.filter(s => s.id !== id))
    else setRemovedGallery(prev => prev.filter(g => g.id !== id))
    show(`"${title}" restored!`)
  }

  async function permanentDelete(type: 'Series' | 'Gallery', id: string, title: string) {
    if (!confirm(`Permanently delete "${title}"? This cannot be undone.`)) return
    if (!confirm('Are you absolutely sure? All data will be lost forever.')) return
    await ensureFreshSession()
    const res = await fetch('/api/admin-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'permanent-delete', contentType: type, contentId: id }),
    })
    const json = await res.json()
    if (!res.ok) { show('Delete failed: ' + (json.error || 'Unknown error')); return }
    if (type === 'Series') setRemovedSeries(prev => prev.filter(s => s.id !== id))
    else setRemovedGallery(prev => prev.filter(g => g.id !== id))
    show(`"${title}" permanently deleted`)
  }

  if (authLoading || loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (!isAdmin) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Access denied</div>

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl font-bold text-[#f87171] mb-1">🗑️ Removed Content</h1>
      <p className="text-[#71717a] text-sm mb-6">Content removed for policy violations. Restore or permanently delete.</p>

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
                <button onClick={() => restore('Series', s.id, s.title)} className="px-3 py-1.5 bg-[#7c3aed] text-white rounded-lg text-xs border-none cursor-pointer hover:bg-[#6d28d9]">Restore</button>
                <button onClick={() => permanentDelete('Series', s.id, s.title)} className="px-3 py-1.5 border border-red-500/30 rounded-lg text-xs text-[#f87171] cursor-pointer hover:bg-red-500/10 bg-transparent">Delete Forever</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="font-semibold mb-3 text-sm">Removed Gallery ({removedGallery.length})</h3>
      {removedGallery.length === 0 ? (
        <p className="text-[#52525b] text-xs">No removed gallery items.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {removedGallery.map(g => {
            const thumb = g.thumbnail_url || (g.image_urls?.length > 0 ? g.image_urls[0] : null)
            return (
              <div key={g.id} className="bg-[#18181b] rounded-xl p-3 border border-[#27272a] flex items-center gap-3">
                {thumb ? <img src={thumb} className="w-10 h-14 rounded-lg object-cover shrink-0" /> : <div className="w-10 h-14 rounded-lg bg-[#27272a] shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{g.title}</div>
                  <div className="text-[0.7rem] text-[#71717a]">by {g.profiles?.display_name || 'Unknown'} · Removed {g.removed_at ? timeAgo(g.removed_at) : ''}</div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => restore('Gallery', g.id, g.title)} className="px-3 py-1.5 bg-[#7c3aed] text-white rounded-lg text-xs border-none cursor-pointer hover:bg-[#6d28d9]">Restore</button>
                  <button onClick={() => permanentDelete('Gallery', g.id, g.title)} className="px-3 py-1.5 border border-red-500/30 rounded-lg text-xs text-[#f87171] cursor-pointer hover:bg-red-500/10 bg-transparent">Delete Forever</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
