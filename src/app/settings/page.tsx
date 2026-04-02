'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

function Toggle({ label, sub, defaultOn = true, onChange }: { label: string; sub: string; defaultOn?: boolean; onChange?: (val: boolean) => void }) {
  const [on, setOn] = useState(defaultOn); const { show } = useToast()
  return (
    <div className="flex justify-between items-center">
      <div><p className="font-medium text-sm">{label}</p><p className="text-[#71717a] text-xs mt-0.5">{sub}</p></div>
      <button onClick={() => { const next = !on; setOn(next); show(next ? 'Enabled' : 'Disabled'); onChange?.(next) }}
        className={`w-9 h-5 rounded-full border-none cursor-pointer relative shrink-0 ${on ? 'bg-[#7c3aed]' : 'bg-[#3f3f46]'}`}>
        <span className={`absolute top-[1.5px] w-4 h-4 bg-white rounded-full transition-all ${on ? 'right-[2px]' : 'left-[1.5px]'}`}></span>
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const { show } = useToast(); const { user, profile, refreshProfile } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [dn, setDn] = useState(profile?.display_name || ''); const [bio, setBio] = useState(profile?.bio || ''); const [links, setLinks] = useState(profile?.links || '')
  const [editDn, setEditDn] = useState(false); const [editBio, setEditBio] = useState(false); const [editLinks, setEditLinks] = useState(false)

  // Change password
  const [showChangePw, setShowChangePw] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  // Gallery toggle
  const [galleryHidden, setGalleryHidden] = useState(false)
  const [showGalleryConfirm, setShowGalleryConfirm] = useState(false)

  async function saveField(field: string, value: string, close: () => void) {
    if (!user) return; await supabase.from('profiles').update({ [field]: value || null }).eq('id', user.id); await refreshProfile(); close(); show('Updated!')
  }

  async function handleChangePassword() {
    setPwError(''); setPwSuccess('')
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return }
    if (newPw !== confirmPw) { setPwError("Passwords don't match"); return }
    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwError(error.message) }
    else { setPwSuccess('Password changed successfully!'); setNewPw(''); setConfirmPw(''); setTimeout(() => setShowChangePw(false), 1500) }
    setPwLoading(false)
  }

  function handleGalleryToggle() {
    if (!galleryHidden) {
      // Currently showing, wants to hide — just toggle
      setGalleryHidden(true)
      show('Gallery/Artworks hidden')
    } else {
      // Currently hidden, wants to show — show confirmation
      setShowGalleryConfirm(true)
    }
  }

  function confirmShowGallery() {
    setGalleryHidden(false)
    setShowGalleryConfirm(false)
    show('Gallery/Artworks now visible')
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl font-bold text-[#c084fc] mb-5">Settings</h1>
      <h2 className="text-sm font-semibold mb-2.5">Profile</h2>
      <div className="bg-[#18181b] rounded-2xl p-4 flex flex-col gap-3.5 mb-6">
        <div className="flex justify-between items-start"><div className="flex-1"><p className="font-medium text-sm">Display Name</p>
          {!editDn ? <p className="text-[#71717a] text-sm mt-0.5">{profile?.display_name || 'Not set'}</p> : (
            <div className="mt-1.5 flex items-center gap-1.5"><input value={dn} onChange={e => setDn(e.target.value)} className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-1 px-2.5 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] max-w-[240px]" />
            <button onClick={() => saveField('display_name', dn, () => setEditDn(false))} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-xs">Save</button>
            <button onClick={() => setEditDn(false)} className="text-[#71717a] bg-transparent border-none cursor-pointer text-xs">Cancel</button></div>
          )}</div>{!editDn && <button onClick={() => { setDn(profile?.display_name || ''); setEditDn(true) }} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-sm shrink-0">Edit</button>}
        </div>
        <div className="flex justify-between items-start"><div className="flex-1"><p className="font-medium text-sm">Bio</p>
          {!editBio ? <p className="text-[#71717a] text-sm mt-0.5">{profile?.bio || 'No bio yet'}</p> : (
            <div className="mt-1.5"><textarea value={bio} onChange={e => setBio(e.target.value)} rows={2} className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] resize-y font-[inherit] max-w-[340px]" />
            <div className="flex gap-1.5"><button onClick={() => saveField('bio', bio, () => setEditBio(false))} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-xs">Save</button>
            <button onClick={() => setEditBio(false)} className="text-[#71717a] bg-transparent border-none cursor-pointer text-xs">Cancel</button></div></div>
          )}</div>{!editBio && <button onClick={() => { setBio(profile?.bio || ''); setEditBio(true) }} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-sm shrink-0">Edit</button>}
        </div>
        <div className="flex justify-between items-start"><div className="flex-1"><p className="font-medium text-sm">Links</p>
          {!editLinks ? <p className="text-[#71717a] text-sm mt-0.5">{profile?.links || 'No links'}</p> : (
            <div className="mt-1.5 flex items-center gap-1.5"><input value={links} onChange={e => setLinks(e.target.value)} placeholder="patreon.com/you" className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-1 px-2.5 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] max-w-[300px] w-full" />
            <button onClick={() => saveField('links', links, () => setEditLinks(false))} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-xs">Save</button>
            <button onClick={() => setEditLinks(false)} className="text-[#71717a] bg-transparent border-none cursor-pointer text-xs">Cancel</button></div>
          )}</div>{!editLinks && <button onClick={() => { setLinks(profile?.links || ''); setEditLinks(true) }} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-sm shrink-0">Edit</button>}
        </div>
        <div><p className="font-medium text-sm">Email</p><p className="text-[#71717a] text-sm mt-0.5">{user?.email || 'Not set'}</p></div>
      </div>

      {/* Change Password */}
      <h2 className="text-sm font-semibold mb-2.5">Security</h2>
      <div className="bg-[#18181b] rounded-2xl p-4 mb-6">
        {!showChangePw ? (
          <button onClick={() => setShowChangePw(true)} className="px-4 py-2 border border-[#3f3f46] text-[#c084fc] bg-transparent rounded-xl cursor-pointer text-sm hover:border-[#a855f7]">Change Password</button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-medium text-sm mb-1">Change Password</p>
            {pwError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl p-2.5">{pwError}</div>}
            {pwSuccess && <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs rounded-xl p-2.5">{pwSuccess}</div>}
            <input type="password" placeholder="New password (min 8 chars)" value={newPw} onChange={e => setNewPw(e.target.value)}
              className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] max-w-[300px]" />
            <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
              className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] max-w-[300px]" />
            <div className="flex gap-2">
              <button onClick={handleChangePassword} disabled={pwLoading}
                className="px-4 py-1.5 bg-[#7c3aed] text-white rounded-lg text-sm font-medium border-none cursor-pointer hover:bg-[#6d28d9] disabled:opacity-50">
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
              <button onClick={() => { setShowChangePw(false); setPwError(''); setPwSuccess('') }}
                className="px-4 py-1.5 border border-[#3f3f46] text-[#71717a] bg-transparent rounded-lg text-sm cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
      </div>

      <h2 className="text-sm font-semibold mb-2.5">Content</h2>
      <div className="bg-[#18181b] rounded-2xl p-4 flex flex-col gap-3 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-medium text-sm">{galleryHidden ? 'Show Gallery/Artworks' : 'Hide Gallery/Artworks'}</p>
            <p className="text-[#71717a] text-xs mt-0.5">{galleryHidden ? 'Gallery is currently hidden from all users' : 'Gallery is currently visible to everyone'}</p>
          </div>
          <button onClick={handleGalleryToggle}
            className={`w-9 h-5 rounded-full border-none cursor-pointer relative shrink-0 ${galleryHidden ? 'bg-[#3f3f46]' : 'bg-[#7c3aed]'}`}>
            <span className={`absolute top-[1.5px] w-4 h-4 bg-white rounded-full transition-all ${galleryHidden ? 'left-[1.5px]' : 'right-[2px]'}`}></span>
          </button>
        </div>
      </div>

      <h2 className="text-sm font-semibold mb-2.5">Notifications</h2>
      <div className="bg-[#18181b] rounded-2xl p-4 flex flex-col gap-3 mb-6">
        <Toggle label="New chapter alerts" sub="When followed series update" />
        <Toggle label="Comment replies" sub="When someone replies to you" />
      </div>
      <h2 className="text-sm font-semibold mb-2.5">Danger Zone</h2>
      <div className="bg-[#18181b] rounded-2xl p-4">
        <button onClick={() => { if (confirm('Delete your account?')) if (confirm('All data permanently deleted. Confirm?')) show('Account deletion scheduled.') }}
          className="px-4 py-2 border border-[#ef4444] text-[#f87171] bg-transparent rounded-xl cursor-pointer text-sm hover:bg-red-500/10">Delete Account</button>
      </div>

      {/* Gallery confirm dialog */}
      {showGalleryConfirm && (
        <div className="fixed inset-0 bg-black/90 z-[300] flex items-center justify-center p-4" onClick={() => setShowGalleryConfirm(false)}>
          <div className="bg-[#18181b] rounded-2xl max-w-[420px] w-full border border-[#27272a] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-base mb-3">Show Gallery/Artworks?</h3>
            <p className="text-[#a1a1aa] text-sm mb-4">
              This will make the Gallery tab visible on the homepage again. All your artworks will reappear in feeds, search results, notifications, following lists, favorites, and all user profiles.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowGalleryConfirm(false)}
                className="flex-1 py-2 border border-[#3f3f46] rounded-lg bg-transparent text-[#a1a1aa] cursor-pointer text-sm">Cancel</button>
              <button onClick={confirmShowGallery}
                className="flex-1 py-2 bg-[#7c3aed] text-white rounded-lg text-sm font-medium border-none cursor-pointer hover:bg-[#6d28d9]">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
