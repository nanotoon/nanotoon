"use client"
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { ShareModal } from '@/components/ShareModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

function fmtNum(n: number|null|undefined): string { if (!n) return '0'; if (n>=1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n>=1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString() }
function timeAgo(d: string) { const m=Math.floor((Date.now()-new Date(d).getTime())/60000); if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago' }

export default function GalleryDetailPage() {
  const { id } = useParams() as { id: string }
  const { show } = useToast(); const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [item, setItem] = useState<any>(null); const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0); const [liked, setLiked] = useState(false)
  const [showShare, setShowShare] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([]); const [cText, setCText] = useState('')

  useEffect(() => {
    let c = false
    async function load() {
      const { data } = await supabase.from('gallery').select('*, profiles!gallery_author_id_fkey(display_name, handle, avatar_url)').eq('id', id).single()
      if (!c && data) {
        setItem(data)
        await supabase.from('gallery').update({ total_views: (data.total_views??0)+1 }).eq('id', id)
        const { data: cmts } = await supabase.from('gallery_comments').select('*, profiles!gallery_comments_user_id_fkey(display_name, handle, avatar_url)').eq('gallery_id', id).order('created_at', { ascending: false })
        if (!c) setComments(cmts ?? [])
        if (user) { const { data: lk } = await supabase.from('gallery_likes').select('*').eq('user_id', user.id).eq('gallery_id', id).maybeSingle(); if (!c) setLiked(!!lk) }
      }
      if (!c) setLoading(false)
    }
    load(); return () => { c = true }
  }, [id, user, supabase])

  async function toggleLike() {
    if (!user||!item){show('Sign in!');return}
    if (liked) { await supabase.from('gallery_likes').delete().eq('user_id',user.id).eq('gallery_id',id); setItem((p:any)=>({...p,total_likes:Math.max(0,(p.total_likes??1)-1)})); setLiked(false); show('Removed') }
    else { await supabase.from('gallery_likes').insert({user_id:user.id,gallery_id:id}); setItem((p:any)=>({...p,total_likes:(p.total_likes??0)+1})); setLiked(true); show('Liked!') }
  }

  async function postComment() {
    if (!user){show('Sign in!');return}; if(!cText.trim()){show('Write something!');return}
    const {data,error}=await supabase.from('gallery_comments').insert({user_id:user.id,gallery_id:id,body:cText.trim()}).select('*, profiles!gallery_comments_user_id_fkey(display_name, handle, avatar_url)').single()
    if (error){show('Failed: '+error.message);return}
    if (data){setComments(p=>[data,...p]);setCText('');show('Posted!')}
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#52525b]">Loading...</div>
  if (!item) return <div className="min-h-screen flex items-center justify-center text-[#71717a]">Not found</div>
  const imgs=item.image_urls||[]; const rm=item.reading_mode||'horizontal'

  return (
    <div className="min-h-screen bg-black">
      <div className="bg-[#09090b]/95 backdrop-blur border-b border-[#27272a] sticky top-0 z-20">
        <div className="flex gap-2 items-center p-3 md:p-4">
          <Link href="/gallery" className="shrink-0 w-8 h-8 flex items-center justify-center bg-[#18181b] border border-[#3f3f46] rounded-lg text-[#a1a1aa] no-underline"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg></Link>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm md:text-base">{item.title}</div>
            <div className="text-[#c084fc] text-xs">by {item.profiles?.display_name||'Unknown'}</div>
            <div className="flex items-center gap-3 mt-1"><span className="text-[0.68rem] text-[#71717a]">{fmtNum(item.total_views)} views</span><span className="text-[0.68rem] text-[#71717a]">{fmtNum(item.total_likes)} likes</span></div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button onClick={toggleLike} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border cursor-pointer text-xs ${liked?'bg-red-500/15 border-red-500/40 text-[#f87171]':'border-[#3f3f46] text-[#a1a1aa]'}`}>{liked?'Liked':'Like'}</button>
            <button onClick={()=>setShowShare({title:item.title,url:(typeof window!=='undefined'?window.location.origin:'')+'/gallery/'+id})} className="px-2 py-1 rounded-lg border border-[#3f3f46] cursor-pointer text-xs text-[#a1a1aa]">Share</button>
          </div>
        </div>
      </div>
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
      <div className="max-w-[800px] mx-auto mt-7 bg-[#18181b] rounded-2xl p-4 mb-8 mx-3">
        <h3 className="font-medium text-sm mb-3">Comments ({comments.length})</h3>
        {comments.length===0 && <p className="text-[#52525b] text-xs mb-3">No comments yet.</p>}
        {comments.map(c => <div key={c.id} className="flex gap-2 mb-3">
          {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} className="w-7 h-7 rounded-full object-cover shrink-0" /> : <Avatar name={c.profiles?.display_name||'User'} size={28} />}
          <div><div className="flex items-center gap-2"><span className="font-medium text-xs">{c.profiles?.display_name||'User'}</span>{c.created_at && <span className="text-[0.6rem] text-[#52525b]">{timeAgo(c.created_at)}</span>}</div>
          <div className="text-[#d4d4d8] text-[0.79rem] mt-0.5">{c.body}</div></div></div>)}
        <textarea value={cText} onChange={e=>setCText(e.target.value)} placeholder="Write a comment..." className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2.5 h-16 text-[#e4e4e7] text-sm resize-y outline-none focus:border-[#a855f7] font-[inherit]" />
        <div className="flex justify-end mt-2"><button onClick={postComment} className="px-4 py-2 bg-[#7c3aed] text-white rounded-xl cursor-pointer text-sm font-medium border-none hover:bg-[#6d28d9]">Post</button></div>
      </div>
      {showShare && <ShareModal title={showShare.title} url={showShare.url} onClose={()=>setShowShare(null)} />}
    </div>
  )
}
