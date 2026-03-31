'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SeriesCard } from '@/components/SeriesCard'
import { categories } from '@/data/mock'
import { createClient } from '@/lib/supabase/client'

function SearchContent() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const supabase = useMemo(() => createClient(), [])
  const [genreFilter, setGenreFilter] = useState('All')
  const [formatFilter, setFormatFilter] = useState('All')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return }
    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)
    async function search() {
      setLoading(true)
      const searchTerm = `%${query.trim()}%`
      let q = supabase.from('series')
        .select('*, profiles(display_name, handle, avatar_url)')
        .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
        .order('total_views', { ascending: false })
        .limit(50)
      
      if (genreFilter !== 'All') q = q.contains('genres', [genreFilter])
      if (formatFilter !== 'All') q = q.eq('format', formatFilter)
      
      const { data } = await q

      let extraResults: any[] = []
      if (data && data.length < 10) {
        const { data: genreMatch } = await supabase.from('series')
          .select('*, profiles(display_name, handle, avatar_url)')
          .contains('genres', [query.trim()])
          .order('total_views', { ascending: false }).limit(20)
        
        const { data: tagMatch } = await supabase.from('series')
          .select('*, profiles(display_name, handle, avatar_url)')
          .contains('tags', [query.trim()])
          .order('total_views', { ascending: false }).limit(20)
        
        const existingIds = new Set((data ?? []).map((s: any) => s.id))
        extraResults = [...(genreMatch ?? []), ...(tagMatch ?? [])].filter(s => !existingIds.has(s.id))
      }

      if (!cancelled) {
        const seen = new Set<string>()
        const all = [...(data ?? []), ...extraResults].filter(s => {
          if (seen.has(s.id)) return false
          seen.add(s.id); return true
        })
        clearTimeout(timeout)
        setResults(all)
        setLoading(false)
      }
    }
    search()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [query, genreFilter, formatFilter, supabase])

  const PillGroup = ({ label, options, value, onChange }: any) => (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[0.73rem] text-[#71717a] shrink-0">{label}:</span>
      {options.map((o: string) => (
        <button key={o} onClick={() => onChange(o)}
          className={`px-2.5 py-1 rounded-full text-[0.73rem] cursor-pointer border transition-all ${value === o ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#3f3f46] text-[#71717a] hover:border-[#a855f7]'}`}>{o}</button>
      ))}
    </div>
  )

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <Link href="/" className="flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
        </Link>
        <h1 className="text-lg font-bold">Results for: <span className="text-[#c084fc]">&quot;{query}&quot;</span></h1>
      </div>
      <div className="flex gap-2 flex-wrap mb-4">
        <PillGroup label="Genre" options={['All', ...categories.map((c: any) => c.name)]} value={genreFilter} onChange={setGenreFilter} />
        <PillGroup label="Format" options={['All', 'Series', 'One Shot']} value={formatFilter} onChange={setFormatFilter} />
      </div>
      {loading ? <p className="text-center py-12 text-[#52525b] text-sm">Searching...</p> : (
        <>
          <p className="text-xs text-[#71717a] mb-3">{results.length} result{results.length !== 1 ? 's' : ''}</p>
          {results.length > 0 ? (
            <div className="grid gap-2.5 md:gap-4 grid-cols-3 md:grid-cols-9">
              {results.map((s, i) => (
                <SeriesCard key={s.id} title={s.title} slug={s.slug} author={s.profiles?.display_name || 'Unknown'} thumbnailUrl={s.thumbnail_url}
                  latestChapter={0} rating="General" format={s.format} index={i} views={s.total_views} likes={s.total_likes} favorites={s.total_favorites} />
              ))}
            </div>
          ) : <p className="text-center py-14 text-[#71717a]">No series match your search.</p>}
        </>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-center py-12 text-[#52525b] text-sm">Searching...</p>}>
      <SearchContent />
    </Suspense>
  )
}