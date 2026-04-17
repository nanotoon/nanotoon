'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useMemo } from 'react'
import { UploadModal } from './UploadModal'
import { useToast } from './Toast'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { createAnonClient } from '@/lib/supabase/anon'
import { createWriteClient, ensureFreshSession } from '@/lib/supabase/write'

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { show } = useToast()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [liveResults, setLiveResults] = useState<any[]>([])
  const [showLive, setShowLive] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const anonDb = useMemo(() => createAnonClient(), [])
  const [unreadCount, setUnreadCount] = useState(0)
  const { user, profile, signOut } = useAuth()
  const isLoggedIn = !!user

  const publicTabs = [
    { href: '/', label: 'Read' },
    { href: '/categories', label: 'Categories' },
  ]
  const privateTabs = [
    { href: '/favorites', label: 'Favorites' },
    { href: '/following', label: 'Following' },
  ]
  const tabs = isLoggedIn ? [...publicTabs, ...privateTabs] : publicTabs

  useEffect(() => {
    function h(e: MouseEvent) { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowLive(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  // Fetch unread notification count for the logged-in user
  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    let cancelled = false
    async function load() {
      const { count } = await anonDb.from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id).eq('read', false) as any
      if (!cancelled) setUnreadCount(count ?? 0)
    }
    load()
    return () => { cancelled = true }
  }, [user, anonDb, pathname])

  // Clear the notification badge immediately on click and mark all read in the database.
  // This is intentional "bell-click = acknowledged" UX — matches Reddit, GitHub, etc.
  async function handleBellClick() {
    setUnreadCount(0)
    if (!user) return
    await ensureFreshSession()
    const wc = createWriteClient()
    if (wc) {
      await (wc as any).from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    }
  }

  function handleInput(val: string) {
    setSearchQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!val.trim()) { setLiveResults([]); setShowLive(false); return }
    timerRef.current = setTimeout(async () => {
      const { data } = await supabase.from('series').select('id,title,slug,thumbnail_url').ilike('title', `%${val.trim()}%`).order('total_views', { ascending: false }).limit(6)
      setLiveResults(data ?? []); setShowLive(true)
    }, 250)
  }

  function handleKey(e: React.KeyboardEvent) { if (e.key === 'Enter' && searchQuery.trim()) { setShowLive(false); router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`) } }
  async function handleSignOut() { setShowDropdown(false); await signOut() }

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'User'
  const handle = profile?.handle || 'user'

  return (
    <>
      <nav className="bg-black border-b border-[#27272a] sticky top-0 z-50 w-full">
        <div className="w-full px-4 md:px-8 h-[56px] md:h-[84px] flex items-center gap-2 md:gap-5">
          <Link href="/" className="flex items-center gap-2 md:gap-3 shrink-0 no-underline">
            <div className="w-[30px] h-[30px] md:w-[45px] md:h-[45px] bg-gradient-to-br from-[#7c3aed] to-[#c026d3] rounded-lg md:rounded-xl flex items-center justify-center"><span className="text-white font-bold text-[12px] md:text-[22px]">N</span></div>
            <span className="text-white font-semibold text-lg md:text-3xl tracking-tight hidden sm:block">NANOTOON</span>
          </Link>
          <div className="flex-1 relative" ref={searchRef}>
            <input type="text" placeholder="Search..." value={searchQuery} onChange={e => handleInput(e.target.value)} onKeyDown={handleKey} onFocus={() => { if (liveResults.length) setShowLive(true) }}
              className="w-full bg-[#18181b] border border-[#3f3f46] rounded-xl md:rounded-2xl py-1.5 md:py-3 px-3 md:px-5 pl-8 md:pl-14 text-xs md:text-xl text-[#e4e4e7] outline-none focus:border-[#a855f7] placeholder:text-[#52525b]" />
            <svg className="absolute left-2.5 md:left-5 top-1/2 -translate-y-1/2 text-[#71717a]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            {showLive && liveResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#18181b] border border-[#3f3f46] rounded-xl shadow-2xl z-[300] max-h-[300px] overflow-y-auto">
                {liveResults.map(s => (
                  <Link key={s.id} href={`/series/${s.slug}`} onClick={() => { setShowLive(false); setSearchQuery('') }} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#27272a] no-underline">
                    {s.thumbnail_url ? <img src={s.thumbnail_url} className="w-7 h-9 rounded object-cover shrink-0" alt="" /> : <div className="w-7 h-9 rounded bg-[#27272a] shrink-0 flex items-center justify-center text-xs">📖</div>}
                    <span className="text-sm text-[#e4e4e7] truncate">{s.title}</span>
                  </Link>
                ))}
                <button onClick={() => { setShowLive(false); router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`) }} className="w-full px-3 py-2 border-t border-[#27272a] text-xs text-[#c084fc] bg-transparent cursor-pointer text-left hover:bg-[#27272a] border-l-0 border-r-0 border-b-0">See all results →</button>
              </div>
            )}
          </div>
          {isLoggedIn ? (
            <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
              <button onClick={() => setShowUpload(true)} className="bg-gradient-to-br from-[#7c3aed] to-[#c026d3] text-white px-2 md:px-5 py-1.5 md:py-2.5 rounded-lg md:rounded-2xl border-none cursor-pointer font-medium flex items-center gap-1.5 text-xs md:text-lg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                <span className="hidden md:inline">Upload</span>
              </button>
              <Link href="/notifications" onClick={handleBellClick} className="relative w-[30px] h-[30px] md:w-[45px] md:h-[45px] bg-[#18181b] border border-[#3f3f46] rounded-lg md:rounded-xl flex items-center justify-center text-[#a1a1aa] no-underline">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 min-w-[16px] h-[16px] md:min-w-[18px] md:h-[18px] bg-red-600 rounded-full border-2 border-black text-white text-[0.55rem] md:text-[0.65rem] font-bold flex items-center justify-center px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </div>
                )}
              </Link>
              <div className="relative">
                <button onClick={() => setShowDropdown(!showDropdown)} className="bg-transparent border-none cursor-pointer p-0">
                  <div className="w-[30px] h-[30px] md:w-[45px] md:h-[45px] rounded-full border-[2px] md:border-[3px] border-[#a855f7] overflow-hidden">
                    {profile?.avatar_url ? <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" /> : <Avatar name={displayName} size={45} className="w-full h-full" />}
                  </div>
                </button>
                {showDropdown && (
                  <div className="absolute right-0 top-[calc(100%+9px)] w-[220px] md:w-[280px] bg-[#18181b] border border-[#3f3f46] rounded-2xl py-1 shadow-2xl z-[200]">
                    <div className="px-4 py-3 border-b border-[#3f3f46] flex items-center gap-2.5">
                      {profile?.avatar_url ? <img src={profile.avatar_url} alt={displayName} className="w-9 h-9 rounded-full object-cover" /> : <Avatar name={displayName} size={36} />}
                      <div><p className="font-medium text-base md:text-lg">{displayName}</p><p className="text-xs md:text-sm text-[#71717a]">@{handle}</p></div>
                    </div>
                    <Link href="/profile" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-[#e4e4e7] hover:bg-[#27272a] text-base md:text-lg no-underline">👤 Profile</Link>
                    <Link href="/followers" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-[#e4e4e7] hover:bg-[#27272a] text-base md:text-lg no-underline">👥 Followers</Link>
                    <Link href="/faq" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-[#e4e4e7] hover:bg-[#27272a] text-base md:text-lg no-underline">❓ FAQ</Link>
                    <Link href="/settings" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-[#e4e4e7] hover:bg-[#27272a] text-base md:text-lg no-underline">⚙️ Settings</Link>
                    <div className="border-t border-[#3f3f46] my-1"></div>
                    <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-5 py-3 text-[#f87171] hover:bg-[#27272a] text-base md:text-lg bg-transparent border-none cursor-pointer text-left">Sign Out</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <Link href="/auth/signin" className="px-3 md:px-4 py-1.5 md:py-2 border border-[#3f3f46] rounded-xl md:rounded-2xl text-[#e4e4e7] text-xs md:text-base hover:border-[#a855f7] no-underline">Sign In</Link>
              <Link href="/auth/register" className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-br from-[#7c3aed] to-[#c026d3] rounded-xl md:rounded-2xl text-white text-xs md:text-base font-medium no-underline">Register</Link>
            </div>
          )}
        </div>
        <div className="w-full px-4 md:px-8 border-t border-[#27272a]">
          <div className="flex items-center h-[40px] md:h-[63px] gap-4 md:gap-9 text-xs md:text-xl font-medium overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {tabs.map(tab => (
              <Link key={tab.href} href={tab.href} className={`pb-3 md:pb-[18px] border-b-[2px] md:border-b-[3px] whitespace-nowrap no-underline ${pathname === tab.href ? 'border-[#a855f7] text-[#c084fc]' : 'border-transparent text-[#71717a] hover:text-[#d4d4d8]'}`}>{tab.label}</Link>
            ))}
          </div>
        </div>
      </nav>
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onToast={show} />}
    </>
  )
}
