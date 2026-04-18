"use client"
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { readProfileLinks, normalizeUrl, MAX_PROFILE_LINKS, type ProfileLink } from '@/lib/profileLinks'

export default function SettingsPage() {
  const { show } = useToast(); const { user, profile, refreshProfile, signOut } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [dn, setDn] = useState(profile?.display_name || ''); const [bio, setBio] = useState(profile?.bio || '')
  // ─── Links editor state ────────────────────────────────────────────────
  // Up to 4 { title, url } rows. On open we seed from the existing
  // profile (new JSONB column preferred; legacy `links` string treated
  // as a single entry via readProfileLinks). Saving writes to links_json
  // and clears the legacy `links` column so old free-text values stop
  // shadowing the new data.
  const [linksDraft, setLinksDraft] = useState<ProfileLink[]>([])
  const [editDn, setEditDn] = useState(false); const [editBio, setEditBio] = useState(false); const [editLinks, setEditLinks] = useState(false)
  const [linksSaving, setLinksSaving] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false); const [newPw, setNewPw] = useState(''); const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false); const [pwError, setPwError] = useState(''); const [pwSuccess, setPwSuccess] = useState('')

  // ─── Delete Account modal state ────────────────────────────────────────
  // Three-step flow: 'type' (user must type "delete") → 'confirm' (final
  // warning) → 'done' (account deleted, signing out). Shown from the
  // Danger Zone button. Local state only — no global modal store needed.
  const [delStep, setDelStep] = useState<null | 'type' | 'confirm' | 'done'>(null)
  const [delText, setDelText] = useState('')
  const [delError, setDelError] = useState('')
  const [delLoading, setDelLoading] = useState(false)

  function closeDelete() { setDelStep(null); setDelText(''); setDelError(''); setDelLoading(false) }

  async function confirmDeletion() {
    setDelLoading(true); setDelError('')
    try {
      const res = await fetch('/api/account-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const json = await res.json()
      if (!res.ok) { setDelError(json.error || 'Deletion failed'); setDelLoading(false); return }
      setDelStep('done')
      // Hold the success message for ~2s, then sign out + redirect to /.
      setTimeout(async () => {
        await signOut()   // already redirects to '/'
        router.refresh()
      }, 2200)
    } catch (e: any) {
      setDelError(e?.message || 'Network error')
      setDelLoading(false)
    }
  }

  async function saveField(field: string, value: string, close: () => void) {
    if (!user) return; await supabase.from('profiles').update({ [field]: value || null }).eq('id', user.id); await refreshProfile(); close(); show('Updated!')
  }

  async function handleChangePassword() {
    setPwError(''); setPwSuccess('')
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return }
    if (newPw !== confirmPw) { setPwError("Passwords don't match"); return }
    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setPwError(error.message)
    else { setPwSuccess('Password changed!'); setNewPw(''); setConfirmPw(''); setTimeout(() => setShowChangePw(false), 1500) }
    setPwLoading(false)
  }

  // Save the multi-link array to links_json. Filters out empty rows, caps
  // at MAX_PROFILE_LINKS, normalizes each URL (so "patreon.com/x" becomes
  // "https://patreon.com/x"), and clears the legacy `links` string so it
  // stops shadowing the new data on old accounts.
  async function saveLinks() {
    if (!user) return
    setLinksSaving(true)
    const cleaned = linksDraft
      .map(l => ({ title: (l.title || '').trim(), url: (l.url || '').trim() }))
      .filter(l => l.url.length > 0)
      .slice(0, MAX_PROFILE_LINKS)
      .map(l => ({ title: l.title || l.url, url: normalizeUrl(l.url) }))
    const { error } = await supabase.from('profiles').update({
      links_json: cleaned.length > 0 ? cleaned : null,
      links: null,
    }).eq('id', user.id)
    setLinksSaving(false)
    if (error) { show('Save failed: ' + error.message); return }
    await refreshProfile()
    setEditLinks(false)
    show('Links updated!')
  }

  function openLinksEditor() {
    // Seed the editor from whatever the profile currently has.
    const seed = readProfileLinks(profile)
    setLinksDraft(seed.length > 0 ? seed : [{ title: '', url: '' }])
    setEditLinks(true)
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back</Link>
      <h1 className="text-xl font-bold text-[#c084fc] mb-5">Settings</h1>
      <h2 className="text-sm font-semibold mb-2.5">Profile</h2>
      <div className="bg-[#18181b] rounded-2xl p-4 flex flex-col gap-3.5 mb-6">
        <div className="flex justify-between items-start"><div className="flex-1"><p className="font-medium text-sm">Display Name</p>
          {!editDn ? <p className="text-[#71717a] text-sm mt-0.5">{profile?.display_name || 'Not set'}</p> : (
            <div className="mt-1.5 flex items-center gap-1.5"><input value={dn} onChange={e => setDn(e.target.value)} className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-1 px-2.5 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] max-w-[240px]" />
            <button onClick={() => saveField('display_name', dn, () => setEditDn(false))} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-xs">Save</button>
            <button onClick={() => setEditDn(false)} className="text-[#71717a] bg-transparent border-none cursor-pointer text-xs">Cancel</button></div>
          )}</div>{!editDn && <button onClick={() => { setDn(profile?.display_name || ''); setEditDn(true) }} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-sm shrink-0">Edit</button>}</div>
        <div className="flex justify-between items-start"><div className="flex-1"><p className="font-medium text-sm">Bio</p>
          {!editBio ? <p className="text-[#71717a] text-sm mt-0.5">{profile?.bio || 'No bio yet'}</p> : (
            <div className="mt-1.5"><textarea value={bio} onChange={e => setBio(e.target.value)} rows={2} className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] resize-y font-[inherit] max-w-[340px]" />
            <div className="flex gap-1.5"><button onClick={() => saveField('bio', bio, () => setEditBio(false))} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-xs">Save</button>
            <button onClick={() => setEditBio(false)} className="text-[#71717a] bg-transparent border-none cursor-pointer text-xs">Cancel</button></div></div>
          )}</div>{!editBio && <button onClick={() => { setBio(profile?.bio || ''); setEditBio(true) }} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-sm shrink-0">Edit</button>}</div>
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Links</p>
            {!editLinks ? (
              // Read-only display: list each link as a clickable anchor so
              // visitors (and the user themselves) can actually open them.
              // Falls back to the legacy `links` string for unmigrated
              // accounts (handled inside readProfileLinks).
              (() => {
                const items = readProfileLinks(profile)
                if (items.length === 0) return <p className="text-[#71717a] text-sm mt-0.5">No links</p>
                return (
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {items.map((l, i) => (
                      <a key={i} href={normalizeUrl(l.url)} target="_blank" rel="noopener noreferrer"
                         className="text-[#c084fc] text-sm truncate hover:text-[#a855f7] no-underline">
                        {l.title || l.url}
                      </a>
                    ))}
                  </div>
                )
              })()
            ) : (
              // Editor: up to MAX_PROFILE_LINKS rows of { title, url }.
              // Title is optional — if left blank on save, we default to
              // the URL so every anchor has a visible label.
              <div className="mt-1.5 flex flex-col gap-2 max-w-[420px]">
                {linksDraft.map((row, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-1.5 items-stretch sm:items-center">
                    <input value={row.title}
                      onChange={e => setLinksDraft(prev => prev.map((r, j) => j === i ? { ...r, title: e.target.value } : r))}
                      placeholder="Title (e.g. Follow my Patreon)"
                      className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-1 px-2.5 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] sm:w-[170px]" />
                    <input value={row.url}
                      onChange={e => setLinksDraft(prev => prev.map((r, j) => j === i ? { ...r, url: e.target.value } : r))}
                      placeholder="Website or social media link"
                      className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-1 px-2.5 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] flex-1 min-w-0" />
                    <button onClick={() => setLinksDraft(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ title: '', url: '' }])}
                      title="Remove"
                      className="text-[#71717a] bg-transparent border border-[#3f3f46] rounded-lg px-2 py-1 cursor-pointer text-xs hover:border-[#ef4444] hover:text-[#f87171] shrink-0 sm:w-auto self-start sm:self-auto">
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <button
                    disabled={linksDraft.length >= MAX_PROFILE_LINKS}
                    onClick={() => setLinksDraft(prev => prev.length >= MAX_PROFILE_LINKS ? prev : [...prev, { title: '', url: '' }])}
                    className="px-2.5 py-1 border border-[#3f3f46] rounded-lg bg-transparent text-[#c084fc] text-xs cursor-pointer hover:border-[#a855f7] disabled:opacity-40 disabled:cursor-not-allowed">
                    + Add another
                  </button>
                  <span className="text-[0.68rem] text-[#52525b]">Max {MAX_PROFILE_LINKS}.</span>
                  <button disabled={linksSaving} onClick={saveLinks}
                    className="text-[#c084fc] bg-transparent border-none cursor-pointer text-xs disabled:opacity-50">
                    {linksSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button disabled={linksSaving} onClick={() => setEditLinks(false)}
                    className="text-[#71717a] bg-transparent border-none cursor-pointer text-xs disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {!editLinks && <button onClick={openLinksEditor} className="text-[#c084fc] bg-transparent border-none cursor-pointer text-sm shrink-0">Edit</button>}
        </div>
        <div><p className="font-medium text-sm">Email</p><p className="text-[#71717a] text-sm mt-0.5">{user?.email || 'Not set'}</p></div>
      </div>

      <h2 className="text-sm font-semibold mb-2.5">Security</h2>
      <div className="bg-[#18181b] rounded-2xl p-4 mb-6">
        {!showChangePw ? <button onClick={() => setShowChangePw(true)} className="px-4 py-2 border border-[#3f3f46] text-[#c084fc] bg-transparent rounded-xl cursor-pointer text-sm hover:border-[#a855f7]">Change Password</button> : (
          <div className="flex flex-col gap-2">
            <p className="font-medium text-sm mb-1">Change Password</p>
            {pwError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl p-2.5">{pwError}</div>}
            {pwSuccess && <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs rounded-xl p-2.5">{pwSuccess}</div>}
            <input type="password" placeholder="New password (min 8 chars)" value={newPw} onChange={e => setNewPw(e.target.value)} className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] max-w-[300px]" />
            <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChangePassword()} className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none focus:border-[#a855f7] max-w-[300px]" />
            <div className="flex gap-2">
              <button onClick={handleChangePassword} disabled={pwLoading} className="px-4 py-1.5 bg-[#7c3aed] text-white rounded-lg text-sm font-medium border-none cursor-pointer hover:bg-[#6d28d9] disabled:opacity-50">{pwLoading ? 'Updating...' : 'Update Password'}</button>
              <button onClick={() => { setShowChangePw(false); setPwError(''); setPwSuccess('') }} className="px-4 py-1.5 border border-[#3f3f46] text-[#71717a] bg-transparent rounded-lg text-sm cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
      </div>

      <h2 className="text-sm font-semibold mb-2.5">Danger Zone</h2>
      <div className="bg-[#18181b] rounded-2xl p-4">
        <button onClick={() => setDelStep('type')}
          className="px-4 py-2 border border-[#ef4444] text-[#f87171] bg-transparent rounded-xl cursor-pointer text-sm hover:bg-red-500/10">Delete Account</button>
      </div>

      {/* ─── Delete Account Modal ─────────────────────────────────────
         Fixed full-viewport overlay with a centered card. Card uses
         w-[92vw] + max-w-[420px] so it spans nearly the whole phone
         screen but caps on desktop. On mobile the action buttons stack
         (flex-col-reverse) with the destructive action on top; on
         desktop they sit inline, right-aligned. Tap-outside-to-close is
         suppressed while the deletion call is in flight and on the
         'done' screen so the user can't accidentally dismiss mid-flow.
      */}
      {delStep && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
             onClick={() => { if (!delLoading && delStep !== 'done') closeDelete() }}>
          <div onClick={e => e.stopPropagation()}
               className="bg-[#18181b] border border-[#27272a] rounded-2xl w-[92vw] max-w-[420px] p-5 md:p-6 shadow-2xl">
            {delStep === 'type' && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">⚠️</span>
                  <h3 className="text-base md:text-lg font-bold text-[#f87171]">Delete Your Account?</h3>
                </div>
                <p className="text-[#a1a1aa] text-xs md:text-sm leading-relaxed mb-3">
                  This will sign you out and hide your profile and all your series from NANOTOON. You have <strong className="text-white">30 days</strong> to recover by signing in again — after that, everything will be permanently deleted and cannot be restored.
                </p>
                <p className="text-[#a1a1aa] text-xs md:text-sm mb-2">
                  Type <span className="font-mono font-bold text-white bg-[#27272a] px-1.5 py-0.5 rounded">delete</span> below to proceed.
                </p>
                <input autoFocus value={delText} onChange={e => setDelText(e.target.value)}
                  placeholder="delete"
                  className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2.5 text-white text-sm outline-none mb-3 focus:border-[#ef4444] font-mono" />
                {delError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg p-2 mb-3">{delError}</div>}
                <div className="flex flex-col-reverse md:flex-row gap-2 md:justify-end">
                  <button onClick={closeDelete}
                    className="px-4 py-2 border border-[#3f3f46] text-[#a1a1aa] bg-transparent rounded-xl cursor-pointer text-sm hover:border-[#71717a]">
                    Cancel
                  </button>
                  <button disabled={delText.trim().toLowerCase() !== 'delete'}
                    onClick={() => { setDelError(''); setDelStep('confirm') }}
                    className="px-4 py-2 bg-[#ef4444] text-white rounded-xl text-sm font-medium border-none cursor-pointer hover:bg-[#dc2626] disabled:opacity-40 disabled:cursor-not-allowed">
                    Continue
                  </button>
                </div>
              </>
            )}
            {delStep === 'confirm' && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🛑</span>
                  <h3 className="text-base md:text-lg font-bold text-[#f87171]">Last Chance.</h3>
                </div>
                <p className="text-[#a1a1aa] text-xs md:text-sm leading-relaxed mb-4">
                  Once you continue, you&apos;ll be signed out. Your profile and series will be hidden from everyone. You can still recover by signing in within the next 30 days — after that, it&apos;s gone for good.
                </p>
                {delError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg p-2 mb-3">{delError}</div>}
                <div className="flex flex-col-reverse md:flex-row gap-2 md:justify-end">
                  <button disabled={delLoading} onClick={() => setDelStep('type')}
                    className="px-4 py-2 border border-[#3f3f46] text-[#a1a1aa] bg-transparent rounded-xl cursor-pointer text-sm hover:border-[#71717a] disabled:opacity-50">
                    Go Back
                  </button>
                  <button disabled={delLoading} onClick={confirmDeletion}
                    className="px-4 py-2 bg-[#ef4444] text-white rounded-xl text-sm font-medium border-none cursor-pointer hover:bg-[#dc2626] disabled:opacity-50">
                    {delLoading ? 'Deleting…' : 'Yes, Delete My Account'}
                  </button>
                </div>
              </>
            )}
            {delStep === 'done' && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">✅</span>
                  <h3 className="text-base md:text-lg font-bold text-white">Account Deleted</h3>
                </div>
                <p className="text-[#a1a1aa] text-xs md:text-sm leading-relaxed mb-1">
                  Your account has been permanently deleted. Signing you out now…
                </p>
                <p className="text-[#52525b] text-[0.7rem] md:text-xs">
                  Changed your mind? Sign in within 30 days to recover everything.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
