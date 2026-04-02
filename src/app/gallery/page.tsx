'use client'
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
    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)

    async function load() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('gallery')
          .select('*, profiles(display_name, handle, avatar_url)')
          .order('created_at', { ascending: false })
          .limit(limit)
        clearTimeout(timeout)
        if (!cancelled) {
          setItems(data ?? [])
          setLoading(false)
        }
      } catch {
        clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [limit, supabase])

  return (
    <div className="px-4 md:px-8 pb-10">
      <div className="py-8 md:py-10">
        <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight mb-1">
          🎨 Gallery
        </h1>
        <p className="text-[#71717a] text-sm md:text-base">Artwork, illustrations, and fan art from the community</p>
      </div>

      {loading ? (
        <p className="text-center py-16 text-[#52525b] text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-center py-16 text-[#52525b] text-sm">No gallery artworks yet. Be the first to upload!</p>
      ) : (
        <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
          {items.map((g, i) => (
            <GalleryCard key={g.id} item={g} index={i} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex justify-center mt-7">
          <button
            onClick={() => { setLimit(prev => prev + 18); show('Loaded more!') }}
            className="px-7 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] hover:text-[#c084fc]"
          >
            View More
          </button>
        </div>
      )}
    </div>
  )
}
