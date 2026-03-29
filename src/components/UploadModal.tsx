'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { GENRES_ALL } from '@/data/mock'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

export function UploadModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [step, setStep] = useState<'choose' | 'existing' | 'form'>('choose')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [mySeries, setMySeries] = useState<any[]>([])
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null)
  const [seriesTitle, setSeriesTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterNumber, setChapterNumber] = useState(1)
  const [format, setFormat] = useState<string | null>(null)
  const [rating, setRating] = useState<string | null>(null)
  const [genres, setGenres] = useState<Set<string>>(new Set())
  const [desc, setDesc] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [thumbFile, setThumbFile] = useState<File | null>(null)
  const [thumbPreview, setThumbPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const thumbRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('series').select('*').eq('author_id', user.id).order('created_at', { ascending: false })
      .then(({ data }: any) => setMySeries(data ?? []))
  }, [user, supabase])

  useEffect(() => {
    if (!selectedSeriesId) return
    supabase.from('chapters').select('chapter_number').eq('series_id', selectedSeriesId)
      .order('chapter_number', { ascending: false }).limit(1)
      .then(({ data }: any) => setChapterNumber(data && data.length > 0 ? data[0].chapter_number + 1 : 1))
  }, [selectedSeriesId, supabase])

  // Different validation for new vs existing
  const canPublish = mode === 'existing'
    ? !!(rating && chapterTitle && selectedSeriesId)
    : !!(format && rating && chapterTitle && seriesTitle)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const nf = Array.from(e.target.files || []).filter(f => f.type.match(/image\/(jpeg|png|webp)/) && f.size <= 20*1024*1024)
    setFiles(prev => [...prev, ...nf].slice(0, 100))
  }

  function handleThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) { if (f.size > 5*1024*1024) { onToast('Max 5MB'); return }; setThumbFile(f); const r = new FileReader(); r.onload = ev => setThumbPreview(ev.target?.result as string); r.readAsDataURL(f) }
  }

  async function submit() {
    if (!user || !canPublish) return
    setUploading(true); setProgress('Preparing...')
    try {
      let seriesId = selectedSeriesId

      if (mode === 'new') {
        setProgress('Creating series...')
        let thumbnailUrl = null
        if (thumbFile) {
          const path = `thumbnails/${user.id}/${Date.now()}.${thumbFile.name.split('.').pop()}`
          const { error } = await supabase.storage.from('series-assets').upload(path, thumbFile, { upsert: true })
          if (error) { onToast('Thumbnail failed: ' + error.message); setUploading(false); return }
          thumbnailUrl = supabase.storage.from('series-assets').getPublicUrl(path).data.publicUrl
        }
        const slug = seriesTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
        const { data: ns, error } = await supabase.from('series').insert({
          title: seriesTitle, slug, description: desc || null, format: format!, genres: Array.from(genres),
          thumbnail_url: thumbnailUrl, author_id: user.id,
        }).select().single()
        if (error) { onToast('Series creation failed: ' + error.message); setUploading(false); return }
        seriesId = ns.id
      }

      const pageUrls: string[] = []
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading page ${i+1}/${files.length}...`)
        const f = files[i]
        const path = `chapters/${seriesId}/${chapterNumber}/${String(i+1).padStart(3,'0')}.${f.name.split('.').pop()}`
        const { error } = await supabase.storage.from('series-assets').upload(path, f, { upsert: true })
        if (error) { onToast(`Page ${i+1} failed`); setUploading(false); return }
        pageUrls.push(supabase.storage.from('series-assets').getPublicUrl(path).data.publicUrl)
      }

      setProgress('Creating chapter...')
      const { error: chErr } = await supabase.from('chapters').insert({
        series_id: seriesId, chapter_number: chapterNumber, title: chapterTitle,
        rating: rating!, page_urls: pageUrls.length > 0 ? pageUrls : null,
      })
      if (chErr) { onToast('Chapter failed: ' + chErr.message); setUploading(false); return }

      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', seriesId)
      onToast('Chapter published!'); onClose()
    } catch (err: any) { onToast('Error: ' + (err.message || 'Failed')) }
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-[200] flex items-start justify-center overflow-y-auto p-4 pb-10">
      <div className="bg-[#18181b] rounded-2xl w-full max-w-[500px] border border-[#27272a]">
        <div className="p-3.5 border-b border-[#27272a] flex justify-between items-center sticky top-0 bg-[#18181b] z-10 rounded-t-2xl">
          <h2 className="font-semibold text-base">{step === 'form' && mode === 'existing' ? 'Add Chapter' : step === 'form' ? 'New Series' : 'Upload'}</h2>
          <button onClick={onClose} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa] text-base flex items-center justify-center hover:text-white">×</button>
        </div>

        {step === 'choose' && (
          <div className="p-4 flex flex-col gap-2.5">
            <button onClick={() => { setMode('new'); setStep('form') }} className="w-full p-3.5 border border-[#3f3f46] rounded-xl bg-transparent text-left cursor-pointer hover:border-[#a855f7]">
              <div className="font-semibold text-sm mb-0.5">📁 Create a new series</div><div className="text-xs text-[#71717a]">Upload the first chapter of a new series</div>
            </button>
            <button onClick={() => { setMode('existing'); setStep('existing') }} className="w-full p-3.5 border border-[#3f3f46] rounded-xl bg-transparent text-left cursor-pointer hover:border-[#a855f7]">
              <div className="font-semibold text-sm mb-0.5">➕ Add chapter to existing series</div><div className="text-xs text-[#71717a]">Upload a new chapter to a current series</div>
            </button>
          </div>
        )}

        {step === 'existing' && (
          <div className="p-4">
            <p className="text-sm text-[#71717a] mb-2.5">Select series:</p>
            {mySeries.length === 0 ? <p className="text-[#52525b] text-xs py-4 text-center">No series yet.</p> : (
              <div className="flex flex-col gap-2 mb-3.5">{mySeries.map(s => (
                <div key={s.id} onClick={() => { setSelectedSeriesId(s.id); setTimeout(() => setStep('form'), 200) }}
                  className={`p-2.5 border rounded-lg cursor-pointer flex items-center gap-2.5 ${selectedSeriesId === s.id ? 'border-[#a855f7] bg-purple-500/10' : 'border-[#3f3f46] hover:border-[#a855f7]'}`}>
                  {s.thumbnail_url ? <img src={s.thumbnail_url} className="w-8 h-12 rounded-md shrink-0 object-cover" /> : <div className="w-8 h-12 rounded-md shrink-0 bg-[#27272a]"></div>}
                  <div><div className="font-medium text-sm">{s.title}</div><div className="text-[0.71rem] text-[#71717a]">{s.format}</div></div>
                </div>
              ))}</div>
            )}
            <button onClick={() => setStep('choose')} className="bg-transparent border-none text-[#71717a] cursor-pointer text-sm">← Back</button>
          </div>
        )}

        {step === 'form' && (
          <>
            <div className="p-4 flex flex-col gap-3">
              {mode === 'new' && (
                <div>
                  <label className="block text-xs text-[#71717a] mb-1">Series Title *</label>
                  <input value={seriesTitle} onChange={e => setSeriesTitle(e.target.value)} placeholder="My Series"
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
                  <div className="mt-2.5">
                    <label className="block text-xs text-[#71717a] mb-1">Thumbnail</label>
                    <div className="flex items-center gap-2.5">
                      <div className="w-12 h-[72px] rounded-lg bg-[#27272a] border border-dashed border-[#3f3f46] flex items-center justify-center shrink-0 overflow-hidden">
                        {thumbPreview ? <img src={thumbPreview} className="w-full h-full object-cover" /> : <span className="text-[#52525b] text-xs">📷</span>}
                      </div>
                      <button onClick={() => thumbRef.current?.click()} className="px-2.5 py-1 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] cursor-pointer text-xs">Choose</button>
                      <input ref={thumbRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={handleThumb} />
                    </div>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-[#71717a] mb-1">Chapter Title *</label>
                <input value={chapterTitle} onChange={e => setChapterTitle(e.target.value)} placeholder="Chapter 1 — The Beginning"
                  className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
              </div>
              <div>
                <label className="block text-xs text-[#71717a] mb-1">Chapter #</label>
                <input type="number" value={chapterNumber} onChange={e => setChapterNumber(parseInt(e.target.value) || 1)} min={1}
                  className="w-20 bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
              </div>
              {/* Only show format for new series */}
              {mode === 'new' && (
                <div>
                  <label className="block text-xs text-[#71717a] mb-1.5">Format *</label>
                  <div className="flex gap-1.5">
                    {['Series', 'One Shot'].map(f => (
                      <button key={f} onClick={() => setFormat(f)} className={`px-4 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${format === f ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>{f}</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-[#71717a] mb-1.5">Content Rating *</label>
                <div className="flex gap-1.5">
                  <button onClick={() => setRating('General')} className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${rating === 'General' ? 'border-green-500 text-green-400 bg-green-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>General</button>
                  <button onClick={() => setRating('Mature')} className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${rating === 'Mature' ? 'border-amber-500 text-amber-400 bg-amber-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>Mature</button>
                </div>
              </div>
              {mode === 'new' && (
                <div className="border-t border-[#27272a] pt-3">
                  <label className="block text-xs text-[#71717a] mb-1.5">Genres <span className="text-[#52525b]">(max 3)</span></label>
                  <div className="flex gap-1 flex-wrap mb-3">
                    {GENRES_ALL.map(g => (
                      <button key={g} onClick={() => { const n = new Set(genres); if (n.has(g)) n.delete(g); else if (n.size < 3) n.add(g); else return; setGenres(n) }}
                        className={`px-2.5 py-1 rounded-full text-[0.73rem] cursor-pointer border ${genres.has(g) ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : genres.size >= 3 ? 'border-[#27272a] text-[#3f3f46] bg-transparent cursor-not-allowed' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>{g}</button>
                    ))}
                  </div>
                  <label className="block text-xs text-[#71717a] mb-1">Description</label>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Brief description..."
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none resize-y font-[inherit] focus:border-[#a855f7]" />
                </div>
              )}
              <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-[#3f3f46] rounded-xl p-6 text-center cursor-pointer hover:border-[#a855f7]">
                <input ref={fileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple onChange={handleFiles} />
                <p className="text-sm font-medium text-[#d4d4d8]">{files.length ? `${files.length} pages selected` : 'Click to select pages'}</p>
                <p className="text-[0.71rem] text-[#71717a] mt-0.5">{files.length ? 'Click to add more' : 'JPG, PNG, WebP'}</p>
                {files.length > 0 && (
                  <div className="mt-2 max-h-[120px] overflow-y-auto text-left" onClick={e => e.stopPropagation()}>
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 border-b border-[#27272a] text-xs">
                        <span className="text-[#52525b] w-5 text-center shrink-0">{i+1}</span>
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-[#52525b] shrink-0">{(f.size/1024).toFixed(0)}KB</span>
                        <button onClick={() => setFiles(p => p.filter((_,j) => j !== i))} className="text-[#71717a] hover:text-[#f87171] bg-transparent border-none cursor-pointer text-xs px-1">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setStep('choose')} className="bg-transparent border-none text-[#71717a] cursor-pointer text-sm text-left">← Back</button>
            </div>
            <div className="p-3 border-t border-[#27272a] flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 border border-[#3f3f46] rounded-lg bg-transparent text-[#a1a1aa] cursor-pointer text-sm">Cancel</button>
              <button onClick={submit} disabled={!canPublish || uploading}
                className={`flex-[2] py-2 bg-[#7c3aed] text-white rounded-lg text-sm font-medium border-none ${canPublish && !uploading ? 'cursor-pointer hover:bg-[#6d28d9]' : 'opacity-40 cursor-not-allowed'}`}>
                {uploading ? progress : 'Publish Chapter'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
