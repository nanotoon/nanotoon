'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createWriteClient, getAuthUserId, ensureFreshSession } from '@/lib/supabase/write'
import { createAnonClient } from '@/lib/supabase/anon'

const MAX_FILE_GALLERY = 10 * 1024 * 1024   // 10MB per file (multi)
const MAX_SINGLE_GALLERY = 5 * 1024 * 1024  // 5MB for single image
const MAX_TOTAL_GALLERY = 50 * 1024 * 1024  // 50MB total

export default function EditGalleryPage() {
  const params = useParams()
  const router = useRouter()
  const { show } = useToast()
  const { user } = useAuth()
  const id = params.id as string
  const anonDb = useMemo(() => createAnonClient(), [])
  const thumbRef = useRef<HTMLInputElement>(null)
  const addImgRef = useRef<HTMLInputElement>(null)

  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable fields
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [isMature, setIsMature] = useState(false)
  const [readingMode, setReadingMode] = useState('horizontal')

  // Images
  const [existingImages, setExistingImages] = useState<string[]>([])
  const [newImageFiles, setNewImageFiles] = useState<File[]>([])

  // Thumbnail (albums only)
  const [thumbPreview, setThumbPreview] = useState<string | null>(null)
  const [newThumbFile, setNewThumbFile] = useState<File | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await anonDb.from('gallery').select('*').eq('id', id).single() as { data: any }
      if (!data) { setLoading(false); return }
      if (user && data.author_id !== user.id) { router.push('/gallery/' + id); return }
      setItem(data)
      setTitle(data.title)
      setDesc(data.description || '')
      setIsMature(data.is_mature ?? false)
      setReadingMode(data.reading_mode || 'horizontal')
      setExistingImages(data.image_urls || [])
      setThumbPreview(data.thumbnail_url || null)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user])

  // ─── Thumbnail ──────────────────────────────────────────────
  function handleThumbChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { show('Thumbnail must be under 5MB'); return }
    setNewThumbFile(f)
    const r = new FileReader()
    r.onload = ev => setThumbPreview(ev.target?.result as string)
    r.readAsDataURL(f)
  }

  // ─── Image reorder / delete ─────────────────────────────────
  function moveExisting(idx: number, dir: 'up' | 'down') {
    const to = dir === 'up' ? idx - 1 : idx + 1
    if (to < 0 || to >= existingImages.length) return
    const arr = [...existingImages]
    const tmp = arr[idx]; arr[idx] = arr[to]; arr[to] = tmp
    setExistingImages(arr)
  }

  function deleteExisting(idx: number) {
    if (!confirm(`Delete image ${idx + 1}?`)) return
    setExistingImages(prev => prev.filter((_, i) => i !== idx))
  }

  function removeNewFile(idx: number) {
    setNewImageFiles(prev => prev.filter((_, i) => i !== idx))
  }

  // ─── Add new images ─────────────────────────────────────────
  function handleAddImages(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []).filter(f => f.type.match(/image\/(jpeg|png|webp)/))
    if (picked.length === 0) return
    const bad = picked.filter(f => f.size > MAX_FILE_GALLERY)
    if (bad.length > 0) { show(bad[0].name + ' exceeds 10MB'); return }
    setNewImageFiles(prev => [...prev, ...picked])
    // reset input so same file can be re-added if needed
    e.target.value = ''
  }

  // ─── Save ───────────────────────────────────────────────────
  async function save() {
    await ensureFreshSession()
    if (!item || !user) return
    if (!title.trim()) { show('Title is required'); return }

    const totalImages = existingImages.length + newImageFiles.length
    if (totalImages === 0) { show('At least one image is required'); return }

    // Size validation on new files only
    const newTotalSize = newImageFiles.reduce((s, f) => s + f.size, 0)
    if (totalImages === 1 && newImageFiles.length === 1 && newImageFiles[0].size > MAX_SINGLE_GALLERY) {
      show('Single image must be under 5MB'); return
    }
    if (totalImages > 1 && newTotalSize > MAX_TOTAL_GALLERY) {
      show('New images exceed 50MB total limit'); return
    }

    setSaving(true)

    // Upload thumbnail if changed
    let thumbnailUrl = item.thumbnail_url
    if (newThumbFile) {
      const path = `gallery/${user.id}/thumb_${Date.now()}.webp`
      try {
        const fd = new FormData()
        fd.append('file', newThumbFile)
        fd.append('path', path)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok || json.error) { show('Thumbnail upload failed: ' + (json.error || 'Unknown error')); setSaving(false); return }
        thumbnailUrl = json.url
      } catch (e: any) { show('Thumbnail upload failed: ' + e.message); setSaving(false); return }
    }
    // If album switched to single image, clear thumbnail
    if (totalImages === 1) thumbnailUrl = null

    // Upload new image files
    const uploadedUrls: string[] = []
    for (let i = 0; i < newImageFiles.length; i++) {
      const file = newImageFiles[i]
      const path = `gallery/${user.id}/${Date.now()}_${i}.webp`
      show(`Uploading image ${i + 1}/${newImageFiles.length}...`)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('path', path)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok || json.error) { show(`Image ${i + 1} failed: ${json.error || 'Upload error'}`); setSaving(false); return }
        uploadedUrls.push(json.url)
      } catch (e: any) { show(`Image ${i + 1} failed: ${e.message}`); setSaving(false); return }
    }

    const finalImages = [...existingImages, ...uploadedUrls]

    const { error } = await (createWriteClient() as any).from('gallery').update({
      title: title.trim(),
      description: desc || null,
      is_mature: isMature,
      reading_mode: readingMode,
      image_urls: finalImages,
      thumbnail_url: thumbnailUrl,
    }).eq('id', id)

    if (error) { show('Save failed: ' + error.message); setSaving(false); return }
    setItem((p: any) => ({ ...p, title: title.trim(), description: desc || null, is_mature: isMature, reading_mode: readingMode, image_urls: finalImages, thumbnail_url: thumbnailUrl }))
    setExistingImages(finalImages)
    setNewImageFiles([])
    setNewThumbFile(null)
    show('Changes saved!')
    setTimeout(() => window.location.reload(), 600)
  }

  // ─── Delete gallery ─────────────────────────────────────────
  async function deleteGallery() {
    await ensureFreshSession()
    if (!item) return
    if (!confirm('Delete this gallery item permanently?')) return
    if (!confirm('This cannot be undone. Are you sure?')) return
    await (createWriteClient() as any).from('gallery').delete().eq('id', id)
    show('Gallery item deleted')
    router.push('/profile')
  }

  if (loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (!item) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Not found</div>

  const totalImages = existingImages.length + newImageFiles.length
  const isAlbum = totalImages > 1

  return (
    <div className="max-w-[680px] mx-auto px-4 py-6">
      <Link href={`/gallery/${id}`} className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back to Gallery
      </Link>
      <h1 className="text-xl font-bold text-[#c084fc] mb-1.5">Edit Gallery</h1>

      {/* ─── Info section ────────────────────────────────────── */}
      <div className="bg-[#18181b] rounded-2xl p-4 mb-3.5 flex flex-col gap-3.5">

        {/* Thumbnail — albums only */}
        {isAlbum && (
          <div>
            <label className="block text-xs text-[#71717a] mb-1.5">Album Thumbnail</label>
            <div className="flex items-center gap-2.5">
              <div className="w-14 h-[84px] rounded-lg shrink-0 overflow-hidden bg-[#27272a] flex items-center justify-center">
                {thumbPreview
                  ? <img src={thumbPreview} className="w-full h-full object-cover" />
                  : <span className="text-[#52525b] text-lg">📷</span>}
              </div>
              <div>
                <button onClick={() => thumbRef.current?.click()} className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] cursor-pointer text-xs">
                  {thumbPreview ? 'Change Thumbnail' : 'Choose Thumbnail'}
                </button>
                <p className="text-[0.65rem] text-[#52525b] mt-1">Max 5MB</p>
              </div>
              <input ref={thumbRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={handleThumbChange} />
            </div>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-xs text-[#71717a] mb-1">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] outline-none text-sm focus:border-[#a855f7]" />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-[#71717a] mb-1">Description <span className="text-[#52525b]">(max 80 words)</span></label>
          <textarea value={desc} onChange={e => { const words = e.target.value.trim().split(/\s+/).filter(Boolean); if (words.length <= 80) setDesc(e.target.value); else setDesc(words.slice(0, 80).join(' ')) }} rows={3} className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] outline-none text-sm resize-y font-[inherit] focus:border-[#a855f7]" />
          <div className="text-right text-[0.65rem] text-[#52525b] mt-0.5">{desc.trim().split(/\s+/).filter(Boolean).length}/80 words</div>
        </div>

        {/* Mature toggle */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-[#71717a]">Mature</label>
          <button onClick={() => setIsMature(!isMature)} className={'w-9 h-5 rounded-full border-none cursor-pointer relative shrink-0 ' + (isMature ? 'bg-amber-500' : 'bg-[#3f3f46]')}>
            <span className={'absolute top-[1.5px] w-4 h-4 bg-white rounded-full transition-all ' + (isMature ? 'right-[2px]' : 'left-[1.5px]')}></span>
          </button>
        </div>

        {/* Reading mode — albums only */}
        {isAlbum && (
          <div>
            <label className="block text-xs text-[#71717a] mb-1.5">Reading Mode</label>
            <div className="flex gap-1.5">
              <button onClick={() => setReadingMode('horizontal')} className={'px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ' + (readingMode === 'horizontal' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>◀▶ Horizontal</button>
              <button onClick={() => setReadingMode('webtoon')} className={'px-3 py-1.5 rounded-lg cursor-pointer text-xs font-medium border ' + (readingMode === 'webtoon' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent')}>▼ Webtoon</button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Existing images grid ─────────────────────────────── */}
      <h3 className="font-semibold text-sm mb-2">Images ({totalImages})</h3>
      {existingImages.length > 0 && (
        <div className="grid grid-cols-4 md:grid-cols-6 gap-1.5 mb-3">
          {existingImages.map((url, idx) => (
            <div key={idx} className="relative group">
              <img src={url} className="w-full aspect-[3/4] object-cover rounded bg-[#27272a]" alt={`Image ${idx + 1}`} />
              <div className="absolute top-0 left-0 bg-black/70 text-[0.55rem] text-white px-1 rounded-br">{idx + 1}</div>
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 rounded">
                {idx > 0 && (
                  <button onClick={() => moveExisting(idx, 'up')} className="w-5 h-5 bg-[#27272a] border border-[#52525b] rounded text-[0.6rem] text-white cursor-pointer flex items-center justify-center">◀</button>
                )}
                <button onClick={() => deleteExisting(idx)} className="w-5 h-5 bg-red-600/80 border-none rounded text-[0.6rem] text-white cursor-pointer flex items-center justify-center">✕</button>
                {idx < existingImages.length - 1 && (
                  <button onClick={() => moveExisting(idx, 'down')} className="w-5 h-5 bg-[#27272a] border border-[#52525b] rounded text-[0.6rem] text-white cursor-pointer flex items-center justify-center">▶</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── New files pending upload ─────────────────────────── */}
      {newImageFiles.length > 0 && (
        <div className="mb-3">
          <p className="text-[0.65rem] text-[#71717a] mb-1.5">Pending upload ({newImageFiles.length})</p>
          <div className="flex flex-col gap-1">
            {newImageFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 bg-[#27272a] rounded-lg px-2 py-1.5 text-xs">
                <span className="flex-1 truncate text-[#d4d4d8]">{f.name}</span>
                <span className="text-[#52525b] shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                <button onClick={() => removeNewFile(i)} className="text-[#71717a] hover:text-[#f87171] bg-transparent border-none cursor-pointer text-xs px-1">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Add images button ────────────────────────────────── */}
      <button onClick={() => addImgRef.current?.click()} className="w-full py-1.5 border border-dashed border-[#3f3f46] rounded-lg bg-transparent text-[#71717a] cursor-pointer text-xs hover:border-[#a855f7] hover:text-[#c084fc] mb-4">
        + Add Images
      </button>
      <input ref={addImgRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple onChange={handleAddImages} />

      {/* ─── Size hint ───────────────────────────────────────── */}
      <p className="text-[0.65rem] text-[#52525b] mb-4">
        {totalImages === 1 ? 'Single image: max 5MB' : 'Multiple images: max 10MB per file, 50MB total'}
      </p>

      {/* ─── Save / Delete ────────────────────────────────────── */}
      <div className="flex gap-2 mb-4">
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-[#7c3aed] text-white rounded-xl cursor-pointer text-sm font-medium border-none hover:bg-[#6d28d9] disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button onClick={deleteGallery} className="flex-1 py-2.5 border border-[#ef4444] text-[#f87171] bg-transparent rounded-xl cursor-pointer text-sm hover:bg-red-500/10">Delete Gallery</button>
      </div>
    </div>
  )
}
