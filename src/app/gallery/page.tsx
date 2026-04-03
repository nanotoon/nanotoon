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
  const [limit, setLimit] = useState(45)

  useEffect(() => {
    let c = false
    async function load() {
      try { setLoading(true); const { data } = await supabase.from('gallery').select('*, profiles(display_name, handle, avatar_url)').order('created_at', { ascending: false }).limit(limit); if (!c) setItems(data ?? []) }
      catch {} finally { if (!c) setLoading(false) }
    }
    load(); return () => { c = true }
  }, [supabase, limit])

  return (
    <div className="px-4 md:px-8 py-6">
      <h2 className="text-base font-semibold text-[#c084fc] mb-4">Gallery</h2>
      {loading ? <p className="text-center py-12 text-[#52525b] text-sm">Loading...</p>
       : items.length === 0 ? <p className="text-center py-12 text-[#52525b] text-sm">No gallery artworks yet. Be the first!</p>
       : <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">{items.map((g, i) => <GalleryCard key={g.id} item={g} index={i} />)}</div>}
      {items.length > 0 && <div className="flex justify-center mt-7"><button onClick={() => { setLimit(p => p + 18); show('Loaded more!') }} className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]">View More</button></div>}
    </div>
  )
}
