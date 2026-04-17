'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { GRADIENTS } from '@/data/mock'
import { Avatar } from '@/components/Avatar'
import { ShareModal } from '@/components/ShareModal'
import { ReportModal } from '@/components/ReportModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { createWriteClient, getAuthUserId, ensureFreshSession } from '@/lib/supabase/write'

function fmtNum(n: number | null | undefined): string {
  if (!n) return '0'; if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString()
}
function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'; if (m < 60) return m+'m ago'; const h = Math.floor(m/60); if (h < 24) return h+'h ago'; return Math.floor(h/24)+'d ago'
}

// FIX: CommentItem must be defined at module scope (NOT inside ReaderPage). When it
// was nested inside the parent component, every keystroke in the reply input caused
// a new function identity on re-render, which made React unmount & remount the input,
// stealing focus after every character. Moving it out preserves stable identity.
type CommentItemProps = {
  c: any
  isSeries: boolean
  isReply?: boolean
  userId: string | undefined
  comments: any[]
  seriesComments: any[]
  editingId: string | null
  editText: string
  setEditText: (v: string) => void
  setEditingId: (v: string | null) => void
  editComment: (id: string, isSeries: boolean) => void
  replyingTo: string | null
  setReplyingTo: (v: string | null) => void
  replyText: string
  setReplyText: (v: string) => void
  postComment: (isSeries: boolean, parentId?: string) => void
  toggleCommentLike: (commentId: string, currentCount: number) => void
  likedComments: Set<string>
  deleteComment: (id: string, isSeries: boolean) => void
  highlightedCommentId: string | null
}

function CommentItem(props: CommentItemProps) {
  const { c, isSeries, isReply, userId, comments, seriesComments, editingId, editText, setEditText, setEditingId, editComment, replyingTo, setReplyingTo, replyText, setReplyText, postComment, toggleCommentLike, likedComments, deleteComment, highlightedCommentId } = props
  const isOwn = userId === c.user_id
  const replies = (isSeries ? seriesComments : comments).filter(r => r.parent_id === c.id)
  const isHighlighted = highlightedCommentId === c.id
  return (
    <div id={`comment-${c.id}`} className={`${isReply ? 'ml-6 md:ml-10 border-l-2 border-[#27272a] pl-3' : ''} mb-3 rounded-lg transition-colors duration-500 ${isHighlighted ? 'bg-purple-500/15 ring-2 ring-purple-500/50 px-2 py-1.5 -mx-2' : ''}`}>
      <div className="flex gap-2">
        {c.profiles?.handle ? (
          <Link href={`/user/${c.profiles.handle}`} className="shrink-0 no-underline">
            {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} className="w-7 h-7 rounded-full object-cover shrink-0" /> : <Avatar name={c.profiles?.display_name || 'User'} size={28} />}
          </Link>
        ) : (
          c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} className="w-7 h-7 rounded-full object-cover shrink-0" /> : <Avatar name={c.profiles?.display_name || 'User'} size={28} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {c.profiles?.handle ? (
              <Link href={`/user/${c.profiles.handle}`} className="font-medium text-xs text-[#e4e4e7] hover:text-[#c084fc] no-underline">{c.profiles?.display_name || 'User'}</Link>
            ) : (
              <span className="font-medium text-xs">{c.profiles?.display_name || 'User'}</span>
            )}
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
            <button onClick={() => toggleCommentLike(c.id, c.likes_count ?? 0)}
              className={`text-[0.65rem] bg-transparent border-none cursor-pointer flex items-center gap-0.5 ${likedComments.has(c.id) ? 'text-[#f87171]' : 'text-[#71717a] hover:text-[#f87171]'}`}>
              ♥ {c.likes_count ?? 0}
            </button>
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
      {replies.map(r => <CommentItem key={r.id} {...props} c={r} isReply />)}
    </div>
  )
}

