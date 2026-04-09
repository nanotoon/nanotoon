'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { GENRES_ALL } from '@/data/mock'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { createAnonClient } from '@/lib/supabase/anon'
import { createClient as createRawClient } from '@supabase/supabase-js'

const MAX_FILE = 10 * 1024 * 1024
const MAX_TOTAL_SERIES = 150 * 1024 * 1024
const MAX_TOTAL_GALLERY = 50 * 1024 * 1024
const MATURE_TEXT = "Violence & Dark Themes: Intense graphic violence and realistic blood are permitted in Mature-tagged chapters. Content solely depicting sadistic torture without narrative purpose is prohibited.\n\nNudity — Non-sexual nudity is allowed if genitalia are fully obscured/censored. Pornographic content is strictly prohibited.\n\nProhibited:\n• Sexual content involving minors — zero tolerance\n• Instructions for making drugs, explosives, or weapons\n• Content promoting self-harm or suicide\n• Malware, scams, or phishing\n• Content inciting real-world violence"

// ─── Compress image to WebP ─────────────────────────────────
async function compressImage(file: File, maxWidth: number, quality: number): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let w = img.width, h = img.height
      if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth }
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }))
        } else { resolve(file) }
      }, 'image/webp', quality)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

// ─── R2 upload helper ────────────────────────────────────────
async function uploadToR2(file: File, path: string, accessToken: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('path', path)
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: fd,
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error || 'Upload failed')
  return json.url
}

function MatureTip({ mobile }: { mobile: boolean }) {
  const [open, setOpen] = useState(false)
  if (mobile) return (<>
    <button type="button" onClick={() => setOpen(true)} className="w-4 h-4 rounded-full border border-[#71717a] text-[0.6rem] text-[#71717a] bg-transparent cursor-pointer flex items-center justify-center ml-1">?</button>
    {open && <div className="fixed inset-0 bg-black/90 z-[400] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-[#18181b] rounded-2xl max-w-[440px] w-full border border-[#27272a] p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3"><h3 className="font-semibold text-sm">What is allowed?</h3>
        <button onClick={() => setOpen(false)} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa]">&times;</button></div>
        <p className="text-[#a1a1aa] text-xs leading-relaxed whitespace-pre-line">{MATURE_TEXT}</p></div></div>}
  </>)
  return <span className="relative group ml-1"><span className="w-4 h-4 rounded-full border border-[#71717a] text-[0.6rem] text-[#71717a] inline-flex items-center justify-center cursor-help">?</span>
    <span className="absolute left-6 bottom-0 w-[320px] bg-[#27272a] border border-[#3f3f46] rounded-xl p-3 text-[0.68rem] text-[#a1a1aa] leading-relaxed whitespace-pre-line hidden group-hover:block z-[100] shadow-2xl">{MATURE_TEXT}</span></span>
}

