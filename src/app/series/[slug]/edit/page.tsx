'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { GENRES_ALL, GRADIENTS } from '@/data/mock'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createWriteClient, getAuthUserId, ensureFreshSession } from '@/lib/supabase/write'
import { createAnonClient } from '@/lib/supabase/anon'

export default function EditSeriesPage() {
  const params = useParams()
  const router = useRouter()
  const { show } = useToast()
  const { user } = useAuth()
  const slug = params.slug as string
  const anonDb = useMemo(() => createAnonClient(), [])
  const thumbRef = useRef<HTMLInputElement>(null)

  const [series, setSeries] = useState<any>(null)
  const [chapters, setChapters] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [format, setFormat] = useState('Series')
  const [genres, setGenres] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [thumbPreview, setThumbPreview] = useState<string | null>(null)
  const [newThumbFile, setNewThumbFile] = useState<File | null>(null)
  const [readingMode, setReadingMode] = useState<'webtoon' | 'horizontal'>('webtoon')
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>('ltr')

  // Expanded chapter for editing
  const [expandedChId, setExpandedChId] = useState<string | null>(null)
  const [editChTitle, setEditChTitle] = useState('')
  const [editChRating, setEditChRating] = useState('General')
  const [savingCh, setSavingCh] = useState(false)

  // Add chapter form
  const [showAddChapter, setShowAddChapter] = useState(false)
  const [newChTitle, setNewChTitle] = useState('')
  const [newChNumber, setNewChNumber] = useState(1)
  const [newChRating, setNewChRating] = useState('General')
  const [newChFiles, setNewChFiles] = useState<File[]>([])
  const [addingChapter, setAddingChapter] = useState(false)
  const chFileRef = useRef<HTMLInputElement>(null)
  const addPageRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function fetch() {
      const { data: s } = await anonDb.from('series').select('*').eq('slug', slug).single() as { data: any }
      if (!s) { setLoading(false); return }
      setSeries(s)
      setTitle(s.title)
      setDesc(s.description || '')
      setFormat(s.format)
      setGenres(new Set(s.genres || []))
      setThumbPreview(s.thumbnail_url)
      setReadingMode(s.reading_mode || 'webtoon')
      setReadingDirection(s.reading_direction || 'ltr')
      const { data: chs } = await anonDb.from('chapters').select('*').eq('series_id', s.id).order('chapter_number', { ascending: true }) as { data: any[] | null }
      setChapters(chs ?? [])
      if (chs && chs.length > 0) setNewChNumber(chs[chs.length - 1].chapter_number + 1)
      setLoading(false)
    }
    fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  function expandChapter(ch: any) {
    if (expandedChId === ch.id) {
      setExpandedChId(null)
      return
    }
    setExpandedChId(ch.id)
    setEditChTitle(ch.title)
    setEditChRating(ch.rating)
  }

  // ─── Series Thumbnail ───────────────────────────────────────
  async function handleThumbChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { show('Thumbnail must be under 5MB'); return }
    setNewThumbFile(f)
    const r = new FileReader()
    r.onload = ev => setThumbPreview(ev.target?.result as string)
    r.readAsDataURL(f)
  }

  // ─── Save Series Info ───────────────────────────────────────
  async function save() {
    await ensureFreshSession()
    if (!series || !user) return
    setSaving(true)
    let thumbnailUrl = series.thumbnail_url
    if (newThumbFile) {
      const ext = newThumbFile.name.split('.').pop()
      const path = `thumbnails/${user.id}/${Date.now()}.${ext}`
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
    const { error } = await (createWriteClient() as any).from('series').update({
      title, description: desc, format, genres: Array.from(genres),
      thumbnail_url: thumbnailUrl, reading_mode: readingMode,
      reading_direction: readingMode === 'horizontal' ? readingDirection : 'ltr',
      updated_at: new Date().toISOString()
    }).eq('id', series.id)
    if (error) show('Save failed: ' + error.message)
    else {
      setSeries((s: any) => ({ ...s, title, description: desc, format, genres: Array.from(genres), thumbnail_url: thumbnailUrl }))
      setNewThumbFile(null)
      show('Changes saved!')
      setTimeout(() => window.location.reload(), 600)
    }
    setSaving(false)
  }

  // ─── Delete Series ──────────────────────────────────────────
  async function deleteSeries() {
    await ensureFreshSession()
    if (!series) return
    if (!confirm('Delete this series and all its chapters?')) return
    if (!confirm('This cannot be undone. Are you sure?')) return
    const wc = createWriteClient()
    if (!wc) { show('Not logged in'); return }
    // Delete chapters first (FK constraint blocks series delete if chapters exist)
    await (wc as any).from('chapters').delete().eq('series_id', series.id)
    // Delete related data
    await (wc as any).from('likes').delete().eq('series_id', series.id)
    await (wc as any).from('favorites').delete().eq('series_id', series.id)
    await (wc as any).from('comments').delete().eq('series_id', series.id)
    // Now delete the series
    const { error } = await (wc as any).from('series').delete().eq('id', series.id)
    if (error) { show('Delete failed: ' + error.message); return }
    show('Series deleted')
    router.push('/profile')
  }

  // ─── Save Chapter Edits ─────────────────────────────────────
  async function saveChapter(chId: string) {
    await ensureFreshSession()
    setSavingCh(true)
    const { error } = await (createWriteClient() as any).from('chapters').update({
      title: editChTitle, rating: editChRating
    }).eq('id', chId)
    if (error) show('Failed: ' + error.message)
    else {
      setChapters(prev => prev.map(c => c.id === chId ? { ...c, title: editChTitle, rating: editChRating } : c))
      show('Chapter updated!')
      setTimeout(() => window.location.reload(), 600)
    }
    setSavingCh(false)
  }

  // ─── Delete Chapter ─────────────────────────────────────────
  async function deleteChapter(id: string) {
    if (!confirm('Delete this chapter and all its pages?')) return
    const { error } = await (createWriteClient() as any).from('chapters').delete().eq('id', id)
    if (error) { show('Failed: ' + error.message); return }
    setChapters(prev => prev.filter(c => c.id !== id))
    if (expandedChId === id) setExpandedChId(null)
    show('Chapter deleted'); setTimeout(() => window.location.reload(), 600)
  }

  // ─── Move Chapter ───────────────────────────────────────────
  async function moveChapter(id: string, direction: 'up' | 'down') {
    const idx = chapters.findIndex(c => c.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= chapters.length) return
    const chA = chapters[idx]
    const chB = chapters[swapIdx]
    await Promise.all([
      (createWriteClient() as any).from('chapters').update({ chapter_number: chB.chapter_number }).eq('id', chA.id),
      (createWriteClient() as any).from('chapters').update({ chapter_number: chA.chapter_number }).eq('id', chB.id),
    ])
    const updated = [...chapters]
    const tempNum = updated[idx].chapter_number
    updated[idx] = { ...updated[idx], chapter_number: updated[swapIdx].chapter_number }
    updated[swapIdx] = { ...updated[swapIdx], chapter_number: tempNum }
    updated.sort((a, b) => a.chapter_number - b.chapter_number)
    setChapters(updated)
    show('Chapter order updated'); setTimeout(() => window.location.reload(), 600)
  }

  // ─── Page Management ────────────────────────────────────────
  async function deletePage(chId: string, pageIndex: number) {
    const ch = chapters.find(c => c.id === chId)
    if (!ch || !ch.page_urls) return
    if (ch.page_urls.length <= 2) { show('Chapters must have at least 2 pages'); return }
    if (!confirm(`Delete page ${pageIndex + 1}?`)) return
    const newUrls = ch.page_urls.filter((_: any, i: number) => i !== pageIndex)
    const { error } = await (createWriteClient() as any).from('chapters').update({ page_urls: newUrls.length > 0 ? newUrls : null }).eq('id', chId)
    if (error) { show('Failed: ' + error.message); return }
    setChapters(prev => prev.map(c => c.id === chId ? { ...c, page_urls: newUrls.length > 0 ? newUrls : null } : c))
    show('Page deleted'); setTimeout(() => window.location.reload(), 600)
  }

  async function movePage(chId: string, fromIdx: number, direction: 'up' | 'down') {
    const ch = chapters.find(c => c.id === chId)
    if (!ch || !ch.page_urls) return
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1
    if (toIdx < 0 || toIdx >= ch.page_urls.length) return
    const newUrls = [...ch.page_urls]
    const temp = newUrls[fromIdx]
    newUrls[fromIdx] = newUrls[toIdx]
    newUrls[toIdx] = temp
    const { error } = await (createWriteClient() as any).from('chapters').update({ page_urls: newUrls }).eq('id', chId)
    if (error) { show('Failed: ' + error.message); return }
    setChapters(prev => prev.map(c => c.id === chId ? { ...c, page_urls: newUrls } : c))
    show('Page order updated'); setTimeout(() => window.location.reload(), 600)
  }

  async function addPagesToChapter(chId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).filter(f => f.type.match(/image\/(jpeg|png|webp)/))
    if (files.length === 0) return
    const ch = chapters.find(c => c.id === chId)
    if (!ch || !series) return

    show(`Uploading ${files.length} page(s)...`)
    const existingUrls = ch.page_urls || []
    const newUrls: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop()
      const pageNum = existingUrls.length + i + 1
      const path = `chapters/${series.id}/${ch.chapter_number}/${String(pageNum).padStart(3, '0')}_${Date.now()}.${ext}`
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('path', path)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok || json.error) { show(`Page ${i + 1} failed: ${json.error || 'Upload error'}`); return }
        newUrls.push(json.url)
      } catch (e: any) { show(`Page ${i + 1} failed: ${e.message}`); return }
    }

    const allUrls = [...existingUrls, ...newUrls]
    const { error } = await (createWriteClient() as any).from('chapters').update({ page_urls: allUrls }).eq('id', chId)
    if (error) { show('Failed to save: ' + error.message); return }
    setChapters(prev => prev.map(c => c.id === chId ? { ...c, page_urls: allUrls } : c))
    show(`${files.length} page(s) added!`); setTimeout(() => window.location.reload(), 600)
  }

  // ─── Add New Chapter ────────────────────────────────────────
  async function addChapter() {
    await ensureFreshSession()
    if (!series || !user || !newChTitle.trim()) { show('Chapter title is required'); return }
    if (newChFiles.length < 2) { show('Please select at least 2 pages for the chapter'); return }
    const totalSize = newChFiles.reduce((s, f) => s + f.size, 0)
    if (totalSize > 150 * 1024 * 1024) { show('Total pages exceed 150MB'); return }
    setAddingChapter(true)
    const pageUrls: string[] = []
    for (let i = 0; i < newChFiles.length; i++) {
      const file = newChFiles[i]
      const ext = file.name.split('.').pop()
      const path = `chapters/${series.id}/${newChNumber}/${String(i + 1).padStart(3, '0')}.${ext}`
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('path', path)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok || json.error) { show(`Page ${i + 1} failed: ${json.error || 'Upload error'}`); setAddingChapter(false); return }
        pageUrls.push(json.url)
      } catch (e: any) { show(`Page ${i + 1} failed: ${e.message}`); setAddingChapter(false); return }
    }
    const { data: ch, error } = await (createWriteClient() as any).from('chapters').insert({
      series_id: series.id, chapter_number: newChNumber, title: newChTitle.trim(),
      rating: newChRating, page_urls: pageUrls.length > 0 ? pageUrls : null,
    }).select().single()
    if (error) { show('Failed: ' + error.message); setAddingChapter(false); return }
    await (createWriteClient() as any).from('series').update({ updated_at: new Date().toISOString() }).eq('id', series.id)
    setChapters(prev => [...prev, ch].sort((a, b) => a.chapter_number - b.chapter_number))
    setNewChTitle(''); setNewChNumber(newChNumber + 1); setNewChFiles([]); setNewChRating('General')
    setShowAddChapter(false); setAddingChapter(false)
    show('Chapter added!')
    setTimeout(() => window.location.reload(), 600)
  }

  if (loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (!series) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Series not found</div>

  return (
    <div className="max-w-[680px] mx-auto px-4 py-6">
      <Link href="/profile" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back to Profile
      </Link>
      <h1 className="text-xl font-bold text-[#c084fc] mb-1.5">Edit Series</h1>

      {/* ─── Series Info ─────────────────────────────────────── */}
      <div className="bg-[#18181b] rounded-2xl p-4 mb-3.5 flex flex-col gap-3.5">
        <div>
          <label className="block text-xs text-[#71717a] mb-1.5">Series Thumbnail</label>
          <div className="flex items-center gap-2.5">
            <div className="w-14 h-[84px] rounded-lg shrink-0 overflow-hidden bg-[#27272a] flex items-center justify-center">
              {thumbPreview ? <img src={thumbPreview} className="w-full h-full object-cover" /> :
                <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${GRADIENTS[0][0]}, ${GRADIENTS[0][1]})` }}></div>}
            </div>
            <div>
              <button onClick={() => thumbRef.current?.click()} className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] cursor-pointer text-xs">Change Thumbnail</button>
              <p className="text-[0.65rem] text-[#52525b] mt-1">Max 5MB</p>
            </div>
            <input ref={thumbRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={handleThumbChange} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-1">Series Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] outline-none text-sm focus:border-[#a855f7]" />
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-1.5">Format</label>
          <div className="flex gap-1.5">
            {['Series','One Shot'].map(f => (
              <button key={f} onClick={() => setFormat(f)} className={`px-4 py-1.5 rounded-lg cursor-pointer text-xs font-medium border transition-all ${format === f ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent hover:border-[#a855f7]'}`}>{f}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-1.5">Reading Mode</label>
          <div className="flex gap-1.5">
            <button onClick={() => setReadingMode('webtoon')} className={`px-4 py-1.5 rounded-lg cursor-pointer text-xs font-medium border transition-all ${readingMode === 'webtoon' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent hover:border-[#a855f7]'}`}>▼ Webtoon</button>
            <button onClick={() => setReadingMode('horizontal')} className={`px-4 py-1.5 rounded-lg cursor-pointer text-xs font-medium border transition-all ${readingMode === 'horizontal' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent hover:border-[#a855f7]'}`}>◀▶ Horizontal</button>
          </div>
        </div>
        {readingMode === 'horizontal' && (<div>
          <label className="block text-xs text-[#71717a] mb-1.5">Reading Direction</label>
          <div className="flex gap-1.5">
            <button onClick={() => setReadingDirection('ltr')} className={`px-4 py-1.5 rounded-lg cursor-pointer text-xs font-medium border transition-all ${readingDirection === 'ltr' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent hover:border-[#a855f7]'}`}>→ Left to Right</button>
            <button onClick={() => setReadingDirection('rtl')} className={`px-4 py-1.5 rounded-lg cursor-pointer text-xs font-medium border transition-all ${readingDirection === 'rtl' ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#71717a] bg-transparent hover:border-[#a855f7]'}`}>← Right to Left</button>
          </div>
        </div>)}
        <div>
          <label className="block text-xs text-[#71717a] mb-1.5">Genres <span className="text-[#52525b]">(max 3)</span></label>
          <div className="flex gap-1 flex-wrap">
            {GENRES_ALL.map(g => (
              <button key={g} onClick={() => { const n = new Set(genres); if (n.has(g)) n.delete(g); else if (n.size < 3) n.add(g); else return; setGenres(n) }}
                className={`px-2.5 py-1 rounded-full text-[0.73rem] cursor-pointer border transition-all ${genres.has(g) ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : genres.size >= 3 ? 'border-[#27272a] text-[#3f3f46] bg-transparent cursor-not-allowed' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>{g}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-1">Description <span className="text-[#52525b]">(max 80 words)</span></label>
          <textarea value={desc} onChange={e => { const words = e.target.value.trim().split(/\s+/).filter(Boolean); if (words.length <= 80) setDesc(e.target.value); else setDesc(words.slice(0,80).join(' ')) }} rows={3} className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] outline-none text-sm resize-y font-[inherit] focus:border-[#a855f7]" />
          <div className="text-right text-[0.65rem] text-[#52525b] mt-0.5">{desc.trim().split(/\s+/).filter(Boolean).length}/80 words</div>
        </div>
      </div>

      {/* ─── Chapters ────────────────────────────────────────── */}
      <h3 className="font-semibold text-sm mb-2">Chapters ({chapters.length})</h3>
      {chapters.length === 0 && <p className="text-[#52525b] text-xs mb-4">No chapters yet.</p>}

      {chapters.map((ch, idx) => {
        const isExpanded = expandedChId === ch.id
        const pages = ch.page_urls || []

        return (
          <div key={ch.id} className="mb-2">
            {/* Chapter header — clickable */}
            <div
              onClick={() => expandChapter(ch)}
              className={`bg-[#27272a] rounded-lg p-2.5 flex items-center gap-2 cursor-pointer hover:bg-[#303033] flex-wrap ${isExpanded ? 'rounded-b-none border-b border-[#3f3f46]' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">Ch. {ch.chapter_number} — {ch.title}</div>
                <div className="text-[0.7rem] text-[#71717a] mt-0.5">
                  <span className={ch.rating === 'Mature' ? 'text-[#fbbf24]' : 'text-[#a1a1aa]'}>{ch.rating}</span>
                  <span className="text-[#52525b]"> · {pages.length} pages</span>
                  {ch.views > 0 && <span className="text-[#52525b]"> · {ch.views} views</span>}
                </div>
              </div>
              <span className="text-[#71717a] text-xs shrink-0">{isExpanded ? '▲ Close' : '▼ Edit'}</span>
            </div>

            {/* Expanded chapter editor */}
            {isExpanded && (
              <div className="bg-[#1e1e21] rounded-b-lg p-3 border border-t-0 border-[#3f3f46]">
                {/* Edit title & rating */}
                <div className="flex flex-col md:flex-row gap-2 mb-3">
                  <div className="flex-1">
                    <label className="block text-[0.65rem] text-[#71717a] mb-0.5">Chapter Title</label>
                    <input value={editChTitle} onChange={e => setEditChTitle(e.target.value)}
                      className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-1.5 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] text-[#71717a] mb-0.5">Rating</label>
                    <div className="flex gap-1">
                      <button onClick={() => setEditChRating('General')} className={`px-2 py-1 rounded text-xs border ${editChRating === 'General' ? 'border-green-500 text-green-400 bg-green-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>General</button>
                      <button onClick={() => setEditChRating('Mature')} className={`px-2 py-1 rounded text-xs border ${editChRating === 'Mature' ? 'border-amber-500 text-amber-400 bg-amber-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>Mature</button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 mb-3">
                  <button onClick={() => saveChapter(ch.id)} disabled={savingCh}
                    className="px-3 py-1 bg-[#7c3aed] text-white rounded-lg text-xs border-none cursor-pointer hover:bg-[#6d28d9] disabled:opacity-50">
                    {savingCh ? 'Saving...' : 'Save Chapter'}
                  </button>
                  <button onClick={() => moveChapter(ch.id, 'up')} disabled={idx === 0}
                    className={`px-2 py-1 border border-[#3f3f46] rounded-lg text-xs cursor-pointer bg-transparent ${idx === 0 ? 'opacity-30 text-[#52525b]' : 'text-[#a1a1aa] hover:border-[#a855f7]'}`}>▲ Move Up</button>
                  <button onClick={() => moveChapter(ch.id, 'down')} disabled={idx === chapters.length - 1}
                    className={`px-2 py-1 border border-[#3f3f46] rounded-lg text-xs cursor-pointer bg-transparent ${idx === chapters.length - 1 ? 'opacity-30 text-[#52525b]' : 'text-[#a1a1aa] hover:border-[#a855f7]'}`}>▼ Move Down</button>
                  <button onClick={() => deleteChapter(ch.id)}
                    className="px-2 py-1 border border-red-500/30 rounded-lg text-xs text-[#f87171] cursor-pointer bg-transparent hover:bg-red-500/10">Delete</button>
                </div>

                {/* Pages grid */}
                <label className="block text-[0.65rem] text-[#71717a] mb-1.5">Pages ({pages.length})</label>
                {pages.length === 0 ? (
                  <p className="text-[#52525b] text-xs mb-2">No pages. Add some below.</p>
                ) : (
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-1.5 mb-2">
                    {pages.map((url: string, pi: number) => (
                      <div key={pi} className="relative group">
                        <img src={url} className="w-full aspect-[3/4] object-cover rounded bg-[#27272a]" alt={`Page ${pi + 1}`} />
                        <div className="absolute top-0 left-0 bg-black/70 text-[0.55rem] text-white px-1 rounded-br">{pi + 1}</div>
                        {/* Controls overlay on hover */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 rounded">
                          {pi > 0 && (
                            <button onClick={() => movePage(ch.id, pi, 'up')}
                              className="w-5 h-5 bg-[#27272a] border border-[#52525b] rounded text-[0.6rem] text-white cursor-pointer flex items-center justify-center">◀</button>
                          )}
                          <button onClick={() => deletePage(ch.id, pi)}
                            className="w-5 h-5 bg-red-600/80 border-none rounded text-[0.6rem] text-white cursor-pointer flex items-center justify-center">✕</button>
                          {pi < pages.length - 1 && (
                            <button onClick={() => movePage(ch.id, pi, 'down')}
                              className="w-5 h-5 bg-[#27272a] border border-[#52525b] rounded text-[0.6rem] text-white cursor-pointer flex items-center justify-center">▶</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Mobile-friendly page controls */}
                <div className="md:hidden text-[0.6rem] text-[#52525b] mb-2">Tap and hold pages on desktop to move/delete</div>

                {/* Add more pages */}
                <button onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.jpg,.jpeg,.png,.webp'
                  input.multiple = true
                  input.onchange = (e) => addPagesToChapter(ch.id, e as any)
                  input.click()
                }}
                  className="w-full py-1.5 border border-dashed border-[#3f3f46] rounded-lg bg-transparent text-[#71717a] cursor-pointer text-xs hover:border-[#a855f7] hover:text-[#c084fc]">
                  + Add Pages
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* ─── Add New Chapter ──────────────────────────────────── */}
      {!showAddChapter ? (
        <button onClick={() => setShowAddChapter(true)}
          className="w-full py-2 border border-dashed border-[#3f3f46] rounded-lg bg-transparent text-[#71717a] cursor-pointer text-sm mb-4 hover:border-[#a855f7] hover:text-[#c084fc]">
          + Add New Chapter
        </button>
      ) : (
        <div className="bg-[#18181b] rounded-xl p-3.5 mb-4 border border-[#27272a]">
          <h4 className="font-medium text-sm mb-2.5">Add Chapter</h4>
          <div className="flex gap-2 mb-2">
            <div className="w-20">
              <label className="block text-[0.65rem] text-[#71717a] mb-0.5">Ch. #</label>
              <input type="number" value={newChNumber} onChange={e => setNewChNumber(parseInt(e.target.value) || 1)} min={1}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-1.5 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
            </div>
            <div className="flex-1">
              <label className="block text-[0.65rem] text-[#71717a] mb-0.5">Title</label>
              <input value={newChTitle} onChange={e => setNewChTitle(e.target.value)} placeholder="Chapter title..."
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-1.5 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" />
            </div>
          </div>
          <div className="mb-2">
            <label className="block text-[0.65rem] text-[#71717a] mb-0.5">Rating</label>
            <div className="flex gap-1.5">
              <button onClick={() => setNewChRating('General')} className={`px-2.5 py-1 rounded-lg cursor-pointer text-xs border ${newChRating === 'General' ? 'border-green-500 text-green-400 bg-green-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>General</button>
              <button onClick={() => setNewChRating('Mature')} className={`px-2.5 py-1 rounded-lg cursor-pointer text-xs border ${newChRating === 'Mature' ? 'border-amber-500 text-amber-400 bg-amber-500/[0.08]' : 'border-[#3f3f46] text-[#71717a] bg-transparent'}`}>Mature</button>
            </div>
          </div>
          <div className="mb-3">
            <button onClick={() => chFileRef.current?.click()}
              className="px-3 py-1.5 border border-dashed border-[#3f3f46] rounded-lg bg-transparent text-[#71717a] cursor-pointer text-xs hover:border-[#a855f7]">
              {newChFiles.length > 0 ? `${newChFiles.length} pages selected` : '+ Select page images'}
            </button>
            <input ref={chFileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple
              onChange={e => setNewChFiles(Array.from(e.target.files || []).filter(f => f.type.match(/image\/(jpeg|png|webp)/)).slice(0, 100))} />
          </div>
          <div className="flex gap-2">
            <button onClick={addChapter} disabled={addingChapter || !newChTitle.trim()}
              className={`flex-1 py-1.5 bg-[#7c3aed] text-white rounded-lg text-xs font-medium border-none ${!addingChapter && newChTitle.trim() ? 'cursor-pointer hover:bg-[#6d28d9]' : 'opacity-40 cursor-not-allowed'}`}>
              {addingChapter ? 'Uploading...' : 'Add Chapter'}
            </button>
            <button onClick={() => { setShowAddChapter(false); setNewChFiles([]); setNewChTitle('') }}
              className="px-3 py-1.5 border border-[#3f3f46] rounded-lg bg-transparent text-[#71717a] cursor-pointer text-xs">Cancel</button>
          </div>
        </div>
      )}

      {/* ─── Save / Delete ────────────────────────────────────── */}
      <div className="flex gap-2 mb-4">
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-[#7c3aed] text-white rounded-xl cursor-pointer text-sm font-medium border-none hover:bg-[#6d28d9] disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button onClick={deleteSeries} className="flex-1 py-2.5 border border-[#ef4444] text-[#f87171] bg-transparent rounded-xl cursor-pointer text-sm hover:bg-red-500/10">Delete Series</button>
      </div>
    </div>
  )
}
