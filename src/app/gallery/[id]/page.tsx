"use client"
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { ShareModal } from '@/components/ShareModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { createAnonClient } from '@/lib/supabase/anon'

function fmtNum(n: number|null|undefined): string { if (!n) return '0'; if (n>=1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n>=1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString() }
function timeAgo(d: string) { const m=Math.floor((Date.now()-new Date(d).getTime())/60000); if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago' }

export default function GalleryDetailPage() {
  const { id } = useParams() as { id: string }
  const { show } = useToast(); const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const anonDb = useMemo(() => createAnonClient(), [])
  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [liked, setLiked] = useState(false)
  const [favorited, setFavorited] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [showShare, setShowShare] = useState<any>(null)
  const [showCommentsModal, setShowCommentsModal] = useState(false)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [cText, setCText] = useState('')
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')

  useEffect(() => {
    let c = false
    const timeout = setTimeout(() => { if (!c) setLoading(false) }, 10000)
    async function load() {
      try {
        const { data } = await anonDb.from('gallery').select('*, profiles!gallery_author_id_fkey(display_name, handle, avatar_url)').eq('id', id).single() as { data: any }
        if (!c && data) {
          setItem(data)
          // Write: use auth client for view count update (correct)
          await supabase.from('gallery').update({ total_views: ((data as any).total_views??0)+1 }).eq('id', id)
          // Read: use anonDb for comments (public read — never auth client)
          const { data: cmts } = await anonDb.from('gallery_comments').select('*, profiles!gallery_comments_user_id_fkey(display_name, handle, avatar_url)').eq('gallery_id', id).order('created_at', { ascending: false }) as { data: any[] | null }
          if (!c) setComments(cmts ?? [])
          // Read: use anonDb for all user-state checks (public read — auth client hangs on JWT refresh)
          if (user) {
            const [lk, fw, fv] = await Promise.all([
              anonDb.from('gallery_likes').select('id').eq('user_id', user.id).eq('gallery_id', id).maybeSingle(),
              anonDb.from('follows').select('id').eq('follower_id', user.id).eq('following_id', data.author_id).maybeSingle(),
              anonDb.from('gallery_favorites').select('id').eq('user_id', user.id).eq('gallery_id', id).maybeSingle(),
            ]) as any[]
            if (!c) { setLiked(!!lk.data); setIsFollowing(!!fw.data); setFavorited(!!fv.data) }
          }
        }
      } catch { /* swallow — timeout will clear loading */ }
      clearTimeout(timeout)
      if (!c) setLoading(false)
    }
    load(); return () => { c = true; clearTimeout(timeout) }
  }, [id, user, anonDb, supabase])

  // Close fullscreen / comments on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowFullscreen(false); setShowCommentsModal(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function toggleLike() {
    if (!user||!item){show('Sign in!');return}
    if (liked) { await supabase.from('gallery_likes').delete().eq('user_id',user.id).eq('gallery_id',id); setItem((p:any)=>({...p,total_likes:Math.max(0,(p.total_likes??1)-1)})); setLiked(false); show('Removed') }
    else { await supabase.from('gallery_likes').insert({user_id:user.id,gallery_id:id}); setItem((p:any)=>({...p,total_likes:(p.total_likes??0)+1})); setLiked(true); show('Liked!') }
  }

  async function toggleFavorite() {
    if (!user||!item){show('Sign in!');return}
    if (favorited) {
      await supabase.from('gallery_favorites').delete().eq('user_id',user.id).eq('gallery_id',id)
      setFavorited(false); show('Removed from Favorites')
    } else {
      await supabase.from('gallery_favorites').insert({user_id:user.id,gallery_id:id})
      setFavorited(true); show('Added to Favorites!')
    }
  }

  async function toggleFollow() {
    if (!user||!item){show('Sign in!');return}
    if (user.id === item.author_id){show("Can't follow yourself");return}
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id',user.id).eq('following_id',item.author_id)
      setIsFollowing(false); show('Unfollowed')
    } else {
      await supabase.from('follows').insert({follower_id:user.id,following_id:item.author_id})
      setIsFollowing(true); show('Following!')
    }
  }

  async function postComment() {
    if (!user){show('Sign in!');return}; if(!cText.trim()){show('Write something!');return}
    const {data,error}=await supabase.from('gallery_comments').insert({user_id:user.id,gallery_id:id,body:cText.trim()}).select('*, profiles!gallery_comments_user_id_fkey(display_name, handle, avatar_url)').single()
    if (error){show('Failed: '+error.message);return}
    if (data){setComments(p=>[data,...p]);setCText('');show('Posted!')}
  }

  if (loading) return <div className="min-h-screen"><LoadingSpinner /></div>
  if (!item) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Not found</div>

  const imgs = item.image_urls || []
  const rm = item.reading_mode || 'horizontal'
  const isAlbum = imgs.length > 1
  const isSingleImage = imgs.length === 1

  return (
    <div className="min-h-screen bg-black">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="bg-[#09090b]/95 backdrop-blur border-b border-[#27272a] sticky top-0 z-20">
        <div className="flex gap-2 items-center p-3 md:p-4">
          <Link href="/gallery" className="shrink-0 w-8 h-8 flex items-center justify-center bg-[#18181b] border border-[#3f3f46] rounded-lg text-[#a1a1aa] no-underline">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm md:text-base">{item.title}</div>
            <div className="text-[#c084fc] text-xs">by {item.profiles?.display_name||'Unknown'}</div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[0.68rem] text-[#71717a]">{fmtNum(item.total_views)} views</span>
              <span className="text-[0.68rem] text-[#71717a]">{fmtNum(item.total_likes)} likes</span>
            </div>
          </div>

          {/* ─── Buttons: Follow Like Favorite Share Comments ── */}
          <div className="flex flex-col gap-1.5 shrink-0">
            {/* Follow */}
            <button onClick={toggleFollow} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm font-medium transition-all ${isFollowing ? 'bg-purple-500/15 border-purple-500/40 text-[#c084fc]' : 'bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-[#6d28d9]'}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              {isFollowing ? 'Following' : 'Follow'}
            </button>
            {/* Like */}
            <button onClick={toggleLike} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border cursor-pointer text-xs transition-all ${liked ? 'bg-red-500/15 border-red-500/40 text-[#f87171]' : 'border-[#3f3f46] text-[#a1a1aa] hover:border-red-500/40'}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill={liked?'#f87171':'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              {liked ? 'Liked' : 'Like'}
            </button>
            {/* Favorite */}
            <button onClick={toggleFavorite} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border cursor-pointer text-xs transition-all ${favorited ? 'border-yellow-500/40 text-[#fbbf24]' : 'border-[#3f3f46] text-[#a1a1aa] hover:border-yellow-500/40'}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill={favorited?'#fbbf24':'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {favorited ? 'Favorited' : 'Favorite'}
            </button>
            {/* Share */}
            <button onClick={()=>setShowShare({title:item.title,url:(typeof window!=='undefined'?window.location.origin:'')+'/gallery/'+id})} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#3f3f46] cursor-pointer text-xs text-[#a1a1aa] hover:border-[#a855f7]">Share</button>
            {/* Comments — only for albums */}
            {isAlbum && (
              <button onClick={()=>setShowCommentsModal(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#3f3f46] cursor-pointer text-xs text-[#c084fc] hover:border-[#a855f7]">Comments</button>
            )}
            {/* Enlarge — only for single image */}
            {isSingleImage && imgs[0] && (
              <button onClick={()=>setShowFullscreen(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#3f3f46] cursor-pointer text-xs text-[#a1a1aa] hover:border-[#a855f7]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                Enlarge
              </button>
            )}
            {/* Edit / Delete — owner only */}
            {user && item.author_id === user.id && (<>
              <button onClick={()=>{setEditTitle(item.title);setEditDesc(item.description||'');setEditing(true)}} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#3f3f46] cursor-pointer text-xs text-[#a1a1aa] hover:border-[#a855f7]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              <button onClick={async()=>{if(!confirm('Delete this gallery item?'))return;await supabase.from('gallery').delete().eq('id',id);window.location.href='/gallery'}} className="px-2 py-1 rounded-lg border border-red-500/30 cursor-pointer text-xs text-[#f87171] hover:bg-red-500/10">Delete</button>
            </>)}
          </div>
        </div>
      </div>

      {/* ─── Image viewer ───────────────────────────────────── */}
      <div className="max-w-[800px] mx-auto p-1.5 md:p-3">
        {rm==='webtoon' ? imgs.map((url:string,i:number) => <img key={i} src={url} className="w-full" style={{marginTop:i>0?'-4px':'0'}} alt="" />) : (
          <div className="relative">
            {imgs.length>0 && <img src={imgs[page]} className="w-full rounded-lg" alt="" />}
            {imgs.length>1 && <div className="flex items-center justify-center gap-3 mt-3">
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className={`px-4 py-2 border rounded-xl text-sm cursor-pointer bg-transparent ${page===0?'border-[#27272a] text-[#3f3f46]':'border-[#3f3f46] text-[#a1a1aa] hover:border-[#a855f7]'}`}>◀ Prev</button>
              <span className="text-sm text-[#71717a]">{page+1}/{imgs.length}</span>
              <button onClick={()=>setPage(p=>Math.min(imgs.length-1,p+1))} disabled={page===imgs.length-1} className={`px-4 py-2 border rounded-xl text-sm cursor-pointer bg-transparent ${page===imgs.length-1?'border-[#27272a] text-[#3f3f46]':'border-[#3f3f46] text-[#a1a1aa] hover:border-[#a855f7]'}`}>Next ▶</button>
            </div>}
          </div>
        )}
      </div>

      {/* ─── Comments (always at bottom) ────────────────────── */}
      <div className="max-w-[800px] mx-auto mt-7 bg-[#18181b] rounded-2xl p-4 mb-8 mx-3">
        <h3 className="font-medium text-sm mb-3">Comments ({comments.length})</h3>
        {comments.length===0 && <p className="text-[#52525b] text-xs mb-3">No comments yet.</p>}
        {comments.map(c => <div key={c.id} className="flex gap-2 mb-3">
          {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} className="w-7 h-7 rounded-full object-cover shrink-0" /> : <Avatar name={c.profiles?.display_name||'User'} size={28} />}
          <div><div className="flex items-center gap-2"><span className="font-medium text-xs">{c.profiles?.display_name||'User'}</span>{c.created_at && <span className="text-[0.6rem] text-[#52525b]">{timeAgo(c.created_at)}</span>}</div>
          <div className="text-[#d4d4d8] text-[0.79rem] mt-0.5">{c.body}</div></div>
        </div>)}
        <textarea value={cText} onChange={e=>setCText(e.target.value)} placeholder="Write a comment..." className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2.5 h-16 text-[#e4e4e7] text-sm resize-y outline-none focus:border-[#a855f7] font-[inherit]" />
        <div className="flex justify-end mt-2"><button onClick={postComment} className="px-4 py-2 bg-[#7c3aed] text-white rounded-xl cursor-pointer text-sm font-medium border-none hover:bg-[#6d28d9]">Post</button></div>
      </div>

      {/* ─── Comments modal (album only, triggered from header) */}
      {showCommentsModal && (
        <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center" onClick={()=>setShowCommentsModal(false)}>
          <div className="bg-[#18181b] rounded-2xl w-full max-w-[520px] mx-3.5 max-h-[84vh] overflow-hidden flex flex-col border border-[#27272a]" onClick={e=>e.stopPropagation()}>
            <div className="p-3.5 border-b border-[#27272a] flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-sm">Comments ({comments.length})</h3>
              <button onClick={()=>setShowCommentsModal(false)} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa] text-base flex items-center justify-center">×</button>
            </div>
            <div className="p-3.5 overflow-y-auto flex-1">
              {comments.length===0 && <p className="text-[#52525b] text-xs">No comments yet.</p>}
              {comments.map(c => <div key={c.id} className="flex gap-2 mb-3">
                {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} className="w-7 h-7 rounded-full object-cover shrink-0" /> : <Avatar name={c.profiles?.display_name||'User'} size={28} />}
                <div><div className="flex items-center gap-2"><span className="font-medium text-xs">{c.profiles?.display_name||'User'}</span>{c.created_at && <span className="text-[0.6rem] text-[#52525b]">{timeAgo(c.created_at)}</span>}</div>
                <div className="text-[#d4d4d8] text-[0.79rem] mt-0.5">{c.body}</div></div>
              </div>)}
            </div>
            <div className="p-3.5 border-t border-[#27272a] shrink-0">
              <textarea value={cText} onChange={e=>setCText(e.target.value)} placeholder="Write a comment..." className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2.5 h-14 text-[#e4e4e7] text-sm resize-y outline-none focus:border-[#a855f7] font-[inherit]" />
              <button onClick={postComment} className="mt-2 px-4 py-2 bg-[#7c3aed] text-white rounded-xl cursor-pointer text-sm font-medium border-none hover:bg-[#6d28d9]">Post</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Fullscreen — single image only ─────────────────── */}
      {showFullscreen && isSingleImage && (
        <div className="fixed inset-0 bg-black z-[300] flex flex-col items-center justify-center" onClick={()=>setShowFullscreen(false)}>
          <button onClick={()=>setShowFullscreen(false)} className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-[#27272a]/80 border border-[#3f3f46] rounded-lg text-[#a1a1aa] cursor-pointer z-10">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <img src={imgs[0]} className="max-h-screen max-w-screen object-contain" alt={item.title} onClick={e=>e.stopPropagation()} />
        </div>
      )}

      {showShare && <ShareModal title={showShare.title} url={showShare.url} onClose={()=>setShowShare(null)} />}

      {/* ─── Edit modal ──────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center p-4" onClick={()=>setEditing(false)}>
          <div className="bg-[#18181b] rounded-2xl w-full max-w-[420px] border border-[#27272a] p-4" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm">Edit Gallery Item</h3>
              <button onClick={()=>setEditing(false)} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa]">&times;</button>
            </div>
            <div className="flex flex-col gap-3">
              <div><label className="block text-xs text-[#71717a] mb-1">Title</label><input value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7]" /></div>
              <div><label className="block text-xs text-[#71717a] mb-1">Description</label><textarea value={editDesc} onChange={e=>setEditDesc(e.target.value)} rows={3} className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none resize-y font-[inherit] focus:border-[#a855f7]" /></div>
              <button onClick={async()=>{
                const {error}=await supabase.from('gallery').update({title:editTitle.trim(),description:editDesc||null}).eq('id',id)
                if(error){show('Failed: '+error.message);return}
                setItem((p:any)=>({...p,title:editTitle.trim(),description:editDesc||null}));setEditing(false);show('Updated!')
              }} className="py-2 bg-[#7c3aed] text-white rounded-lg text-sm font-medium border-none cursor-pointer hover:bg-[#6d28d9]">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