export function UploadModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const anonDb = useMemo(() => createAnonClient(), [])
  const [step, setStep] = useState<'choose' | 'existing' | 'form'>('choose')
  const [uploadType, setUploadType] = useState<'series' | 'gallery'>('series')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [mySeries, setMySeries] = useState<any[]>([])
  const [loadingSeries, setLoadingSeries] = useState(false)
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null)
  const [seriesTitle, setSeriesTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterNumber, setChapterNumber] = useState(1)
  const [format, setFormat] = useState<string | null>(null)
  const [rating, setRating] = useState<string | null>(null)
  const [genres, setGenres] = useState<Set<string>>(new Set())
  const [desc, setDesc] = useState('')
  const [readingMode, setReadingMode] = useState<'webtoon' | 'horizontal'>('webtoon')
  const [files, setFiles] = useState<File[]>([])
  const [thumbFile, setThumbFile] = useState<File | null>(null)
  const [thumbPreview, setThumbPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const thumbRef = useRef<HTMLInputElement>(null)
  const [gTitle, setGTitle] = useState('')
  const [gDesc, setGDesc] = useState('')
  const [gMature, setGMature] = useState(false)
  const [gTags, setGTags] = useState('')
  const [dragging, setDragging] = useState(false)
  const [gReadMode, setGReadMode] = useState<'horizontal' | 'webtoon'>('horizontal')

  useEffect(() => { const c = () => setIsMobile(window.innerWidth < 768); c(); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c) }, [])

  useEffect(() => {
    if (!user) return
    setLoadingSeries(true)
    anonDb.from('series').select('*').eq('author_id', user.id).order('created_at', { ascending: false })
      .then(({ data }: any) => { setMySeries(data ?? []); setLoadingSeries(false) })
  }, [user, anonDb])

  useEffect(() => {
    if (!selectedSeriesId) return
    anonDb.from('chapters').select('chapter_number').eq('series_id', selectedSeriesId)
      .order('chapter_number', { ascending: false }).limit(1)
      .then(({ data }: any) => setChapterNumber(data?.length > 0 ? data[0].chapter_number + 1 : 1))
  }, [selectedSeriesId, anonDb])

  const canPubSeries = mode === 'existing' ? !!(rating && chapterTitle && selectedSeriesId) : !!(format && rating && chapterTitle && seriesTitle)
  const canPubGallery = !!(gTitle.trim() && files.length > 0)
  const canPublish = uploadType === 'gallery' ? canPubGallery : canPubSeries

  function addFiles(newFiles: File[]) {
    const maxTotal = uploadType === 'gallery' ? MAX_TOTAL_GALLERY : MAX_TOTAL_SERIES
    const maxLabel = uploadType === 'gallery' ? '50MB' : '150MB'
    const nf = newFiles.filter(f => {
      if (!f.type.match(/image\/(jpeg|png|webp)/)) { onToast(f.name + ' is not a supported image'); return false }
      if (f.size > MAX_FILE) { onToast(f.name + ' exceeds 10MB'); return false }
      return true
    })
    const combined = [...files, ...nf].slice(0, 200)
    const totalSize = combined.reduce((s, f) => s + f.size, 0)
    if (totalSize > maxTotal) { onToast('Total exceeds ' + maxLabel + '! Remove some files.'); return }
    setFiles(combined)
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files || []))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) addFiles(droppedFiles)
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setDragging(false) }

  function handleThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > MAX_FILE) { onToast('Thumbnail must be under 10MB'); return }
    setThumbFile(f)
    const r = new FileReader(); r.onload = ev => setThumbPreview(ev.target?.result as string); r.readAsDataURL(f)
  }

  async function ensureProfile(writeDb: any) {
    if (!user) throw new Error('Not logged in')
    try {
      const { data, error } = await anonDb.from('profiles').select('id').eq('id', user.id).maybeSingle() as { data: any; error: any }
      if (error) console.warn('Profile select error (will try insert):', error.message)
      if (data) return
    } catch (err: any) {
      console.warn('Profile select failed (will try insert):', err?.message)
    }
    const dn = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Creator'
    const h = (user.user_metadata?.handle || user.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '') || 'user_' + user.id.slice(0, 8)).toLowerCase()
    const { error } = await writeDb.from('profiles').insert({ id: user.id, display_name: dn, handle: h })
    if (error && !error.message.includes('duplicate') && !error.code?.includes('23505')) {
      throw new Error('Profile setup failed: ' + error.message)
    }
  }

  async function submit() {
    if (!user || !canPublish) return
    if (files.length === 0) { setUploadError('Please select at least one image'); onToast('Please select at least one image'); return }
    if (uploadType === 'series' && files.length < 2) { setUploadError('Please select at least 2 pages for the chapter'); onToast('At least 2 pages required'); return }
    const totalSize = files.reduce((s, f) => s + f.size, 0)
    if (uploadType === 'series' && totalSize > MAX_TOTAL_SERIES) { setUploadError('Total pages exceed 150MB'); onToast('Total pages exceed 150MB'); return }
    if (uploadType === 'gallery' && files.length === 1 && files[0].size > 5 * 1024 * 1024) { setUploadError('Single image must be under 5MB'); onToast('Single image must be under 5MB'); return }
    if (uploadType === 'gallery' && totalSize > MAX_TOTAL_GALLERY) { setUploadError('Total images exceed 50MB'); onToast('Total images exceed 50MB'); return }
    setUploading(true); setUploadError(''); setProgress('Preparing...')
    try {
      // Get access token from the browser auth client ONCE, before any writes.
      // This runs in the browser so token refresh works normally here.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not logged in — please sign in again')
      const token = session.access_token

      // Create a FRESH Supabase client with the token explicitly set.
      // This avoids the shared singleton's internal lock state which can hang.
      const writeDb = createRawClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      ) as any

      await ensureProfile(writeDb)
      setProgress('Starting upload...')
      if (uploadType === 'gallery') await doGalleryUpload(token, writeDb)
      else await doSeriesUpload(token, writeDb)
    } catch (err: any) {
      console.error('Upload error:', err)
      const msg = err?.message || 'Unexpected error'
      setUploadError(msg); onToast('Error: ' + msg)
    }
    setUploading(false)
  }

  async function doSeriesUpload(token: string, writeDb: any) {
    let seriesId = selectedSeriesId
    if (mode === 'new') {
      setProgress('Creating series...')
      let thumbnailUrl: string | null = null
      if (thumbFile) {
        setProgress('Compressing thumbnail...')
        const compressed = await compressImage(thumbFile, 800, 0.85)
        const path = 'thumbnails/' + user!.id + '/' + Date.now() + '.webp'
        try {
          thumbnailUrl = await uploadToR2(compressed, path, token)
        } catch (e: any) {
          onToast('Thumbnail skipped: ' + e.message)
        }
      }
      const slug = seriesTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
      const { data: ns, error: sErr } = await writeDb.from('series').insert({
        title: seriesTitle, slug, description: desc || null, format: format!, genres: Array.from(genres),
        thumbnail_url: thumbnailUrl, author_id: user!.id, reading_mode: readingMode,
      }).select().single()
      if (sErr) throw new Error(sErr.message || 'Series creation failed')
      seriesId = ns.id
    }
    const pageUrls: string[] = []
    for (let i = 0; i < files.length; i++) {
      setProgress('Compressing page ' + (i + 1) + '/' + files.length + '...')
      const compressed = await compressImage(files[i], 800, 0.85)
      setProgress('Uploading page ' + (i + 1) + '/' + files.length + '...')
      const path = 'chapters/' + seriesId + '/' + chapterNumber + '/' + String(i + 1).padStart(3, '0') + '.webp'
      const url = await uploadToR2(compressed, path, token)
      pageUrls.push(url)
    }
    setProgress('Saving chapter...')
    const { error: chErr } = await writeDb.from('chapters').insert({
      series_id: seriesId, chapter_number: chapterNumber, title: chapterTitle, rating: rating!,
      page_urls: pageUrls.length > 0 ? pageUrls : null, reading_mode: readingMode,
    })
    if (chErr) throw new Error(chErr.message || 'Chapter save failed')
    await writeDb.from('series').update({ updated_at: new Date().toISOString() }).eq('id', seriesId)
    onToast('Chapter published! 🎉'); onClose()
  }

  async function doGalleryUpload(token: string, writeDb: any) {
    const imageUrls: string[] = []
    for (let i = 0; i < files.length; i++) {
      setProgress('Compressing image ' + (i + 1) + '/' + files.length + '...')
      const compressed = await compressImage(files[i], 9999, 0.85)
      setProgress('Uploading image ' + (i + 1) + '/' + files.length + '...')
      const path = 'gallery/' + user!.id + '/' + Date.now() + '_' + i + '.webp'
      const url = await uploadToR2(compressed, path, token)
      imageUrls.push(url)
    }
    let thumbnailUrl: string | null = null
    if (files.length > 1 && thumbFile) {
      const compressed = await compressImage(thumbFile, 9999, 0.85)
      const path = 'gallery/' + user!.id + '/thumb_' + Date.now() + '.webp'
      try { thumbnailUrl = await uploadToR2(compressed, path, token) } catch { /* skip */ }
    }
    setProgress('Saving...')
    const { error } = await writeDb.from('gallery').insert({
      title: gTitle.trim(), description: gDesc || null, image_urls: imageUrls,
      thumbnail_url: thumbnailUrl, author_id: user!.id, is_mature: gMature,
      tags: gTags ? gTags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      reading_mode: gReadMode,
    })
    if (error) throw new Error(error.message)
    onToast('Gallery published! 🎉'); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-[200] flex items-start justify-center overflow-y-auto p-4 pb-10">
      <div className={'bg-[#18181b] rounded-2xl w-full border border-[#27272a] ' + (step === 'choose' ? 'max-w-[600px] md:max-w-[700px]' : 'max-w-[600px] md:max-w-[700px]') + (step === 'form' ? ' md:min-h-[calc(100vh-80px)]' : '')}>
        <div className="p-3.5 border-b border-[#27272a] flex justify-between items-center sticky top-0 bg-[#18181b] z-10 rounded-t-2xl">
          <h2 className="font-semibold text-base">
            {step === 'form' && uploadType === 'gallery' ? 'Upload to Gallery' : step === 'form' && mode === 'existing' ? 'Add Chapter' : step === 'form' ? 'New Series' : 'Upload'}
          </h2>
          <button onClick={onClose} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa] text-base flex items-center justify-center hover:text-white">&times;</button>
        </div>

        {step === 'choose' && (
          <div className="p-4 md:p-6 flex flex-col gap-3 md:gap-4">
            <h3 className="text-sm text-[#71717a]">Series</h3>
            <button onClick={() => { setUploadType('series'); setMode('new'); setStep('form') }}
              className="w-full p-4 md:p-6 border border-[#3f3f46] rounded-xl bg-transparent text-left cursor-pointer hover:border-[#a855f7]">
              <div className="font-semibold text-sm md:text-lg mb-0.5">📁 Create a new series</div>
              <div className="text-xs md:text-base text-[#71717a]">Upload the first chapter of a brand new series</div>
            </button>
            <button onClick={() => { setUploadType('series'); setMode('existing'); setStep('existing') }}
              className="w-full p-4 md:p-6 border border-[#3f3f46] rounded-xl bg-transparent text-left cursor-pointer hover:border-[#a855f7]">
              <div className="font-semibold text-sm md:text-lg mb-0.5">➕ Add chapter to existing series</div>
              <div className="text-xs md:text-base text-[#71717a]">Upload a new chapter to one of your current series</div>
            </button>
            <h3 className="text-sm text-[#71717a] mt-2">Gallery</h3>
            <button onClick={() => { setUploadType('gallery'); setStep('form') }}
              className="w-full p-4 md:p-6 border border-[#3f3f46] rounded-xl bg-transparent text-left cursor-pointer hover:border-[#a855f7]">
              <div className="font-semibold text-sm md:text-lg mb-0.5">🎨 Upload to Gallery</div>
              <div className="text-xs md:text-base text-[#71717a]">Single artwork or album</div>
            </button>
          </div>
        )}

        {step === 'existing' && (
          <div className="p-4">
            <p className="text-sm text-[#71717a] mb-2.5">Select your series:</p>
            {loadingSeries ? <p className="text-[#52525b] text-xs py-4 text-center">Loading...</p> : mySeries.length === 0 ? <p className="text-[#52525b] text-xs py-4 text-center">No series yet.</p> : (
              <div className="flex flex-col gap-2 mb-3.5">
                {mySeries.map((s: any) => (
                  <div key={s.id} onClick={() => { setSelectedSeriesId(s.id); setReadingMode(s.reading_mode || 'webtoon'); setTimeout(() => setStep('form'), 150) }}
                    className={'p-2.5 border rounded-lg cursor-pointer flex items-center gap-2.5 ' + (selectedSeriesId === s.id ? 'border-[#a855f7] bg-purple-500/10' : 'border-[#3f3f46] hover:border-[#a855f7]')}>
                    {s.thumbnail_url ? <img src={s.thumbnail_url} className="w-8 h-12 rounded-md shrink-0 object-cover" alt={s.title} /> : <div className="w-8 h-12 rounded-md shrink-0 bg-[#27272a] flex items-center justify-center text-lg">📖</div>}
                    <div><div className="font-medium text-sm">{s.title}</div><div className="text-[0.71rem] text-[#71717a]">{s.format}</div></div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setStep('choose')} className="bg-transparent border-none text-[#71717a] cursor-pointer text-sm">← Back</button>
          </div>
        )}

        {step === 'form' && uploadType === 'gallery' && (<>
          <div className="p-4 flex flex-col gap-3">
            {uploadError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl p-2.5">{uploadError}</div>}
            <div><label className="block text-xs text-[#71717a] mb-1">Title *</label><input value={gTitle} onChange={e => setGTitle(e.target.value)} placeholder="My Artwork" className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" /></div>
            <div><label className="block text-xs text-[#71717a] mb-1">Description <span className="text-[#52525b]">(max 80 words)</span></label><textarea value={gDesc} onChange={e => { const words = e.target.value.trim().split(/\s+/).filter(Boolean); if (words.length <= 80) setGDesc(e.target.value); else setGDesc(words.slice(0,80).join(' ')) }} rows={2} placeholder="About this artwork..." className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none resize-y font-[inherit] focus:border-[#a855f7]" /><div className="text-right text-[0.65rem] text-[#52525b] mt-0.5">{gDesc.trim().split(/\s+/).filter(Boolean).length}/80 words</div></div>
            <div><label className="block text-xs text-[#71717a] mb-1">Tags <span className="text-[#52525b]">(comma separated)</span></label><input value={gTags} onChange={e => setGTags(e.target.value)} placeholder="fantasy, dark" className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" /></div>
            <div className="flex items-center gap-2"><label className="text-xs text-[#71717a]">Mature</label><MatureTip mobile={isMobile} /><button onClick={() => setGMature(!gMature)} className={'w-9 h-5 rounded-full border-none cursor-pointer relative shrink-0 ' + (gMature ? 'bg-amber-500' : 'bg-[#3f3f46]')}><span className={'absolute top-[1.5px] w-4 h-4 bg-white rounded-full transition-all ' + (gMature ? 'right-[2px]' : 'left-[1.5px]')}></span></button></div>
            {files.length > 1 && (<div><label className="block text-xs text-[#71717a] mb-1.5">Reading Mode</label><div className="flex gap-1.5">
              <button onClick={() => setGReadMode('horizontal')} className={'px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ' + (gReadMode === 'horizontal' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>◀▶ Horizontal</button>
              <button onClick={() => setGReadMode('webtoon')} className={'px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ' + (gReadMode === 'webtoon' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>▼ Webtoon</button>
            </div></div>)}
            {files.length > 1 && (<div><label className="block text-xs text-[#71717a] mb-1.5">Album Thumbnail</label><div className="flex items-center gap-3"><div className="w-12 h-[72px] rounded-lg bg-[#27272a] border border-dashed border-[#3f3f46] flex items-center justify-center shrink-0 overflow-hidden">{thumbPreview ? <img src={thumbPreview} className="w-full h-full object-cover" alt="" /> : <span className="text-[#52525b] text-lg">📷</span>}</div><button type="button" onClick={() => thumbRef.current?.click()} className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] cursor-pointer text-xs">{thumbPreview ? 'Change' : 'Choose'}</button><input ref={thumbRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={handleThumb} /></div></div>)}
            <div><label className="block text-xs text-[#71717a] mb-1.5">Images <span className="text-[#52525b]">(max 10MB each, 50MB total)</span></label>
              <div onClick={() => fileRef.current?.click()} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={'border-2 border-dashed rounded-xl p-6 md:p-10 text-center cursor-pointer transition-colors ' + (dragging ? 'border-[#a855f7] bg-purple-500/10' : 'border-[#3f3f46] hover:border-[#a855f7]')}>
                <input ref={fileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple onChange={handleFiles} />
                <p className="text-sm font-medium text-[#d4d4d8]">{files.length ? files.length + ' image(s) selected' : dragging ? 'Drop images here!' : 'Click or drag & drop images'}</p>
                {files.length > 0 && <div className="mt-2 max-h-[100px] overflow-y-auto text-left" onClick={e => e.stopPropagation()}>{files.map((f, i) => (<div key={i} className="flex items-center gap-2 py-1 border-b border-[#27272a] text-xs"><span className="text-[#52525b] w-5 text-center">{i+1}</span><span className="flex-1 truncate">{f.name}</span><span className="text-[#52525b]">{(f.size/1024).toFixed(0)}KB</span><button onClick={() => setFiles(p => p.filter((_,j) => j!==i))} className="text-[#71717a] hover:text-[#f87171] bg-transparent border-none cursor-pointer text-xs px-1">✕</button></div>))}</div>}
              </div></div>
            <button onClick={() => { setStep('choose'); setFiles([]) }} className="bg-transparent border-none text-[#71717a] cursor-pointer text-sm text-left">← Back</button>
          </div>
          <div className="p-3 border-t border-[#27272a] flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 border border-[#3f3f46] rounded-lg bg-transparent text-[#a1a1aa] cursor-pointer text-sm">Cancel</button>
            <button onClick={submit} disabled={!canPublish || uploading} className={'flex-[2] py-2 bg-[#7c3aed] text-white rounded-lg text-sm font-medium border-none ' + (canPublish && !uploading ? 'cursor-pointer hover:bg-[#6d28d9]' : 'opacity-40 cursor-not-allowed')}>{uploading ? progress : 'Publish'}</button>
          </div>
        </>)}

        {step === 'form' && uploadType === 'series' && (<>
          <div className="p-4 flex flex-col gap-3">
            {uploadError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl p-2.5">{uploadError}</div>}
            {mode === 'new' && (<div>
              <label className="block text-xs text-[#71717a] mb-1">Series Title *</label><input value={seriesTitle} onChange={e => setSeriesTitle(e.target.value)} placeholder="My Awesome Series" className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
              <div className="mt-2.5"><label className="block text-xs text-[#71717a] mb-1.5">Thumbnail <span className="text-[#52525b]">(optional, max 5MB)</span></label>
                <div className="flex items-center gap-3"><div className="w-12 h-[72px] rounded-lg bg-[#27272a] border border-dashed border-[#3f3f46] flex items-center justify-center shrink-0 overflow-hidden">{thumbPreview ? <img src={thumbPreview} className="w-full h-full object-cover" alt="" /> : <span className="text-[#52525b] text-lg">📷</span>}</div>
                <div className="flex flex-col gap-1.5"><button type="button" onClick={() => thumbRef.current?.click()} className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] cursor-pointer text-xs">{thumbPreview ? 'Change Image' : 'Choose Image'}</button>
                {thumbPreview && <button type="button" onClick={() => { setThumbFile(null); setThumbPreview(null) }} className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#71717a] cursor-pointer text-xs hover:text-red-400">Remove</button>}</div>
                <input ref={thumbRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={handleThumb} /></div></div>
            </div>)}
            <div><label className="block text-xs text-[#71717a] mb-1">Chapter Title *</label><input value={chapterTitle} onChange={e => setChapterTitle(e.target.value)} placeholder="Chapter 1" className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" /></div>
            <div><label className="block text-xs text-[#71717a] mb-1">Chapter #</label><input type="number" value={chapterNumber} onChange={e => setChapterNumber(parseInt(e.target.value) || 1)} min={1} className="w-20 bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" /></div>
            {mode === 'new' && (<div><label className="block text-xs text-[#71717a] mb-1.5">Format *</label><div className="flex gap-1.5">{['Series', 'One Shot'].map(f => (<button key={f} onClick={() => setFormat(f)} className={'px-4 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ' + (format === f ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>{f}</button>))}</div></div>)}
            <div><div className="flex items-center gap-1 mb-1.5"><label className="text-xs text-[#71717a]">Content Rating *</label><MatureTip mobile={isMobile} /></div>
              <div className="flex gap-1.5">
                <button onClick={() => setRating('General')} className={'px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ' + (rating === 'General' ? 'border-green-500 text-green-400 bg-green-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>General</button>
                <button onClick={() => setRating('Mature')} className={'px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ' + (rating === 'Mature' ? 'border-amber-500 text-amber-400 bg-amber-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>Mature</button>
              </div></div>
            <div><label className="block text-xs text-[#71717a] mb-1.5">Reading Mode</label><div className="flex gap-1.5">
              <button onClick={() => setReadingMode('webtoon')} className={'px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ' + (readingMode === 'webtoon' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>▼ Webtoon</button>
              <button onClick={() => setReadingMode('horizontal')} className={'px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ' + (readingMode === 'horizontal' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>◀▶ Horizontal</button>
            </div></div>
            {mode === 'new' && (<div className="border-t border-[#27272a] pt-3"><label className="block text-xs text-[#71717a] mb-1.5">Genres <span className="text-[#52525b]">(up to 3)</span></label>
              <div className="flex gap-1 flex-wrap mb-3">{GENRES_ALL.map(g => (<button key={g} onClick={() => { const n = new Set(genres); if (n.has(g)) n.delete(g); else if (n.size < 3) n.add(g); else return; setGenres(n) }} className={'px-2.5 py-1 rounded-full text-[0.73rem] cursor-pointer border ' + (genres.has(g) ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : genres.size >= 3 ? 'border-[#27272a] text-[#3f3f46] bg-transparent cursor-not-allowed' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>{g}</button>))}</div>
              <label className="block text-xs text-[#71717a] mb-1">Description <span className="text-[#52525b]">(max 80 words)</span></label>
              <textarea value={desc} onChange={e => { const words = e.target.value.trim().split(/\s+/).filter(Boolean); if (words.length <= 80) setDesc(e.target.value); else setDesc(words.slice(0,80).join(' ')) }} rows={2} placeholder="Brief description..." className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none resize-y font-[inherit] focus:border-[#a855f7]" />
              <div className="text-right text-[0.65rem] text-[#52525b] mt-0.5">{desc.trim().split(/\s+/).filter(Boolean).length}/80 words</div>
            </div>)}
            <div><label className="block text-xs text-[#71717a] mb-1.5">Chapter Pages <span className="text-[#52525b]">(max 10MB each, 150MB total)</span></label>
              <div onClick={() => fileRef.current?.click()} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={'border-2 border-dashed rounded-xl p-6 md:p-10 text-center cursor-pointer transition-colors ' + (dragging ? 'border-[#a855f7] bg-purple-500/10' : 'border-[#3f3f46] hover:border-[#a855f7]')}>
                <input ref={fileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple onChange={handleFiles} />
                <p className="text-sm font-medium text-[#d4d4d8]">{files.length ? files.length + ' page(s) selected' : dragging ? 'Drop pages here!' : 'Click or drag & drop pages'}</p>
                <p className="text-[0.71rem] text-[#71717a] mt-0.5">{files.length ? 'Click or drop to add more' : 'Select or drag multiple images'}</p>
                {files.length > 0 && <div className="mt-2 max-h-[100px] overflow-y-auto text-left" onClick={e => e.stopPropagation()}>{files.map((f, i) => (<div key={i} className="flex items-center gap-2 py-1 border-b border-[#27272a] text-xs"><span className="text-[#52525b] w-5 text-center">{i+1}</span><span className="flex-1 truncate">{f.name}</span><span className="text-[#52525b]">{(f.size/1024).toFixed(0)}KB</span><button onClick={() => setFiles(p => p.filter((_,j) => j!==i))} className="text-[#71717a] hover:text-[#f87171] bg-transparent border-none cursor-pointer text-xs px-1">✕</button></div>))}</div>}
              </div></div>
            <button onClick={() => { setStep('choose'); setFiles([]) }} className="bg-transparent border-none text-[#71717a] cursor-pointer text-sm text-left">← Back</button>
          </div>
          <div className="p-3 border-t border-[#27272a] flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 border border-[#3f3f46] rounded-lg bg-transparent text-[#a1a1aa] cursor-pointer text-sm">Cancel</button>
            <button onClick={submit} disabled={!canPublish || uploading} className={'flex-[2] py-2 bg-[#7c3aed] text-white rounded-lg text-sm font-medium border-none ' + (canPublish && !uploading ? 'cursor-pointer hover:bg-[#6d28d9]' : 'opacity-40 cursor-not-allowed')}>{uploading ? progress : 'Publish Chapter'}</button>
          </div>
        </>)}
      </div>
    </div>
  )
}