export default function ReaderPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { show } = useToast()
  const { user, profile } = useAuth()
  const slug = params.slug as string
  const anonDb = useMemo(() => createAnonClient(), [])
  const viewIncremented = useRef(false)

  // Query params for jumping to a specific comment from a notification
  const targetCommentId = searchParams.get('comment') || searchParams.get('seriesComment')
  const targetChapterNum = searchParams.get('chapter')
  const isSeriesCommentTarget = !!searchParams.get('seriesComment')
  const [highlightedComment, setHighlightedComment] = useState<string | null>(null)
  const commentJumpHandled = useRef(false)

  const [series, setSeries] = useState<any>(null)
  const [chapters, setChapters] = useState<any[]>([])
  const [currentCh, setCurrentCh] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
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
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set())
  const [headerHidden, setHeaderHidden] = useState(false)

  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // Webtoon mode: hide header on scroll down, show on scroll to top
  useEffect(() => {
    const isWebtoon = series && !((chapters.find(c => c.chapter_number === currentCh)?.reading_mode || series.reading_mode) === 'horizontal')
    if (!isWebtoon) {
      setHeaderHidden(false)
      document.documentElement.classList.remove('webtoon-scrolled')
      return
    }
    const onScroll = () => {
      if (window.scrollY > 50) {
        setHeaderHidden(true)
        document.documentElement.classList.add('webtoon-scrolled')
      } else {
        setHeaderHidden(false)
        document.documentElement.classList.remove('webtoon-scrolled')
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.documentElement.classList.remove('webtoon-scrolled')
    }
  }, [series, chapters, currentCh])

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
          const uid = getAuthUserId()
          if (uid) {
            const [lk, fv, fw, cl] = await Promise.all([
              anonDb.from('likes').select('*').eq('user_id', uid).eq('series_id', s.id).maybeSingle(),
              anonDb.from('favorites').select('*').eq('user_id', uid).eq('series_id', s.id).maybeSingle(),
              anonDb.from('follows').select('*').eq('follower_id', uid).eq('following_id', s.author_id).maybeSingle(),
              anonDb.from('comment_likes').select('comment_id').eq('user_id', uid),
            ]) as any[]
            if (!c) { setLiked(!!lk.data); setFavorited(!!fv.data); setIsFollowing(!!fw.data); setLikedComments(new Set((cl.data ?? []).map((x: any) => x.comment_id))) }
          }
        }
        // Read real like count from likes table (series.total_likes can be stale)
        const { count: realLikes } = await anonDb.from('likes').select('*', { count: 'exact', head: true }).eq('series_id', s.id) as any
        if (!c && realLikes != null) setSeries((p: any) => p ? { ...p, total_likes: realLikes } : p)
        if (!viewIncremented.current) {
          viewIncremented.current = true
          const wc = createWriteClient()
          if (wc) await (wc as any).from('series').update({ total_views: (s.total_views ?? 0) + 1 }).eq('id', s.id)
          if (!c) setSeries((p: any) => p ? { ...p, total_views: (p.total_views ?? 0) + 1 } : p)
        }
        clearTimeout(timeout)
        if (!c) setLoading(false)
      } catch { clearTimeout(timeout); if (!c) setLoading(false) }
    }
    load()
    return () => { c = true }
  }, [slug, user, anonDb])

  useEffect(() => {
    if (!series || !chapters.length) return
    const ch = chapters.find(c => c.chapter_number === currentCh)
    if (!ch) return
    setChapterViews(ch.views ?? 0)
    anonDb.from('comments').select('*, profiles!comments_user_id_fkey(display_name, handle, avatar_url)').eq('chapter_id', ch.id).order('created_at', { ascending: false })
      .then(({ data }: any) => setComments(data ?? []))
    ;const _wc = createWriteClient(); if (_wc) (_wc as any).from('chapters').update({ views: (ch.views ?? 0) + 1 }).eq('id', ch.id).then(() => {
      setChapterViews(v => v + 1)
      setChapters(prev => prev.map(c => c.id === ch.id ? { ...c, views: (c.views ?? 0) + 1 } : c))
    })
  }, [currentCh, series?.id, chapters.length, anonDb])

  // FIX: when arriving via a notification URL with ?chapter=N, switch to that chapter
  // once chapters are loaded. Only fires once per page load (commentJumpHandled ref).
  useEffect(() => {
    if (!targetChapterNum || !chapters.length || commentJumpHandled.current) return
    const n = parseInt(targetChapterNum)
    if (!isNaN(n) && chapters.some(c => c.chapter_number === n) && n !== currentCh) {
      setCurrentCh(n)
    }
  }, [chapters.length, targetChapterNum]) // eslint-disable-line

  // FIX: jump to specific comment when coming from a notification.
  //   - If ?seriesComment=ID → open the series comments modal, scroll & highlight it
  //   - If ?comment=ID (chapter comment) → scroll the inline chapter comments section & highlight it
  // Runs after the relevant comments are loaded. Uses a ref to ensure it only fires once.
  useEffect(() => {
    if (!targetCommentId || commentJumpHandled.current) return
    const relevantList = isSeriesCommentTarget ? seriesComments : comments
    if (!relevantList.some(c => c.id === targetCommentId)) return  // not loaded yet

    commentJumpHandled.current = true
    if (isSeriesCommentTarget) setShowSeriesComments(true)

    // Delay slightly so modal/DOM is painted before scrolling
    setTimeout(() => {
      const el = document.getElementById(`comment-${targetCommentId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedComment(targetCommentId)
        setTimeout(() => setHighlightedComment(null), 2500)
      }
    }, 250)
  }, [comments, seriesComments, targetCommentId, isSeriesCommentTarget])

  // Fullscreen keyboard nav
  useEffect(() => {
    if (!showFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFullscreen(false)
      const ch = chapters.find(c => c.chapter_number === currentCh)
      const maxP = ch?.page_urls?.length ? ch.page_urls.length - 1 : 0
      const rtl = (ch?.reading_direction || series?.reading_direction) === 'rtl'
      const prev = rtl ? 'ArrowRight' : 'ArrowLeft'
      const next = rtl ? 'ArrowLeft' : 'ArrowRight'
      if (e.key === prev) setFullscreenPage(p => Math.max(0, p - 1))
      if (e.key === next) setFullscreenPage(p => Math.min(maxP, p + 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showFullscreen, currentCh, chapters, series])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent, maxPages: number, rtl?: boolean) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      const goNext = rtl ? dx > 0 : dx < 0
      if (goNext) setFullscreenPage(p => Math.min(maxPages - 1, p + 1))
      else setFullscreenPage(p => Math.max(0, p - 1))
    }
    touchStart.current = null
  }, [])

  async function toggleLike() {
    await ensureFreshSession()
    if (!user || !series) { show('Sign in to like!'); return }
    const uid = getAuthUserId()
    const wc = createWriteClient()
    if (!uid || !wc) { show('Sign in to like!'); return }
    if (liked) {
      const { error } = await (wc as any).from('likes').delete().eq('user_id', uid).eq('series_id', series.id)
      if (error) { show('Error: ' + error.message); return }
      setLiked(false)
      const { count } = await anonDb.from('likes').select('*', { count: 'exact', head: true }).eq('series_id', series.id) as any
      setSeries((s: any) => ({ ...s, total_likes: count ?? Math.max(0, (s.total_likes ?? 1) - 1) }))
      show('Like removed')
    } else {
      const { error } = await (wc as any).from('likes').insert({ user_id: uid, series_id: series.id })
      if (error) { show('Error: ' + error.message); return }
      setLiked(true)
      const { count } = await anonDb.from('likes').select('*', { count: 'exact', head: true }).eq('series_id', series.id) as any
      setSeries((s: any) => ({ ...s, total_likes: count ?? (s.total_likes ?? 0) + 1 }))
      // FIX: notify series author on like (skip self-likes)
      if (series.author_id && series.author_id !== uid) {
        (wc as any).from('notifications').insert({
          user_id: series.author_id, actor_id: uid, type: 'like',
          message: `liked "${series.title}"`, series_id: series.id,
        }).then(() => {}, () => {})
      }
      show('Liked!')
    }
  }

  async function toggleFav() {
    await ensureFreshSession()
    if (!user || !series) { show('Sign in to favorite!'); return }
    const uid = getAuthUserId()
    const wc = createWriteClient()
    if (!uid || !wc) { show('Sign in to favorite!'); return }
    if (favorited) {
      const { error } = await (wc as any).from('favorites').delete().eq('user_id', uid).eq('series_id', series.id)
      if (error) { show('Error: ' + error.message); return }
      setFavorited(false); show('Removed from Favorites')
    } else {
      const { error } = await (wc as any).from('favorites').insert({ user_id: uid, series_id: series.id })
      if (error) { show('Error: ' + error.message); return }
      setFavorited(true); show('Added to Favorites!')
    }
  }

  async function toggleFollow() {
    await ensureFreshSession()
    if (!user || !series) { show('Sign in to follow!'); return }
    const uid = getAuthUserId()
    const wc = createWriteClient()
    if (!uid || !wc) { show('Sign in to follow!'); return }
    if (uid === series.author_id) { show("Can't follow yourself"); return }
    if (isFollowing) {
      const { error } = await (wc as any).from('follows').delete().eq('follower_id', uid).eq('following_id', series.author_id)
      if (error) { show('Error: ' + error.message); return }
      setIsFollowing(false); show('Unfollowed')
    } else {
      const { error } = await (wc as any).from('follows').insert({ follower_id: uid, following_id: series.author_id })
      if (error) { show('Error: ' + error.message); return }
      setIsFollowing(true)
      // FIX: notify the user who was just followed
      ;(wc as any).from('notifications').insert({
        user_id: series.author_id, actor_id: uid, type: 'follow',
        message: 'started following you',
      }).then(() => {}, () => {})
      show('Following!')
    }
  }

  async function postComment(isSeries: boolean, parentId?: string) {
    await ensureFreshSession()
    if (!user || !series) { show('Sign in to comment!'); return }
    const uid = getAuthUserId()
    const wc = createWriteClient()
    if (!uid || !wc) { show('Sign in to comment!'); return }
    const text = parentId ? replyText : (isSeries ? seriesCommentText : commentText)
    if (!text.trim()) { show('Write something first!'); return }
    const ch = chapters.find(c => c.chapter_number === currentCh)
    const { data, error } = await (wc as any).from('comments').insert({
      user_id: uid, body: text.trim(), series_id: series.id,
      chapter_id: isSeries ? null : ch?.id || null,
      parent_id: parentId || null,
    }).select('*, profiles!comments_user_id_fkey(display_name, handle, avatar_url)').single()
    if (error) { show('Failed to post: ' + error.message); return }
    if (data) {
      if (isSeries) { setSeriesComments(prev => [data, ...prev]); setSeriesCommentText('') }
      else { setComments(prev => [data, ...prev]); setCommentText('') }
      if (parentId) { setReplyingTo(null); setReplyText('') }
      // FIX: notify series author on new comment (skip self-comments)
      if (!parentId && series.author_id && series.author_id !== uid) {
        (wc as any).from('notifications').insert({
          user_id: series.author_id, actor_id: uid, type: 'comment',
          message: `commented on "${series.title}"`, series_id: series.id, comment_id: data.id,
        }).then(() => {}, () => {})
      }
      // FIX: if this is a reply, also notify the parent comment's author (skip self-replies)
      if (parentId) {
        const parent = (isSeries ? seriesComments : comments).find(x => x.id === parentId)
        if (parent && parent.user_id && parent.user_id !== uid) {
          (wc as any).from('notifications').insert({
            user_id: parent.user_id, actor_id: uid, type: 'reply',
            message: `replied to your comment on "${series.title}"`, series_id: series.id, comment_id: data.id,
          }).then(() => {}, () => {})
        }
      }
      show('Comment posted!')
    }
  }

  async function editComment(id: string, isSeries: boolean) {
    if (!editText.trim()) return
    const { error } = await (createWriteClient() as any).from('comments').update({ body: editText.trim(), edited_at: new Date().toISOString() }).eq('id', id)
    if (error) { show('Edit failed: ' + error.message); return }
    const updater = (prev: any[]) => prev.map(c => c.id === id ? { ...c, body: editText.trim(), edited_at: new Date().toISOString() } : c)
    if (isSeries) setSeriesComments(updater); else setComments(updater)
    setEditingId(null); setEditText(''); show('Comment edited!')
  }

  async function deleteComment(id: string, isSeries: boolean) {
    if (!confirm('Delete this comment?')) return
    await (createWriteClient() as any).from('comments').delete().eq('id', id)
    if (isSeries) setSeriesComments(prev => prev.filter(c => c.id !== id))
    else setComments(prev => prev.filter(c => c.id !== id))
    show('Comment deleted')
  }

  async function toggleCommentLike(commentId: string, currentCount: number) {
    await ensureFreshSession()
    if (!user) { show('Sign in to like!'); return }
    const uid = getAuthUserId()
    if (!uid) { show('Sign in to like!'); return }
    const isLiked = likedComments.has(commentId)
    const newCount = isLiked ? Math.max(0, currentCount - 1) : currentCount + 1
    setLikedComments(prev => { const n = new Set(prev); if (isLiked) n.delete(commentId); else n.add(commentId); return n })
    const updater = (prev: any[]) => prev.map(x => x.id === commentId ? { ...x, likes_count: newCount } : x)
    setComments(updater); setSeriesComments(updater)
    if (isLiked) {
      await (createWriteClient() as any).from('comment_likes').delete().eq('user_id', uid).eq('comment_id', commentId)
    } else {
      await (createWriteClient() as any).from('comment_likes').insert({ user_id: uid, comment_id: commentId })
      // FIX: notify the comment's author on like (skip self-likes)
      const c = comments.find(x => x.id === commentId) || seriesComments.find(x => x.id === commentId)
      if (c && c.user_id && c.user_id !== uid && series) {
        (createWriteClient() as any).from('notifications').insert({
          user_id: c.user_id, actor_id: uid, type: 'comment_like',
          message: `liked your comment on "${series.title}"`, series_id: series.id, comment_id: commentId,
        }).then(() => {}, () => {})
      }
    }
  }

  function switchChapter(ch: number) {
    setPanelFade(true); setTimeout(() => { setCurrentCh(ch); setCurrentPage(0); setShowChapters(false); setPanelFade(false); show(`Chapter ${ch}`) }, 200)
  }

  if (loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (!series) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Series not found</div>

  const maxCh = chapters.length > 0 ? chapters[chapters.length - 1].chapter_number : 0
  const currentChData = chapters.find(c => c.chapter_number === currentCh)
  const panels = currentChData?.page_urls?.length ? currentChData.page_urls : null
  const isHorizontal = (currentChData?.reading_mode || series.reading_mode) === 'horizontal'
  const isRTL = isHorizontal && (currentChData?.reading_direction || series.reading_direction) === 'rtl'
  const isAdmin = user?.email === 'nanotooncontact@gmail.com' && series.author_id !== user?.id

  async function adminRemove() {
    if (!confirm('Remove this series for policy violation? The owner will be notified by email.')) return
    if (!confirm('This cannot be undone. Are you sure?')) return
    await ensureFreshSession()
    const res = await fetch('/api/admin-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: 'Series', contentId: series.id, contentTitle: series.title, authorId: series.author_id }),
    })
    const json = await res.json()
    if (!res.ok) { show('Remove failed: ' + (json.error || 'Unknown error')); return }
    show('Series removed. Owner notified by email.')
    window.location.href = '/'
  }
  const authorName = series.profiles?.display_name || 'Unknown'
  const topLevelComments = comments.filter(c => !c.parent_id)
  const topLevelSeriesComments = seriesComments.filter(c => !c.parent_id)
  const commentItemProps = {
    userId: user?.id, comments, seriesComments,
    editingId, editText, setEditText, setEditingId, editComment,
    replyingTo, setReplyingTo, replyText, setReplyText,
    postComment, toggleCommentLike, likedComments, deleteComment,
    highlightedCommentId: highlightedComment,
  }

  return (
    <div id="reader-scroll" className="min-h-screen bg-black">
      {/* ─── HEADER / FLOAT MENU ─────────────────────────────── */}
      <div className="bg-[#09090b]/95 backdrop-blur border-b border-[#27272a] sticky top-0 z-20" style={{ transition: 'transform 0.3s ease', transform: headerHidden ? 'translateY(-100%)' : 'none' }}>

        {/* ══ DESKTOP LAYOUT (md and above) ══════════════════════ */}
        <div className="hidden md:flex gap-3 items-start p-4">
          {/* Back button */}
          <Link href="/" className="shrink-0 w-10 h-10 flex items-center justify-center bg-[#18181b] border border-[#3f3f46] rounded-lg text-[#a1a1aa] no-underline">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>

          {/* Thumbnail — enlarged for desktop */}
          {series.thumbnail_url ? (
            <img src={series.thumbnail_url} className="w-[110px] h-[155px] rounded-lg shrink-0 object-cover" />
          ) : (
            <div className="w-[110px] h-[155px] rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, ${GRADIENTS[0][0]}, ${GRADIENTS[0][1]})` }} />
          )}

          {/* Series info — enlarged */}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-2xl leading-tight">{series.title}</div>
            <div className="text-[#c084fc] text-base mt-0.5">by {series.profiles?.handle ? <Link href={`/user/${series.profiles.handle}`} className="text-[#c084fc] hover:underline no-underline">{authorName}</Link> : authorName}</div>
            <div className="text-base text-[#a1a1aa] mt-1 line-clamp-2">{series.description}</div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="flex items-center gap-1 text-base text-[#71717a]">
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span className="text-[#a1a1aa] font-medium">{fmtNum(series.total_views)}</span> Views
              </span>
              <button onClick={toggleLike} className={`flex items-center gap-1 text-base cursor-pointer bg-transparent border-none ${liked ? 'text-[#f87171]' : 'text-[#71717a]'}`}>
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill={liked ? '#f87171' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span className="font-medium">{fmtNum(series.total_likes)}</span> Like
              </button>
              <button onClick={() => setShowShare({ title: `${series.title} on NANOTOON`, url: `${typeof window !== 'undefined' ? window.location.origin : ''}/series/${series.slug}` })}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg border border-[#3f3f46] cursor-pointer text-base text-[#a1a1aa] hover:border-[#a855f7] bg-transparent">
                Share
              </button>
              {currentChData?.rating === 'Mature' && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Warning: This content may contain mature themes.
                </span>
              )}
            </div>
          </div>

          {/* Right-side action buttons — desktop size unchanged */}
          <div className="flex flex-col gap-2 shrink-0">
            <button onClick={toggleFollow} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border cursor-pointer text-base font-medium transition-all ${isFollowing ? 'bg-purple-500/15 border-purple-500/40 text-[#c084fc]' : 'bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-[#6d28d9]'}`}>
              <svg className="w-[20px] h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              {isFollowing ? 'Following' : 'Follow'}
            </button>
            <button onClick={toggleFav} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm transition-all ${favorited ? 'border-yellow-500/40 text-[#fbbf24]' : 'border-[#3f3f46] text-[#a1a1aa] hover:border-yellow-500/40'}`}>
              <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill={favorited ? '#fbbf24' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {favorited ? 'Favorited' : 'Favorite'}
            </button>
            <button onClick={() => setShowSeriesComments(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#3f3f46] cursor-pointer text-sm text-[#c084fc] hover:border-[#a855f7]">
              <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Comments
            </button>
            {user && series.author_id === user.id && (
              <Link href={`/series/${series.slug}/edit`} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#3f3f46] text-sm text-[#a1a1aa] hover:border-[#a855f7] no-underline text-center justify-center">
                <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </Link>
            )}
            {isAdmin && (
              <button onClick={adminRemove} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 cursor-pointer text-sm text-[#f87171] hover:bg-red-500/10 bg-transparent">
                Remove
              </button>
            )}
          </div>
        </div>

        {/* ══ MOBILE LAYOUT ══════════════════════════════════════ */}
        <div className="flex flex-col gap-2 p-3 md:hidden">
          {/* Row 1: Thumbnail | Info | Action buttons (30% smaller) */}
          <div className="flex gap-2 items-start">
            {/* Thumbnail — positioned at far left with no preceding back button */}
            {series.thumbnail_url ? (
              <img src={series.thumbnail_url} className="w-[48px] h-[68px] rounded-lg shrink-0 object-cover" />
            ) : (
              <div className="w-[48px] h-[68px] rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, ${GRADIENTS[0][0]}, ${GRADIENTS[0][1]})` }} />
            )}

            {/* Info: title, by author, description wraps naturally */}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm leading-tight">{series.title}</div>
              <div className="text-[#c084fc] text-xs mt-0.5">by {series.profiles?.handle ? <Link href={`/user/${series.profiles.handle}`} className="text-[#c084fc] hover:underline no-underline">{authorName}</Link> : authorName}</div>
              <div className="text-xs text-[#a1a1aa] mt-1 break-words">{series.description}</div>
            </div>

            {/* Action buttons — 30% smaller, follow pinned at top */}
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={toggleFollow} className={`flex items-center gap-1 px-2 py-1 rounded-lg border cursor-pointer text-[0.6rem] font-medium transition-all ${isFollowing ? 'bg-purple-500/15 border-purple-500/40 text-[#c084fc]' : 'bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-[#6d28d9]'}`}>
                <svg className="w-[9px] h-[9px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                {isFollowing ? 'Following' : 'Follow'}
              </button>
              <button onClick={toggleFav} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg border cursor-pointer text-[0.6rem] transition-all ${favorited ? 'border-yellow-500/40 text-[#fbbf24]' : 'border-[#3f3f46] text-[#a1a1aa] hover:border-yellow-500/40'}`}>
                <svg className="w-[7px] h-[7px]" viewBox="0 0 24 24" fill={favorited ? '#fbbf24' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                {favorited ? 'Favorited' : 'Favorite'}
              </button>
              <button onClick={() => setShowSeriesComments(true)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg border border-[#3f3f46] cursor-pointer text-[0.6rem] text-[#c084fc] hover:border-[#a855f7]">
                <svg className="w-[7px] h-[7px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Comments
              </button>
              {user && series.author_id === user.id && (
                <Link href={`/series/${series.slug}/edit`} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg border border-[#3f3f46] text-[0.6rem] text-[#a1a1aa] hover:border-[#a855f7] no-underline justify-center">
                  <svg className="w-[7px] h-[7px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit
                </Link>
              )}
              {isAdmin && (
                <button onClick={adminRemove} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg border border-red-500/30 cursor-pointer text-[0.6rem] text-[#f87171] hover:bg-red-500/10 bg-transparent">
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Back button + Views / Likes / Share */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/" className="shrink-0 w-8 h-8 flex items-center justify-center bg-[#18181b] border border-[#3f3f46] rounded-lg text-[#a1a1aa] no-underline">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </Link>
            <span className="flex items-center gap-1 text-[0.68rem] text-[#71717a]">
              <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span className="text-[#a1a1aa] font-medium">{fmtNum(series.total_views)}</span> Views
            </span>
            <button onClick={toggleLike} className={`flex items-center gap-1 text-[0.68rem] cursor-pointer bg-transparent border-none ${liked ? 'text-[#f87171]' : 'text-[#71717a]'}`}>
              <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill={liked ? '#f87171' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span className="font-medium">{fmtNum(series.total_likes)}</span> Like
            </button>
            <button onClick={() => setShowShare({ title: `${series.title} on NANOTOON`, url: `${typeof window !== 'undefined' ? window.location.origin : ''}/series/${series.slug}` })}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[#3f3f46] cursor-pointer text-[0.68rem] text-[#a1a1aa] hover:border-[#a855f7] bg-transparent">
              Share
            </button>
          </div>
        </div>

        {/* ─── Chapter dropdown ───────────────────────────────── */}
        {maxCh > 0 && (
          <div className="px-4 pb-3 border-t border-[#27272a] mt-1">
            <button onClick={() => setShowChapters(!showChapters)} className="w-full flex items-center justify-center gap-2 py-1.5 md:py-2 cursor-pointer bg-transparent border-none">
              <span className="text-xs md:text-sm font-medium text-[#e4e4e7]">
                Chapter {currentCh}{currentChData?.title ? `: ${currentChData.title}` : ''} <span className="text-[#71717a] font-normal">(views: {fmtNum(chapterViews)})</span>
              </span>
              <span className="text-xs md:text-sm text-[#c084fc]">{showChapters ? '▲' : '▼'}</span>
            </button>
            {showChapters && (
              <div className="max-h-[220px] overflow-y-auto bg-[#0d0d0f] rounded-lg p-1 mt-2">
                {chapters.map(ch => (
                  <button key={ch.id} onClick={() => switchChapter(ch.chapter_number)}
                    className={`w-full p-2 md:p-2.5 rounded-lg cursor-pointer text-xs md:text-sm flex items-center justify-center text-center border-none ${ch.chapter_number === currentCh ? 'bg-purple-500/15 text-[#c084fc]' : 'bg-transparent text-[#e4e4e7] hover:bg-[#27272a]'}`}>
                    <span>Chapter {ch.chapter_number}{ch.title ? `: ${ch.title}` : ''} <span className="text-[#71717a]">(views: {fmtNum(ch.views)})</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Mobile-only mature warning bar (desktop has it inline next to Share) ─── */}
      {currentChData?.rating === 'Mature' && (
        <div className="md:hidden max-w-[800px] mx-auto px-3 mt-1.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[0.68rem] font-medium">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Warning: This content may contain mature themes.
          </div>
        </div>
      )}

      {/* ─── Panels / Reader ─────────────────────────────────── */}
      <div className={`max-w-[800px] mx-auto p-1.5 md:p-3 transition-opacity duration-200 ${panelFade ? 'opacity-0' : 'opacity-100'}`}>
        {panels ? (
          isHorizontal ? (
            /* ── Horizontal mode: one page at a time ── */
            <div className="relative">
              <img src={panels[currentPage]} className="w-full rounded-lg" alt={`Page ${currentPage+1}`} />
              {panels.length > 1 && <div className="flex flex-col items-center gap-2 mt-3">
                <div className="flex items-center justify-center gap-3">
                  {!(isRTL ? currentPage===panels.length-1 : currentPage===0) && <button onClick={()=>setCurrentPage(p=> isRTL ? Math.min(panels.length-1,p+1) : Math.max(0,p-1))} className="w-[40px] h-[38px] border border-[#3f3f46] rounded-xl text-sm cursor-pointer bg-transparent flex items-center justify-center text-[#a1a1aa] hover:border-[#a855f7]">◀</button>}
                  {(isRTL ? currentPage===panels.length-1 : currentPage===0) && <div className="w-[40px] h-[38px]" />}
                  <button onClick={()=>{setFullscreenPage(currentPage);setShowFullscreen(true)}}
                    title="Full Screen"
                    className="group relative w-[40px] h-[38px] border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer hover:border-[#a855f7] flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 3 21 3 21 9"/>
                      <polyline points="9 21 3 21 3 15"/>
                      <line x1="21" y1="3" x2="14" y2="10"/>
                      <line x1="3" y1="21" x2="10" y2="14"/>
                    </svg>
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#27272a] border border-[#3f3f46] rounded text-[0.65rem] text-[#e4e4e7] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Full Screen</span>
                  </button>
                  {!(isRTL ? currentPage===0 : currentPage===panels.length-1) && <button onClick={()=>setCurrentPage(p=> isRTL ? Math.max(0,p-1) : Math.min(panels.length-1,p+1))} className="w-[40px] h-[38px] border border-[#3f3f46] rounded-xl text-sm cursor-pointer bg-transparent flex items-center justify-center text-[#a1a1aa] hover:border-[#a855f7]">▶</button>}
                  {(isRTL ? currentPage===0 : currentPage===panels.length-1) && <div className="w-[40px] h-[38px]" />}
                </div>
                <span className="text-sm text-[#71717a]">{currentPage+1}/{panels.length}</span>
              </div>}
              {panels.length === 1 && (
                <div className="flex justify-center mt-3">
                  <button onClick={()=>{setFullscreenPage(0);setShowFullscreen(true)}}
                    title="Full Screen"
                    className="group relative w-[40px] h-[38px] border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer hover:border-[#a855f7] flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 3 21 3 21 9"/>
                      <polyline points="9 21 3 21 3 15"/>
                      <line x1="21" y1="3" x2="14" y2="10"/>
                      <line x1="3" y1="21" x2="10" y2="14"/>
                    </svg>
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#27272a] border border-[#3f3f46] rounded text-[0.65rem] text-[#e4e4e7] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Full Screen</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── Webtoon mode: all pages stacked ── */
            panels.map((url: string, pi: number) => (
              <img key={pi} src={url} loading={pi === 0 ? 'eager' : 'lazy'} className="w-full" style={{ marginTop: pi > 0 ? '-4px' : '0' }} alt={`Page ${pi+1}`} />
            ))
          )
        ) : <div className="w-full aspect-[3/4] flex items-center justify-center text-[#52525b] text-sm bg-[#18181b] rounded-xl">{maxCh === 0 ? 'No chapters yet' : 'No pages in this chapter'}</div>}
      </div>

      {/* ─── Chapter nav ─────────────────────────────────────── */}
      {maxCh > 0 && (
        <div className="max-w-[800px] mx-auto mt-4 flex gap-2 px-3">
          <button onClick={() => { if (currentCh > 1) switchChapter(currentCh - 1); else show('First chapter!') }}
            className="flex-1 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] flex items-center justify-center gap-1">Prev Chapter</button>
          <button onClick={() => { if (currentCh < maxCh) switchChapter(currentCh + 1); else show("You're caught up!") }}
            className="flex-1 py-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#a1a1aa] cursor-pointer text-sm hover:border-[#a855f7] flex items-center justify-center gap-1">Next Chapter</button>
        </div>
      )}

      {/* Chapter Comments */}
      <div className="max-w-[800px] mx-auto mt-7 bg-[#18181b] rounded-2xl p-4 mb-8 mx-3">
        <h3 className="font-medium text-sm mb-3">Chapter {currentCh} Comments ({comments.length})</h3>
        {topLevelComments.length === 0 && <p className="text-[#52525b] text-xs mb-3">No comments yet. Be the first!</p>}
        {topLevelComments.map(c => <CommentItem key={c.id} c={c} isSeries={false} {...commentItemProps} />)}
        <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Write your comment..."
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2.5 h-16 text-[#e4e4e7] text-sm resize-y outline-none focus:border-[#a855f7] font-[inherit]" />
        <div className="flex justify-end mt-2">
          <button onClick={() => postComment(false)} className="px-4 py-2 bg-[#7c3aed] text-white rounded-xl cursor-pointer text-sm font-medium border-none hover:bg-[#6d28d9]">Post Comment</button>
        </div>
      </div>

      {/* Series Comments Overlay */}
      {showSeriesComments && (
        <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center">
          <div className="bg-[#18181b] rounded-2xl w-full max-w-[520px] mx-3.5 max-h-[84vh] overflow-hidden flex flex-col border border-[#27272a]">
            <div className="p-3.5 border-b border-[#27272a] flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-sm">Series Comments ({seriesComments.length})</h3>
              <button onClick={() => setShowSeriesComments(false)} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa] text-base flex items-center justify-center">×</button>
            </div>
            <div className="p-3.5 overflow-y-auto flex-1">
              {topLevelSeriesComments.length === 0 && <p className="text-[#52525b] text-xs">No comments yet.</p>}
              {topLevelSeriesComments.map(c => <CommentItem key={c.id} c={c} isSeries={true} {...commentItemProps} />)}
            </div>
            <div className="p-3.5 border-t border-[#27272a] shrink-0">
              <textarea value={seriesCommentText} onChange={e => setSeriesCommentText(e.target.value)} placeholder="Write about this series..."
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2.5 h-16 text-[#e4e4e7] text-sm resize-y outline-none focus:border-[#a855f7] font-[inherit]" />
              <button onClick={() => postComment(true)} className="mt-2 px-4 py-2 bg-[#7c3aed] text-white rounded-xl cursor-pointer text-sm font-medium border-none hover:bg-[#6d28d9]">Post</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Fullscreen overlay (horizontal mode) ────────────── */}
      {showFullscreen && panels && (
        <div className="fixed inset-0 bg-black z-[300] flex flex-col"
          onTouchStart={handleTouchStart}
          onTouchEnd={(e) => handleTouchEnd(e, panels.length, isRTL)}>
          <div className="flex items-center justify-between p-3 shrink-0">
            <span className="text-[#71717a] text-xs md:text-sm">{fullscreenPage + 1} / {panels.length}</span>
            <button onClick={() => setShowFullscreen(false)} className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-[#27272a] border border-[#3f3f46] rounded-lg text-[#a1a1aa] cursor-pointer hover:border-[#a855f7]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden px-2 relative">
            {(isRTL ? fullscreenPage < panels.length - 1 : fullscreenPage > 0) && (
              <button onClick={() => setFullscreenPage(p => isRTL ? Math.min(panels.length - 1, p + 1) : p - 1)}
                className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-black/50 hover:bg-black/70 border border-[#3f3f46] rounded-full text-white cursor-pointer z-10 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            )}
            <img src={panels[fullscreenPage]} className="h-full max-w-full object-contain select-none" alt={`Page ${fullscreenPage + 1}`} draggable={false} />
            {(isRTL ? fullscreenPage > 0 : fullscreenPage < panels.length - 1) && (
              <button onClick={() => setFullscreenPage(p => isRTL ? p - 1 : Math.min(panels.length - 1, p + 1))}
                className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-black/50 hover:bg-black/70 border border-[#3f3f46] rounded-full text-white cursor-pointer z-10 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-1.5 p-3 shrink-0">
            {panels.length <= 20 && panels.map((_: any, i: number) => (
              <button key={i} onClick={() => setFullscreenPage(i)}
                className={`w-2 h-2 rounded-full border-none cursor-pointer transition-colors ${i === fullscreenPage ? 'bg-[#a855f7]' : 'bg-[#3f3f46] hover:bg-[#52525b]'}`} />
            ))}
          </div>
        </div>
      )}

      {showShare && <ShareModal title={showShare.title} url={showShare.url} onClose={() => setShowShare(null)} />}
      {showReport && <ReportModal title={showReport} onClose={() => setShowReport(null)} onSubmit={() => show('Report submitted!')} seriesId={series?.id} />}
    </div>
  )
}
