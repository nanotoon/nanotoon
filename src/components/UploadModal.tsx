'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { GENRES_ALL } from '@/data/mock'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB per image
const MAX_TOTAL_SIZE = 30 * 1024 * 1024 // 30 MB total
const MATURE_TOOLTIP_TEXT = `Violence & Dark Themes: We support high-stakes storytelling. Intense graphic violence and realistic blood are permitted in Mature-tagged chapters. However, content that exists solely to depict sadistic torture without narrative purpose, or content that mimics real-world 'snuff,' is prohibited to comply with safety regulations.\n\nNudity & Mature Content — Non-sexual nudity is allowed, provided that genitalia are fully obscured or censored. Pornographic content is strictly prohibited.\n\nProhibited Content:\n• Sexual content involving minors — zero tolerance\n• Instructions for making drugs, explosives, or weapons\n• Content that promotes self-harm or suicide\n• Malware, scams, or phishing\n• Content that incites real-world violence`

// Wraps a promise with a timeout — rejects after ms milliseconds
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ])
}

function MatureTooltip({ isMobile }: { isMobile: boolean }) {
  const [show, setShow] = useState(false)
  if (isMobile) {
    return (
      <>
        <button type="button" onClick={() => setShow(true)}
          className="w-4 h-4 rounded-full border border-[#71717a] text-[0.6rem] text-[#71717a] bg-transparent cursor-pointer flex items-center justify-center shrink-0 ml-1">?</button>
        {show && (
          <div className="fixed inset-0 bg-black/90 z-[400] flex items-center justify-center p-4" onClick={() => setShow(false)}>
            <div className="bg-[#18181b] rounded-2xl max-w-[440px] w-full border border-[#27272a] p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-sm">What is allowed on this site?</h3>
                <button onClick={() => setShow(false)} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa] text-base flex items-center justify-center">×</button>
              </div>
              <p className="text-[#a1a1aa] text-xs leading-relaxed whitespace-pre-line">{MATURE_TOOLTIP_TEXT}</p>
            </div>
          </div>
        )}
      </>
    )
  }
  return (
    <span className="relative group ml-1">
      <span className="w-4 h-4 rounded-full border border-[#71717a] text-[0.6rem] text-[#71717a] inline-flex items-center justify-center cursor-help">?</span>
      <span className="absolute left-6 bottom-0 w-[320px] bg-[#27272a] border border-[#3f3f46] rounded-xl p-3 text-[0.68rem] text-[#a1a1aa] leading-relaxed whitespace-pre-line hidden group-hover:block z-[100] shadow-2xl">
        {MATURE_TOOLTIP_TEXT}
      </span>
    </span>
  )
}

