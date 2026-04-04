'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { GRADIENTS } from '@/data/mock'
import { Avatar } from '@/components/Avatar'
import { ShareModal } from '@/components/ShareModal'
import { ReportModal } from '@/components/ReportModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { createAnonClient } from '@/lib/supabase/anon'

function fmtNum(n: number | null | undefined): string {
  if (!n) return '0'; if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString()
}
function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'; if (m < 60) return m+'m ago'; const h = Math.floor(m/60); if (h < 24) return h+'h ago'; return Math.floor(h/24)+'d ago'
}

export default function ReaderPage() {
  const params = useParams()
  const { show } = useToast()
  const { user, profile } = useAuth()
  const slug = params.slug as string
  const supabase = useMemo(() => createClient(), [])
  const anonDb = useMemo(() => createAnonClient(), [])
  const viewIncremented = useRef(false)

  const [series, setSeries] = useState<any>(null)
  const [chapters, setChapters] = useState<any[]>([])
  const [currentCh, setCurrentCh] = useState(1)
  const [chapterViews, setChapterViews] = useState(0)
  const [liked, setLiked] = useState(false)
  const [favorited, setFavorited] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [showChapters, setShowChapters] = useState(false)
  const [showShare, setShowShare] = useState<any>(null)
  const [showReport, setShowReport] = useState<string | null>(null)
  const [showSeriesComments, setShowSeriesComments] = useState(false)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const [fullscreenPage, setFullscreenPage] = useState(0)
  const [commentText, setCommentText] = useState('')
  const [seriesCommentText, setSeriesCommentText] = useState('')
  const [panelFade, setPanelFade] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [seriesComments, setSeriesComments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  useEffect(() => {
    let c = false
    const timeout = setTimeout(() => { if (!c) setLoading(false) }, 10000)
    async function load() {
      try {
        const { data: s } = await anonDb.from('series').select('*, profiles!series_author_id_fkey(display_name, handle, avatar_url)').eq('slug', slug).single() as { data: any }
        if (!s || c) { setLoading(false); return }
        setSeries(s)
        const { data: chs } = await anonDb.from('chapters').select('*').eq('series_id', s.id).order('chapter_number', { ascending: true }) as { data: any[] | null }
        if (c) return
        setChapters(chs ?? [])
        if (chs?.length) { setCurrentCh(chs[chs.length - 1].chapter_number); setChapterViews(chs[chs.length - 1].views ?? 0) }
        const { data: sc } = await anonDb.from('comments').select('*, profiles!comments_user_id_fkey(display_name, handle, avatar_url)').eq('series_id', s.id).is('chapter_id', null).order('created_at', { ascending: false }) as { data: any[] | null }
        if (!c) setSeriesComments(sc ?? [])
        if (user) {
          const [lk, fv, fw] = await Promise.all([
            supabase.from('likes').select('*').eq('user_id', user.id).eq('series_id', s.id).maybeSingle(),
            supabase.from('favorites').select('*').eq('user_id', user.id).eq('series_id', s.id).maybeSingle(),
            supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', s.author_id).maybeSingle(),
          ])
          if (!c) { setLiked(!!lk.data); setFavorited(!!fv.data); setIsFollowing(!!fw.data) }
        }
        if (!viewIncremented.current) {
          viewIncremented.current = true
          await supabase.from('series').update({ total_views: (s.total_views ?? 0) + 1 }).eq('id', s.id)
          if (!c) setSeries((p: any) => p ? { ...p, total_views: (p.total_views ?? 0) + 1 } : p)
        }
        clearTimeout(timeout)
        if (!c) setLoading(false)
      } catch { clearTimeout(timeout); if (!c) setLoading(false) }
    }
    load()
    return () => { c = true }
  }, [slug, user, anonDb, supabase])

  useEffect(() => {
    if (!series || !chapters.length) return
    const ch = chapters.find(c => c.chapter_number === currentCh)
    if (!ch) return
    setChapterViews(ch.views ?? 0)
    anonDb.from('comments').select('*, profiles!comments_user_id_fkey(display_name, handle, avatar_url)').eq('chapter_id', ch.id).order('created_at', { ascending: false })
      .then(({ data }: any) => setComments(data ?? []))
    supabase.from('chapters').update({ views: (ch.views ?? 0) + 1 }).eq('id', ch.id).then(() => {
      setChapterViews(v => v + 1)
      setChapters(prev => prev.map(c => c.id === ch.id ? { ...c, views: (c.views ?? 0) + 1 } : c))
    })
  }, [currentCh, series?.id, chapters.length, supabase])

  // Close fullscreen on Escape
  useEffect(() => {
    if (!showFullscreen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowFullscreen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showFullscreen])

  async function toggleLike() {
    if (!user || !series) { show('Sign in to like!'); return }
    if (liked) {
      await supabase.from('likes').delete().eq('user_id', user.id).eq('series_id', series.id)
      await supabase.from('series').update({ total_likes: Math.max(0, (series.total_likes ?? 1) - 1) }).eq('id', series.id)
      setSeries((s: any) => ({ ...s, total_likes: Math.max(0, (s.total_likes ?? 1) - 1) })); setLiked(false); show('Like removed')
    } else {
      await supabase.from('likes').insert({ user_id: user.id, series_id: series.id })
      await supabase.from('series').update({ total_likes: (series.total_likes ?? 0) + 1 }).eq('id', series.id)
      setSeries((s: any) => ({ ...s, total_likes: (s.total_likes ?? 0) + 1 })); setLiked(true); show('Liked!')
    }
  }

  async function toggleFav() {
    if (!user || !series) { show('Sign in to favorite!'); return }
    if (favorited) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('series_id', series.id); setFavorited(false); show('Removed from Favorites')
    } else {
      await supabase.from('favorites').insert({ user_id: user.id, series_id: series.id }); setFavorited(true); show('Added to Favorites!')
    }
  }

  async function toggleFollow() {
    if (!user || !series) { show('Sign in to follow!'); return }
    if (user.id === series.author_id) { show("Can't follow yourself"); return }
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', series.author_id)
      setIsFollowing(false); show('Unfollowed')
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: series.author_id })
      setIsFollowing(true); show('Following!')
    }
  }

  async function postComment(isSeries: boolean, parentId?: string) {
    if (!user || !series) { show('Sign in to comment!'); return }
    const text = parentId ? replyText : (isSeries ? seriesCommentText : commentText)
    if (!text.trim()) { show('Write something first!'); return }
    const ch = chapters.find(c => c.chapter_number === currentCh)
    const { data, error } = await supabase.from('comments').insert({
      user_id: user.id, body: text.trim(), series_id: series.id,
      chapter_id: isSeries ? null : ch?.id || null,
      parent_id: parentId || null,
    }).select('*, profiles!comments_user_id_fkey(display_name, handle, avatar_url)').single()
    if (error) { show('Failed to post: ' + error.message); return }
    if (data) {
      if (isSeries) { setSeriesComments(prev => [data, ...prev]); setSeriesCommentText('') }
      else { setComments(prev => [data, ...prev]); setCommentText('') }
      if (parentId) { setReplyingTo(null); setReplyText('') }
      show('Comment posted!')
    }
  }

  async function editComment(id: string, isSeries: boolean) {
    if (!editText.trim()) return
    const { error } = await supabase.from('comments').update({ body: editText.trim(), edited_at: new Date().toISOString() }).eq('id', id)
    if (error) { show('Edit failed: ' + error.message); return }
    const updater = (prev: any[]) => prev.map(c => c.id === id ? { ...c, body: editText.trim(), edited_at: new Date().toISOString() } : c)
    if (isSeries) setSeriesComments(updater); else setComments(updater)
    setEditingId(null); setEditText(''); show('Comment edited!')
  }

  async function deleteComment(id: string, isSeries: boolean) {
    if (!confirm('Delete this comment?')) return
    await supabase.from('comments').delete().eq('id', id)
    if (isSeries) setSeriesComments(prev => prev.filter(c => c.id !== id))
    else setComments(prev => prev.filter(c => c.id !== id))
    show('Comment deleted')
  }

  function switchChapter(ch: number) {
    setPanelFade(true); setTimeout(() => { setCurrentCh(ch); setShowChapters(false); setPanelFade(false); show(`Chapter ${ch}`) }, 200)
  }

  function CommentItem({ c, isSeries, isReply }: { c: any; isSeries: boolean; isReply?: boolean }) {
    const isOwn = user?.id === c.user_id
    const replies = (isSeries ? seriesComments : comments).filter(r => r.parent_id === c.id)
    return (
      <div className={`${isReply ? 'ml-6 md:ml-10 border-l-2 border-[#27272a] pl-3' : ''} mb-3`}>
        <div className="flex gap-2">
          {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} className="w-7 h-7 rounded-full object-cover shrink-0" /> : <Avatar name={c.profiles?.display_name || 'User'} size={28} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-xs">{c.profiles?.display_name || 'User'}</span>
              {c.created_at && <span className="text-[0.6rem] text-[#52525b]">{timeAgo(c.created_at)}</span>}
              {c.edited_at && <span className="text-[0.6rem] text-[#52525b] italic">· edited {timeAgo(c.edited_at)}</span>}
            </div>
            {editingId === c.id ? (
              <div className="mt-1">
                <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2}
                  className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-xs outline-none focus:border-[#a855f7] font-[inherit]" />
                <div className="flex gap-1.5 mt-1">
                  <button onClick={() => editComment(c.id, isSeries)} className="text-[0.65rem] text-[#c084fc] bg-transparent border-none cursor-pointer">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-[0.65rem] text-[#71717a] bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="text-[#d4d4d8] text-[0.79rem] mt-0.5">{c.body}</div>
            )}
            <div className="flex gap-2.5 mt-1">
              <button onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyText('') }}
                className="text-[0.65rem] text-[#71717a] bg-transparent border-none cursor-pointer hover:text-[#c084fc]">Reply</button>
              {isOwn && editingId !== c.id && (
                <>
                  <button onClick={() => { setEditingId(c.id); setEditText(c.body) }}
                    className="text-[0.65rem] text-[#71717a] bg-transparent border-none cursor-pointer hover:text-[#c084fc]">Edit</button>
                  <button onClick={() => deleteComment(c.id, isSeries)}
                    className="text-[0.65rem] text-[#71717a] bg-transparent border-none cursor-pointer hover:text-[#f87171]">Delete</button>
                </>
              )}
            </div>
            {replyingTo === c.id && (
              <div className="mt-2 flex gap-1.5">
                <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write a reply..."
                  className="flex-1 bg-[#27272a] border border-[#3f3f46] rounded-lg p-1.5 text-[#e4e4e7] text-xs outline-none focus:border-[#a855f7]"
                  onKeyDown={e => e.key === 'Enter' && postComment(isSeries, c.id)} />
                <button onClick={() => postComment(isSeries, c.id)} className="px-2.5 py-1 bg-[#7c3aed] text-white rounded-lg text-xs border-none cursor-pointer">Reply</button>
              </div>
            )}
          </div>
        </div>
        {replies.map(r => <CommentItem key={r.id} c={r} isSeries={isSeries} isReply />)}
      </div>
    )
  }

  if (loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (!series) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Series not found</div>

  const maxCh = chapters.length > 0 ? chapters[chapters.length - 1].chapter_number : 0
  const currentChData = chapters.find(c => c.chapter_number === currentCh)
  const panels = currentChData?.page_urls?.length ? currentChData.page_urls : null
  const isHorizontal = (currentChData?.reading_mode || series.reading_mode) === 'horizontal'
  const authorName = series.profiles?.display_name || 'Unknown'
  const topLevelComments = comments.filter(c => !c.parent_id)
  const topLevelSeriesComments = seriesComments.filter(c => !c.parent_id)

  return (
    <div id="reader-scroll" className="min-h-screen bg-black">
      <div className="bg-[#09090b]/95 backdrop-blur border-b border-[#27272a] sticky top-0 z-20">
        <div className="flex gap-2 items-start p-3 md:p-4">
          <Link href="/" className="shrink-0 w-8 h-8 flex items-center justify-center bg-[#18181b] border border-[#3f3f46] rounded-lg text-[#a1a1aa] no-underline">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          {series.thumbnail_url ? <img src={series.thumbnail_url} className="hidden md:block w-[54px] h-[76px] rounded-lg shrink-0 object-cover" /> :
            <div className="hidden md:block w-[54px] h-[76px] rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, ${GRADIENTS[0][0]}, ${GRADIENTS[0][1]})` }}></div>}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm md:text-base">{series.title}</div>
            <div className="text-[#c084fc] text-xs mt-0.5">by {authorName}</div>
            <div className="text-xs text-[#a1a1aa] mt-1 line-clamp-2">{series.description}</div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-[0.68rem] text-[#71717a]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span className="text-[#a1a1aa] font-medium">{fmtNum(series.total_views)}</span> Series Views
              </span>
              {maxCh > 0 && <span className="flex items-center gap-1 text-[0.68rem] text-[#71717a]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <span className="text-[#a1a1aa] font-medium">{fmtNum(chapterViews)}</span> Ch. {currentCh} Views
              </span>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 text-xs shrink-0">
            {/* TASK 1: Follow moved above Like */}
            <button onClick={toggleFollow} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm font-medium transition-all ${isFollowing ? 'bg-purple-500/15 border-purple-500/40 text-[#c084fc]' : 'bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-[#6d28d9]'}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              {isFollowing ? 'Following' : 'Follow'}
            </button>
            <button onClick={toggleLike} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm font-medium transition-all ${liked ? 'bg-red-500/15 border-red-500/40 text-[#f87171]' : 'bg-transparent border-[#3f3f46] text-[#a1a1aa] hover:border-red-500/40'}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? '#f87171' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              {fmtNum(series.total_likes)} {liked ? 'Liked' : 'Like'}
            </button>
            <button onClick={toggleFav} className={`flex items-center gap-1 px-2 py-1 rounded-lg border cursor-pointer text-xs transition-all ${favorited ? 'border-yellow-500/40 text-[#fbbf24]' : 'border-[#3f3f46] text-[#a1a1aa] hover:border-yellow-500/40'}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill={favorited ? '#fbbf24' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {favorited ? 'Favorited' : 'Favorite'}
            </button>
            <button onClick={() => setShowShare({ title: `${series.title} on NANOTOON`, url: `${typeof window !== 'undefined' ? window.location.origin : ''}/series/${series.slug}` })}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#3f3f46] cursor-pointer text-xs text-[#a1a1aa] hover:border-[#a855f7]">Share</button>
            <button onClick={() => setShowSeriesComments(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#3f3f46] cursor-pointer text-xs text-[#c084fc] hover:border-[#a855f7]">Comments</button>
            {/* TASK 2: Fullscreen — only in horizontal read mode */}
            {isHorizontal && panels && (
              <button onClick={() => { setFullscreenPage(0); setShowFullscreen(true) }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#3f3f46] cursor-pointer text-xs text-[#a1a1aa] hover:border-[#a855f7]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                Enlarge
              </button>
            )}
            {user && series.author_id === user.id && (
              <Link href={`/series/${series.slug}/edit`} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#3f3f46] text-xs text-[#a1a1aa] hover:border-[#a855f7] no-underline text-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </Link>
            )}
          </div>
        </div>
        {maxCh > 0 && (
          <div className="px-4 pb-3 border-t border-[#27272a] mt-1">
            <button onClick={() => setShowChapters(!showChapters)} className="w-full flex items-center justify-center gap-2 py-1.5 cursor-pointer bg-transparent border-none">
              <span className="text-xs font-medium text-[#e4e4e7]">Chapter {currentCh}</span>
              <span className="text-xs text-[#c084fc]">{showChapters ? '▲' : '▼'}</span>
            </button>
            {showChapters && (
              <div className="max-h-[180px] overflow-y-auto bg-[#0d0d0f] rounded-lg p-1 mt-2">
                {chapters.map(ch => (
                  <button key={ch.id} onClick={() => switchChapter(ch.chapter_number)}
                    className={`w-full p-2 rounded-lg cursor-pointer text-xs flex items-center justify-between border-none ${ch.chapter_number === currentCh ? 'bg-purple-500/15 text-[#c084fc]' : 'bg-transparent text-[#e4e4e7] hover:bg-[#27272a]'}`}>
                    <span>Ch. {ch.chapter_number} — {ch.title}</span>
                    <span className="text-[0.6rem] text-[#52525b]">{fmtNum(ch.views)} views</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`max-w-[800px] mx-auto p-1.5 md:p-3 transition-opacity duration-200 ${panelFade ? 'opacity-0' : 'opacity-100'}`}>
        {panels ? panels.map((url: string, pi: number) => (
          <img key={pi} src={url} className="w-full" style={{ marginTop: pi > 0 ? '-4px' : '0' }} alt={`Page ${pi+1}`} />
        )) : <div className="w-full aspect-[3/4] flex items-center justify-center text-[#52525b] text-sm bg-[#18181b] rounded-xl">{maxCh === 0 ? 'No chapters yet' : 'No pages in this chapter'}</div>}
      </div>

      {maxCh > 0 && (
        <div className="max-w-[800px] mx-auto mt-4 flex gap-2 px-3">
          <button onClick={() => { if (currentCh > 1) switchChapter(currentCh - 1); else show('First chapter!') }}
            className="flex-1 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] flex items-center justify-center gap-1">Prev</button>
          <button onClick={() => { if (currentCh < maxCh) switchChapter(currentCh + 1); else show("You're caught up!") }}
            className="flex-1 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] flex items-center justify-center gap-1">Next</button>
        </div>
      )}

      {/* Chapter Comments */}
      <div className="max-w-[800px] mx-auto mt-7 bg-[#18181b] rounded-2xl p-4 mb-8 mx-3">
        <h3 className="font-medium text-sm mb-3">Chapter {currentCh} Comments ({comments.length})</h3>
        {topLevelComments.length === 0 && <p className="text-[#52525b] text-xs mb-3">No comments yet. Be the first!</p>}
        {topLevelComments.map(c => <CommentItem key={c.id} c={c} isSeries={false} />)}
        <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Write your comment..."
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2.5 h-16 text-[#e4e4e7] text-sm resize-y outline-none focus:border-[#a855f7] font-[inherit]" />
        <div className="flex justify-end mt-2">
          <button onClick={() => postComment(false)} className="px-4 py-2 bg-[#7c3aed] text-white rounded-xl cursor-pointer text-sm font-medium border-none hover:bg-[#6d28d9]">Post Comment</button>
        </div>
      </div>

      {/* Series Comments Overlay */}
      {showSeriesComments && (
        <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center" onClick={() => setShowSeriesComments(false)}>
          <div className="bg-[#18181b] rounded-2xl w-full max-w-[520px] mx-3.5 max-h-[84vh] overflow-hidden flex flex-col border border-[#27272a]" onClick={e => e.stopPropagation()}>
            <div className="p-3.5 border-b border-[#27272a] flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-sm">Series Comments ({seriesComments.length})</h3>
              <button onClick={() => setShowSeriesComments(false)} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa] text-base flex items-center justify-center">×</button>
            </div>
            <div className="p-3.5 overflow-y-auto flex-1">
              {topLevelSeriesComments.length === 0 && <p className="text-[#52525b] text-xs">No comments yet.</p>}
              {topLevelSeriesComments.map(c => <CommentItem key={c.id} c={c} isSeries={true} />)}
            </div>
            <div className="p-3.5 border-t border-[#27272a] shrink-0">
              <textarea value={seriesCommentText} onChange={e => setSeriesCommentText(e.target.value)} placeholder="Write about this series..."
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2.5 h-16 text-[#e4e4e7] text-sm resize-y outline-none focus:border-[#a855f7] font-[inherit]" />
              <button onClick={() => postComment(true)} className="mt-2 px-4 py-2 bg-[#7c3aed] text-white rounded-xl cursor-pointer text-sm font-medium border-none hover:bg-[#6d28d9]">Post</button>
            </div>
          </div>
        </div>
      )}

      {/* TASK 2: Fullscreen horizontal reader — only for horizontal mode */}
      {showFullscreen && panels && (
        <div className="fixed inset-0 bg-black z-[300] flex flex-col" onClick={() => setShowFullscreen(false)}>
          <div className="flex items-center justify-between p-3 shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-[#71717a] text-xs">{fullscreenPage + 1} / {panels.length}</span>
            <button onClick={() => setShowFullscreen(false)} className="w-8 h-8 flex items-center justify-center bg-[#27272a] border border-[#3f3f46] rounded-lg text-[#a1a1aa] cursor-pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden px-2" onClick={e => e.stopPropagation()}>
            <img src={panels[fullscreenPage]} className="max-h-full max-w-full object-contain" alt={`Page ${fullscreenPage + 1}`} />
          </div>
          <div className="flex items-center justify-center gap-4 p-4 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFullscreenPage(p => Math.max(0, p - 1))} disabled={fullscreenPage === 0}
              className={`px-5 py-2.5 border rounded-xl text-sm cursor-pointer bg-transparent ${fullscreenPage === 0 ? 'border-[#27272a] text-[#3f3f46]' : 'border-[#3f3f46] text-[#a1a1aa] hover:border-[#a855f7]'}`}>◀ Prev</button>
            <div className="flex gap-1">
              {panels.map((_: any, i: number) => (
                <button key={i} onClick={() => setFullscreenPage(i)}
                  className={`w-1.5 h-1.5 rounded-full border-none cursor-pointer ${i === fullscreenPage ? 'bg-[#a855f7]' : 'bg-[#3f3f46]'}`} />
              ))}
            </div>
            <button onClick={() => setFullscreenPage(p => Math.min(panels.length - 1, p + 1))} disabled={fullscreenPage === panels.length - 1}
              className={`px-5 py-2.5 border rounded-xl text-sm cursor-pointer bg-transparent ${fullscreenPage === panels.length - 1 ? 'border-[#27272a] text-[#3f3f46]' : 'border-[#3f3f46] text-[#a1a1aa] hover:border-[#a855f7]'}`}>Next ▶</button>
          </div>
        </div>
      )}

      {showShare && <ShareModal title={showShare.title} url={showShare.url} onClose={() => setShowShare(null)} />}
      {showReport && <ReportModal title={showReport} onClose={() => setShowReport(null)} onSubmit={() => show('Report submitted!')} seriesId={series?.id} />}
    </div>
  )
}
