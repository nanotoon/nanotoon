"use client"
import { useState, useEffect, useMemo } from 'react'
import { GalleryCard } from '@/components/GalleryCard'
import { useToast } from '@/components/Toast'
import { createClient } from '@/lib/supabase/client'

export default function GalleryPage() {
  const { show } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(45)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Safety timeout — if query hangs, stop loading after 12s
    const timeout = setTimeout(() => {
      if (!cancelled) { setLoading(false); setError('Request timed out — check your internet connection or try refreshing') }
    }, 12000)
    async function load() {
      try {
        setLoading(true)
        setError(null)

        // Try with profile join first (use explicit FK)
        let result = await supabase
          .from('gallery')
          .select('*, profiles(display_name, handle, avatar_url)')
          .order('created_at', { ascending: false })
          .limit(limit)

        // If explicit FK fails, try with implicit join
        if (result.error) {
          console.warn('Gallery query with explicit FK failed, trying implicit:', result.error.message)
          result = await supabase
            .from('gallery')
            .select('*, profiles(display_name, handle, avatar_url)')
            .order('created_at', { ascending: false })
            .limit(limit)
        }

        // If join still fails, try without the join
        if (result.error) {
          console.warn('Gallery query with join failed, trying without join:', result.error.message)
          result = await supabase
            .from('gallery')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit)
        }

        if (result.error) {
          console.error('Gallery query failed:', result.error)
          if (!cancelled) setError(result.error.message)
        } else {
          if (!cancelled) setItems(result.data ?? [])
        }
      } catch (err: any) {
        console.error('Gallery load error:', err)
        if (!cancelled) setError(err?.message || 'Failed to load gallery')
      } finally {
        clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [supabase, limit, retryKey])

  return (
    <div className="px-4 md:px-8 py-6">
      <h2 className="text-base font-semibold text-[#c084fc] mb-4">Gallery</h2>
      {loading ? <p className="text-center py-12 text-[#52525b] text-sm">Loading...</p>
       : error ? (
        <div className="text-center py-12">
          <p className="text-[#f87171] text-sm mb-3">Failed to load gallery</p>
          <p className="text-[#52525b] text-xs mb-4">{error}</p>
          <button onClick={() => setRetryKey(k => k + 1)} className="px-4 py-2 border border-[#3f3f46] rounded-lg bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7]">Retry</button>
        </div>
       )
       : items.length === 0 ? <p className="text-center py-12 text-[#52525b] text-sm">No gallery artworks yet. Be the first!</p>
       : <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">{items.map((g, i) => <GalleryCard key={g.id} item={g} index={i} />)}</div>}
      {items.length > 0 && <div className="flex justify-center mt-7"><button onClick={() => { setLimit(p => p + 18); show('Loaded more!') }} className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]">View More</button></div>}
    </div>
  )
}
