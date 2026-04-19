'use client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createAnonClient } from '@/lib/supabase/anon'
import { createWriteClient, ensureFreshSession } from '@/lib/supabase/write'

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago'
  const dy = Math.floor(h / 24); if (dy < 30) return dy + 'd ago'
  return Math.floor(dy / 30) + 'mo ago'
}

export default function NotificationsPage() {
  const { show } = useToast()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const anonDb = useMemo(() => createAnonClient(), [])
  const [notifs, setNotifs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNotif, setSelectedNotif] = useState<any>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    let cancelled = false
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false) }, 6000)
    async function load() {
      try {
        // Auto-delete unread notifications older than 1 year
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
        const wc = createWriteClient()
        if (wc) {
          await (wc as any).from('notifications').delete()
            .eq('user_id', user!.id).eq('read', false).lt('created_at', oneYearAgo)
        }

        const { data } = await anonDb.from('notifications')
          .select('*, actor:profiles!notifications_actor_id_fkey(display_name, handle, avatar_url)')
          .eq('user_id', user!.id).order('created_at', { ascending: false }).limit(50) as { data: any[] | null }
        clearTimeout(timeout)
        if (!cancelled) { setNotifs(data ?? []); setLoading(false) }
      } catch { clearTimeout(timeout); if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [user, authLoading, anonDb])

  async function markRead(id: string) {
    await ensureFreshSession()
    const wc = createWriteClient()
    if (wc) await (wc as any).from('notifications').update({ read: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function markAllRead() {
    if (!user) return
    await ensureFreshSession()
    const wc = createWriteClient()
    if (wc) await (wc as any).from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
    show('All marked as read')
  }

  async function handleClick(n: any) {
    await markRead(n.id)

    // Removal/restoration/welcome/ban/unban notifications → show detail inline
    if (n.type === 'removal' || n.type === 'restoration' || n.type === 'welcome' || n.type === 'ban' || n.type === 'unban') {
      setSelectedNotif(n)
      return
    }

    // FIX: follow notifications → go to the actor's profile page. Previously
    // these fell through to the generic detail view, which rendered the bare
    // message ("started following you") without the actor's name — confusing
    // and useless. Going to the actor's profile is the natural action anyway.
    if (n.type === 'follow' && n.actor?.handle) {
      router.push(`/user/${n.actor.handle}`)
      return
    }

    // Notifications with a link → navigate there
    if (n.link) {
      router.push(n.link)
      return
    }

    // FIX: comment-related notifications (comment / reply / comment_like) →
    // fetch the comment row so we can tell whether it's a series-level comment
    // (chapter_id null) or a chapter-level comment, and build a URL that tells
    // the reader page to open the right view and scroll the target comment.
    if (n.comment_id && (n.type === 'comment' || n.type === 'reply' || n.type === 'comment_like')) {
      const { data: cmt } = await anonDb.from('comments').select('series_id, chapter_id').eq('id', n.comment_id).maybeSingle() as { data: any }
      if (cmt?.series_id) {
        const { data: s } = await anonDb.from('series').select('slug').eq('id', cmt.series_id).maybeSingle() as { data: any }
        if (s?.slug) {
          if (cmt.chapter_id) {
            // Chapter comment — need the chapter number to switch to it
            const { data: ch } = await anonDb.from('chapters').select('chapter_number').eq('id', cmt.chapter_id).maybeSingle() as { data: any }
            const chParam = ch?.chapter_number ? `&chapter=${ch.chapter_number}` : ''
            router.push(`/series/${s.slug}?comment=${n.comment_id}${chParam}`)
          } else {
            // Series-level comment — will open series comments modal
            router.push(`/series/${s.slug}?seriesComment=${n.comment_id}`)
          }
          return
        }
      }
    }

    // FIX: notifications with a series_id → look up slug and navigate to the series page
    if (n.series_id) {
      const { data: s } = await anonDb.from('series').select('slug').eq('id', n.series_id).maybeSingle() as { data: any }
      if (s?.slug) { router.push(`/series/${s.slug}`); return }
    }

    // Default → just mark read and show detail
    setSelectedNotif(n)
  }

  // ─── Detail view for a selected notification ───
  if (selectedNotif) {
    const isRemoval = selectedNotif.type === 'removal'
    const isRestoration = selectedNotif.type === 'restoration'
    const isWelcome = selectedNotif.type === 'welcome'
    const isBan = selectedNotif.type === 'ban'
    const isUnban = selectedNotif.type === 'unban'
    const isRed = isRemoval || isBan
    const isGreen = isRestoration || isUnban
    return (
      <div className="max-w-[680px] mx-auto px-4 py-6">
        <button onClick={() => setSelectedNotif(null)} className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] bg-transparent border-none cursor-pointer p-0">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back to Notifications
        </button>

        <div className={`rounded-2xl p-5 border ${isRed ? 'bg-red-500/5 border-red-500/20' : isGreen ? 'bg-green-500/5 border-green-500/20' : isWelcome ? 'bg-purple-500/5 border-purple-500/20' : 'bg-[#18181b] border-[#27272a]'}`}>
          <div className="flex items-center gap-2 mb-3">
            {isRemoval && <span className="text-xl">⚠️</span>}
            {isBan && <span className="text-xl">🚫</span>}
            {isRestoration && <span className="text-xl">✅</span>}
            {isUnban && <span className="text-xl">🎊</span>}
            {isWelcome && <span className="text-xl">🎉</span>}
            <h2 className={`text-lg font-bold ${isRed ? 'text-[#f87171]' : isGreen ? 'text-green-400' : isWelcome ? 'text-[#c084fc]' : 'text-[#e4e4e7]'}`}>
              {isRemoval ? 'Content Removed' : isBan ? 'Account Suspended' : isRestoration ? 'Content Restored' : isUnban ? 'Account Reinstated' : isWelcome ? 'Welcome to NANOTOON!' : 'Notification'}
            </h2>
          </div>
          <p className="text-[#d4d4d8] text-sm leading-relaxed mb-4">{selectedNotif.message}</p>
          {(isRemoval || isBan) && (
            <p className="text-[#71717a] text-xs">
              If you believe this was a mistake, contact <a href="mailto:nanotooncontact@gmail.com" className="text-[#c084fc]">nanotooncontact@gmail.com</a>
            </p>
          )}
          <div className="text-[0.7rem] text-[#52525b] mt-3">{selectedNotif.created_at ? timeAgo(selectedNotif.created_at) : ''}</div>
        </div>
      </div>
    )
  }

  // ─── Notification list ───
  return (
    <div className="max-w-[680px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
          </Link>
          <h1 className="text-xl font-bold text-[#c084fc]">Notifications</h1>
        </div>
        <button onClick={markAllRead} className="text-xs text-[#c084fc] bg-transparent border-none cursor-pointer">Mark all read</button>
      </div>
      {loading ? (
        <LoadingSpinner />
      ) : !user ? (
        <p className="text-center py-12 text-[#71717a]">Sign in to see notifications.</p>
      ) : notifs.length === 0 ? (
        <p className="text-center py-12 text-[#71717a]">No notifications yet.</p>
      ) : (
        <div className="bg-[#18181b] rounded-2xl px-4">
          {notifs.map(n => (
            <div key={n.id} onClick={() => handleClick(n)} className="flex items-start gap-2.5 py-3 border-b border-[#27272a] last:border-b-0 cursor-pointer hover:bg-white/[0.02]">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? 'opacity-0' : (n.type === 'removal' || n.type === 'ban') ? 'bg-red-500' : 'bg-[#a855f7]'}`}></div>
              {n.type === 'removal' ? (
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 text-sm">⚠️</div>
              ) : n.type === 'ban' ? (
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 text-sm">🚫</div>
              ) : n.type === 'restoration' ? (
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 text-sm">✅</div>
              ) : n.type === 'unban' ? (
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 text-sm">🎊</div>
              ) : n.type === 'welcome' ? (
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 text-sm">🎉</div>
              ) : n.actor?.avatar_url ? (
                n.actor?.handle ? (
                  <img
                    src={n.actor.avatar_url}
                    className="w-8 h-8 rounded-full object-cover shrink-0 cursor-pointer"
                    alt=""
                    onClick={(e) => { e.stopPropagation(); router.push(`/user/${n.actor.handle}`) }}
                  />
                ) : (
                  <img src={n.actor.avatar_url} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                )
              ) : n.actor?.handle ? (
                <div
                  className="shrink-0 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); router.push(`/user/${n.actor.handle}`) }}
                >
                  <Avatar name={n.actor?.display_name || 'Someone'} size={32} />
                </div>
              ) : (
                <Avatar name={n.actor?.display_name || 'Someone'} size={32} />
              )}
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${n.read ? 'text-[#a1a1aa]' : 'text-[#e4e4e7]'}`}>
                  {n.type === 'removal' || n.type === 'restoration' || n.type === 'welcome' || n.type === 'ban' || n.type === 'unban' ? (
                    <span>{n.message}</span>
                  ) : n.actor?.handle ? (
                    <>
                      <strong
                        onClick={(e) => { e.stopPropagation(); router.push(`/user/${n.actor.handle}`) }}
                        className="cursor-pointer hover:text-[#c084fc]"
                      >{n.actor?.display_name || 'Someone'}</strong> {n.message}
                    </>
                  ) : (
                    <><strong>{n.actor?.display_name || 'Someone'}</strong> {n.message}</>
                  )}
                </div>
                <div className="text-[0.7rem] text-[#52525b] mt-0.5">{n.created_at ? timeAgo(n.created_at) : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