export function UploadModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
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
  const [galleryReadingMode, setGalleryReadingMode] = useState<'horizontal' | 'webtoon'>('horizontal')
  const [files, setFiles] = useState<File[]>([])
  const [thumbFile, setThumbFile] = useState<File | null>(null)
  const [thumbPreview, setThumbPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const thumbRef = useRef<HTMLInputElement>(null)

  // Gallery-specific
  const [galleryTitle, setGalleryTitle] = useState('')
  const [galleryDesc, setGalleryDesc] = useState('')
  const [galleryMature, setGalleryMature] = useState(false)
  const [galleryTags, setGalleryTags] = useState('')

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!user) return
    setLoadingSeries(true)
    supabase.from('series').select('*').eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }: any) => { setMySeries(data ?? []); setLoadingSeries(false) })
  }, [user, supabase])

  useEffect(() => {
    if (!selectedSeriesId) return
    supabase.from('chapters').select('chapter_number').eq('series_id', selectedSeriesId)
      .order('chapter_number', { ascending: false }).limit(1)
      .then(({ data }: any) => setChapterNumber(data?.length > 0 ? data[0].chapter_number + 1 : 1))
  }, [selectedSeriesId, supabase])

  const canPublishSeries = mode === 'existing'
    ? !!(rating && chapterTitle && selectedSeriesId)
    : !!(format && rating && chapterTitle && seriesTitle)

  const canPublishGallery = !!(galleryTitle.trim() && files.length > 0)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const nf = Array.from(e.target.files || []).filter(f => {
      if (!f.type.match(/image\/(jpeg|png|webp)/)) return false
      if (f.size > MAX_FILE_SIZE) { onToast(`${f.name} exceeds 5MB limit — skipped`); return false }
      return true
    })
    const combined = [...files, ...nf].slice(0, 100)
    const totalSize = combined.reduce((sum, f) => sum + f.size, 0)
    if (totalSize > MAX_TOTAL_SIZE) {
      onToast('Total file size exceeds 30MB limit. Remove some files.')
      return
    }
    setFiles(combined)
  }

  function handleThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE_SIZE) { onToast('Thumbnail must be under 5MB'); return }
    setThumbFile(f)
    const r = new FileReader()
    r.onload = ev => setThumbPreview(ev.target?.result as string)
    r.readAsDataURL(f)
  }

  // Ensure the user has a profile record — skip if it fails (don't block upload)
  async function ensureProfile() {
    if (!user) return
    try {
      const { data: existing } = await withTimeout(
        supabase.from('profiles').select('id').eq('id', user.id).maybeSingle(),
        4000,
        'Profile check'
      )
      if (!existing) {
        const displayName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Creator'
        const handle = (user.user_metadata?.handle || user.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '') || `user_${user.id.slice(0, 8)}`).toLowerCase()
        await withTimeout(
          supabase.from('profiles').insert({ id: user.id, display_name: displayName, handle }),
          4000,
          'Profile create'
        )
      }
    } catch {
      // Don't block the upload if profile check fails — the DB will enforce constraints
    }
  }

  async function submitSeries() {
    if (!user || !canPublishSeries) return
    setUploading(true)
    setUploadError('')
    setProgress('Preparing...')

    try {
      // Ensure profile exists (non-blocking — won't hang the upload)
      await ensureProfile()

      let seriesId = selectedSeriesId

      if (mode === 'new') {
        setProgress('Creating series...')
        let thumbnailUrl: string | null = null

        if (thumbFile) {
          setProgress('Uploading thumbnail...')
          const ext = thumbFile.name.split('.').pop() || 'jpg'
          const path = `thumbnails/${user.id}/${Date.now()}.${ext}`
          const { error: thumbErr } = await withTimeout(
            supabase.storage.from('series-assets').upload(path, thumbFile, { upsert: true }),
            30000,
            'Thumbnail upload'
          )
          if (thumbErr) {
            onToast('Thumbnail skipped: ' + thumbErr.message)
          } else {
            thumbnailUrl = supabase.storage.from('series-assets').getPublicUrl(path).data.publicUrl
          }
        }

        const slug = seriesTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
        const { data: ns, error: seriesErr } = await withTimeout(
          supabase.from('series').insert({
            title: seriesTitle,
            slug,
            description: desc || null,
            format: format!,
            genres: Array.from(genres),
            thumbnail_url: thumbnailUrl,
            author_id: user.id,
            reading_mode: readingMode,
          }).select().single(),
          10000,
          'Series create'
        )

        if (seriesErr) {
          const msg = seriesErr.message || 'Series creation failed'
          setUploadError(msg)
          onToast('Error: ' + msg)
          setUploading(false)
          return
        }
        seriesId = ns.id
      }

      // Upload pages
      const pageUrls: string[] = []
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading page ${i + 1}/${files.length}...`)
        const f = files[i]
        const ext = f.name.split('.').pop() || 'jpg'
        const path = `chapters/${seriesId}/${chapterNumber}/${String(i + 1).padStart(3, '0')}.${ext}`
        const { error: pageErr } = await withTimeout(
          supabase.storage.from('series-assets').upload(path, f, { upsert: true }),
          30000,
          `Page ${i + 1} upload`
        )
        if (pageErr) {
          const msg = `Page ${i + 1} failed: ${pageErr.message}`
          setUploadError(msg)
          onToast(msg)
          setUploading(false)
          return
        }
        pageUrls.push(supabase.storage.from('series-assets').getPublicUrl(path).data.publicUrl)
      }

      setProgress('Saving chapter...')
      const { error: chErr } = await withTimeout(
        supabase.from('chapters').insert({
          series_id: seriesId,
          chapter_number: chapterNumber,
          title: chapterTitle,
          rating: rating!,
          page_urls: pageUrls.length > 0 ? pageUrls : null,
          reading_mode: readingMode,
        }),
        10000,
        'Chapter save'
      )

      if (chErr) {
        const msg = chErr.message || 'Chapter save failed'
        setUploadError(msg)
        onToast('Error: ' + msg)
        setUploading(false)
        return
      }

      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', seriesId!)
      onToast('Chapter published successfully! 🎉')
      onClose()
    } catch (err: any) {
      const msg = err?.message || 'Unexpected error during upload'
      setUploadError(msg)
      onToast('Error: ' + msg)
    }
    setUploading(false)
  }

  async function submitGallery() {
    if (!user || !canPublishGallery) return
    setUploading(true)
    setUploadError('')
    setProgress('Preparing gallery...')

    try {
      // Ensure profile exists (non-blocking)
      await ensureProfile()

      // Upload images to storage
      const imageUrls: string[] = []
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading image ${i + 1}/${files.length}...`)
        const f = files[i]
        const ext = f.name.split('.').pop() || 'jpg'
        const path = `gallery/${user.id}/${Date.now()}_${i}.${ext}`
        const { error } = await withTimeout(
          supabase.storage.from('series-assets').upload(path, f, { upsert: true }),
          30000,
          `Image ${i + 1} upload`
        )
        if (error) {
          const msg = `Image ${i + 1} failed: ${error.message}`
          setUploadError(msg)
          onToast(msg)
          setUploading(false)
          return
        }
        imageUrls.push(supabase.storage.from('series-assets').getPublicUrl(path).data.publicUrl)
      }

      // Upload album thumbnail if multiple images
      let thumbnailUrl: string | null = null
      if (files.length > 1 && thumbFile) {
        const ext = thumbFile.name.split('.').pop() || 'jpg'
        const path = `gallery/${user.id}/thumb_${Date.now()}.${ext}`
        const { error } = await withTimeout(
          supabase.storage.from('series-assets').upload(path, thumbFile, { upsert: true }),
          30000,
          'Thumbnail upload'
        )
        if (!error) {
          thumbnailUrl = supabase.storage.from('series-assets').getPublicUrl(path).data.publicUrl
        }
      }

      setProgress('Saving gallery entry...')
      const { error: gErr } = await withTimeout(
        supabase.from('gallery').insert({
          title: galleryTitle.trim(),
          description: galleryDesc || null,
          image_urls: imageUrls,
          thumbnail_url: thumbnailUrl,
          author_id: user.id,
          is_mature: galleryMature,
          tags: galleryTags ? galleryTags.split(',').map(t => t.trim()).filter(Boolean) : [],
          reading_mode: galleryReadingMode,
        }),
        10000,
        'Gallery save'
      )

      if (gErr) {
        const msg = gErr.message || 'Gallery save failed'
        setUploadError(msg)
        onToast('Error: ' + msg)
        setUploading(false)
        return
      }

      onToast('Gallery artwork published! 🎉')
      onClose()
    } catch (err: any) {
      const msg = err?.message || 'Unexpected error during upload'
      setUploadError(msg)
      onToast('Error: ' + msg)
    }
    setUploading(false)
  }

  function submit() {
    if (uploadType === 'gallery') submitGallery()
    else submitSeries()
  }

  const canPublish = uploadType === 'gallery' ? canPublishGallery : canPublishSeries
  const isAlbum = files.length > 1

  return (
    <div className="fixed inset-0 bg-black/90 z-[200] flex items-start justify-center overflow-y-auto p-4 pb-10">
      <div className={`bg-[#18181b] rounded-2xl w-full border border-[#27272a] max-w-[600px] md:max-w-[700px] ${step === 'form' ? 'md:min-h-[calc(100vh-80px)]' : ''}`}>
        <div className="p-3.5 border-b border-[#27272a] flex justify-between items-center sticky top-0 bg-[#18181b] z-10 rounded-t-2xl">
          <h2 className="font-semibold text-base">
            {step === 'form' && uploadType === 'gallery' ? 'Upload to Gallery' :
             step === 'form' && mode === 'existing' ? 'Add Chapter' :
             step === 'form' ? 'New Series' : 'Upload'}
          </h2>
          <button onClick={onClose} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa] text-base flex items-center justify-center hover:text-white">×</button>
        </div>

        {step === 'choose' && (
          <div className="p-4 md:p-6 flex flex-col gap-3 md:gap-4">
            <h3 className="text-sm text-[#71717a] mb-1">Series</h3>
            <button onClick={() => { setUploadType('series'); setMode('new'); setStep('form'); setReadingMode('webtoon') }}
              className="w-full p-4 md:p-6 border border-[#3f3f46] rounded-xl bg-transparent text-left cursor-pointer hover:border-[#a855f7] transition-colors">
              <div className="font-semibold text-sm md:text-lg mb-0.5">📁 Create a new series</div>
              <div className="text-xs md:text-base text-[#71717a]">Upload the first chapter of a brand new series</div>
            </button>
            <button onClick={() => { setUploadType('series'); setMode('existing'); setStep('existing'); setReadingMode('webtoon') }}
              className="w-full p-4 md:p-6 border border-[#3f3f46] rounded-xl bg-transparent text-left cursor-pointer hover:border-[#a855f7] transition-colors">
              <div className="font-semibold text-sm md:text-lg mb-0.5">➕ Add chapter to existing series</div>
              <div className="text-xs md:text-base text-[#71717a]">Upload a new chapter to one of your current series</div>
            </button>
            <h3 className="text-sm text-[#71717a] mt-2 mb-1">Gallery</h3>
            <button onClick={() => { setUploadType('gallery'); setStep('form'); setGalleryReadingMode('horizontal') }}
              className="w-full p-4 md:p-6 border border-[#3f3f46] rounded-xl bg-transparent text-left cursor-pointer hover:border-[#a855f7] transition-colors">
              <div className="font-semibold text-sm md:text-lg mb-0.5">🎨 Upload to Gallery</div>
              <div className="text-xs md:text-base text-[#71717a]">Single artwork or album — no category tags needed</div>
            </button>
          </div>
        )}

        {step === 'existing' && (
          <div className="p-4">
            <p className="text-sm text-[#71717a] mb-2.5">Select your series:</p>
            {loadingSeries ? (
              <p className="text-[#52525b] text-xs py-4 text-center">Loading your series...</p>
            ) : mySeries.length === 0 ? (
              <p className="text-[#52525b] text-xs py-4 text-center">No series yet. Create one first!</p>
            ) : (
              <div className="flex flex-col gap-2 mb-3.5">
                {mySeries.map(s => (
                  <div key={s.id}
                    onClick={() => { setSelectedSeriesId(s.id); setReadingMode(s.reading_mode || 'webtoon'); setTimeout(() => setStep('form'), 150) }}
                    className={`p-2.5 border rounded-lg cursor-pointer flex items-center gap-2.5 transition-all ${selectedSeriesId === s.id ? 'border-[#a855f7] bg-purple-500/10' : 'border-[#3f3f46] hover:border-[#a855f7]'}`}>
                    {s.thumbnail_url
                      ? <img src={s.thumbnail_url} className="w-8 h-12 rounded-md shrink-0 object-cover" alt={s.title} />
                      : <div className="w-8 h-12 rounded-md shrink-0 bg-[#27272a] flex items-center justify-center text-lg">📖</div>}
                    <div>
                      <div className="font-medium text-sm">{s.title}</div>
                      <div className="text-[0.71rem] text-[#71717a]">{s.format}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setStep('choose')} className="bg-transparent border-none text-[#71717a] cursor-pointer text-sm">← Back</button>
          </div>
        )}

        {step === 'form' && uploadType === 'gallery' && (
          <>
            <div className="p-4 flex flex-col gap-3">
              {uploadError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl p-2.5">{uploadError}</div>}

              <div>
                <label className="block text-xs text-[#71717a] mb-1">Title *</label>
                <input value={galleryTitle} onChange={e => setGalleryTitle(e.target.value)} placeholder="My Artwork"
                  className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
              </div>

              <div>
                <label className="block text-xs text-[#71717a] mb-1">Description</label>
                <textarea value={galleryDesc} onChange={e => setGalleryDesc(e.target.value)} rows={2} placeholder="About this artwork..."
                  className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none resize-y font-[inherit] focus:border-[#a855f7]" />
              </div>

              <div>
                <label className="block text-xs text-[#71717a] mb-1">Tags <span className="text-[#52525b]">(comma separated)</span></label>
                <input value={galleryTags} onChange={e => setGalleryTags(e.target.value)} placeholder="fantasy, dark, portrait"
                  className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-[#71717a]">Mature Content</label>
                <MatureTooltip isMobile={isMobile} />
                <button onClick={() => setGalleryMature(!galleryMature)}
                  className={`w-9 h-5 rounded-full border-none cursor-pointer relative shrink-0 ${galleryMature ? 'bg-amber-500' : 'bg-[#3f3f46]'}`}>
                  <span className={`absolute top-[1.5px] w-4 h-4 bg-white rounded-full transition-all ${galleryMature ? 'right-[2px]' : 'left-[1.5px]'}`}></span>
                </button>
              </div>

              <div>
                <label className="block text-xs text-[#71717a] mb-1.5">Reading Mode</label>
                <div className="flex gap-1.5">
                  <button onClick={() => setGalleryReadingMode('horizontal')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${galleryReadingMode === 'horizontal' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>
                    ◀▶ Horizontal Pages
                  </button>
                  <button onClick={() => setGalleryReadingMode('webtoon')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${galleryReadingMode === 'webtoon' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>
                    ▼ Webtoon Scroll
                  </button>
                </div>
              </div>

              {isAlbum && (
                <div>
                  <label className="block text-xs text-[#71717a] mb-1.5">Album Thumbnail <span className="text-[#52525b]">(optional, max 5MB)</span></label>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-[72px] rounded-lg bg-[#27272a] border border-dashed border-[#3f3f46] flex items-center justify-center shrink-0 overflow-hidden">
                      {thumbPreview ? <img src={thumbPreview} className="w-full h-full object-cover" alt="thumb" /> : <span className="text-[#52525b] text-lg">📷</span>}
                    </div>
                    <button type="button" onClick={() => thumbRef.current?.click()}
                      className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] cursor-pointer text-xs hover:border-[#a855f7]">
                      {thumbPreview ? 'Change' : 'Choose Image'}
                    </button>
                    <input ref={thumbRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={handleThumb} />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-[#71717a] mb-1.5">Images <span className="text-[#52525b]">(JPG, PNG, WebP — max 5MB each, 30MB total)</span></label>
                <div onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-[#3f3f46] rounded-xl p-6 md:p-10 text-center cursor-pointer hover:border-[#a855f7] transition-colors">
                  <input ref={fileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple onChange={handleFiles} />
                  <p className="text-sm font-medium text-[#d4d4d8]">{files.length ? `${files.length} image${files.length > 1 ? 's' : ''} selected` : 'Click to select images'}</p>
                  <p className="text-[0.71rem] text-[#71717a] mt-0.5">{files.length ? 'Click to add more' : 'You can select multiple images at once'}</p>
                  {files.length > 0 && (
                    <div className="mt-2 max-h-[120px] overflow-y-auto text-left" onClick={e => e.stopPropagation()}>
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 border-b border-[#27272a] text-xs">
                          <span className="text-[#52525b] w-5 text-center shrink-0">{i + 1}</span>
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-[#52525b] shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                          <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))}
                            className="text-[#71717a] hover:text-[#f87171] bg-transparent border-none cursor-pointer text-xs px-1">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button onClick={() => { setStep('choose'); setFiles([]) }} className="bg-transparent border-none text-[#71717a] cursor-pointer text-sm text-left">← Back</button>
            </div>
            <div className="p-3 border-t border-[#27272a] flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 border border-[#3f3f46] rounded-lg bg-transparent text-[#a1a1aa] cursor-pointer text-sm">Cancel</button>
              <button onClick={submit} disabled={!canPublish || uploading}
                className={`flex-[2] py-2 bg-[#7c3aed] text-white rounded-lg text-sm font-medium border-none ${canPublish && !uploading ? 'cursor-pointer hover:bg-[#6d28d9]' : 'opacity-40 cursor-not-allowed'}`}>
                {uploading ? progress : 'Publish'}
              </button>
            </div>
          </>
        )}

        {step === 'form' && uploadType === 'series' && (
          <>
            <div className="p-4 flex flex-col gap-3">
              {uploadError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl p-2.5">{uploadError}</div>}

              {mode === 'new' && (
                <div>
                  <label className="block text-xs text-[#71717a] mb-1">Series Title *</label>
                  <input value={seriesTitle} onChange={e => setSeriesTitle(e.target.value)} placeholder="My Awesome Series"
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
                  <div className="mt-2.5">
                    <label className="block text-xs text-[#71717a] mb-1.5">Thumbnail <span className="text-[#52525b]">(optional, max 5MB)</span></label>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-[72px] rounded-lg bg-[#27272a] border border-dashed border-[#3f3f46] flex items-center justify-center shrink-0 overflow-hidden">
                        {thumbPreview ? <img src={thumbPreview} className="w-full h-full object-cover" alt="thumb" /> : <span className="text-[#52525b] text-lg">📷</span>}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <button type="button" onClick={() => thumbRef.current?.click()}
                          className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] cursor-pointer text-xs hover:border-[#a855f7]">
                          {thumbPreview ? 'Change Image' : 'Choose Image'}
                        </button>
                        {thumbPreview && (
                          <button type="button" onClick={() => { setThumbFile(null); setThumbPreview(null) }}
                            className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#71717a] cursor-pointer text-xs hover:border-red-500 hover:text-red-400">
                            Remove
                          </button>
                        )}
                      </div>
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

              {mode === 'new' && (
                <div>
                  <label className="block text-xs text-[#71717a] mb-1.5">Format *</label>
                  <div className="flex gap-1.5">
                    {['Series', 'One Shot'].map(f => (
                      <button key={f} onClick={() => setFormat(f)}
                        className={`px-4 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${format === f ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <label className="block text-xs text-[#71717a]">Content Rating *</label>
                  <MatureTooltip isMobile={isMobile} />
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setRating('General')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${rating === 'General' ? 'border-green-500 text-green-400 bg-green-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>
                    General
                  </button>
                  <button onClick={() => setRating('Mature')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${rating === 'Mature' ? 'border-amber-500 text-amber-400 bg-amber-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>
                    Mature
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#71717a] mb-1.5">Reading Mode</label>
                <div className="flex gap-1.5">
                  <button onClick={() => setReadingMode('webtoon')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${readingMode === 'webtoon' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>
                    ▼ Webtoon (Vertical Scroll)
                  </button>
                  <button onClick={() => setReadingMode('horizontal')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ${readingMode === 'horizontal' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>
                    ◀▶ Horizontal Pages
                  </button>
                </div>
              </div>

              {mode === 'new' && (
                <div className="border-t border-[#27272a] pt-3">
                  <label className="block text-xs text-[#71717a] mb-1.5">Genres <span className="text-[#52525b]">(pick up to 3)</span></label>
                  <div className="flex gap-1 flex-wrap mb-3">
                    {GENRES_ALL.map(g => (
                      <button key={g} onClick={() => {
                        const n = new Set(genres)
                        if (n.has(g)) n.delete(g); else if (n.size < 3) n.add(g); else return
                        setGenres(n)
                      }} className={`px-2.5 py-1 rounded-full text-[0.73rem] cursor-pointer border ${genres.has(g) ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : genres.size >= 3 ? 'border-[#27272a] text-[#3f3f46] bg-transparent cursor-not-allowed' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                  <label className="block text-xs text-[#71717a] mb-1">Description</label>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Brief description of your series..."
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none resize-y font-[inherit] focus:border-[#a855f7]" />
                </div>
              )}

              <div>
                <label className="block text-xs text-[#71717a] mb-1.5">Chapter Pages <span className="text-[#52525b]">(JPG, PNG, WebP — max 5MB each, 30MB total)</span></label>
                <div onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-[#3f3f46] rounded-xl p-6 md:p-10 text-center cursor-pointer hover:border-[#a855f7] transition-colors">
                  <input ref={fileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple onChange={handleFiles} />
                  <p className="text-sm font-medium text-[#d4d4d8]">
                    {files.length ? `${files.length} page${files.length > 1 ? 's' : ''} selected` : 'Click to select pages'}
                  </p>
                  <p className="text-[0.71rem] text-[#71717a] mt-0.5">
                    {files.length ? 'Click to add more' : 'You can select multiple images at once'}
                  </p>
                  {files.length > 0 && (
                    <div className="mt-2 max-h-[120px] overflow-y-auto text-left" onClick={e => e.stopPropagation()}>
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 border-b border-[#27272a] text-xs">
                          <span className="text-[#52525b] w-5 text-center shrink-0">{i + 1}</span>
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-[#52525b] shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                          <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))}
                            className="text-[#71717a] hover:text-[#f87171] bg-transparent border-none cursor-pointer text-xs px-1">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button onClick={() => { setStep('choose'); setFiles([]) }} className="bg-transparent border-none text-[#71717a] cursor-pointer text-sm text-left">← Back</button>
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
