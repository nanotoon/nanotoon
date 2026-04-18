'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createAnonClient } from '@/lib/supabase/anon'

// The exact suspension message shown to a banned user on the sign-in screen.
// Kept here so both the "just tried to sign in and got bounced" path and the
// "was signed in, then banned, got redirected here" path use the same wording.
const BAN_MESSAGE =
  "Your account has been suspended for repeated or severe violations of NANOTOON's community guidelines. " +
  "You are no longer able to sign in, post content, comment, or otherwise interact with the platform. " +
  "If you believe this is a mistake, please contact nanotooncontact@gmail.com to appeal."

function SignInContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [banned, setBanned] = useState(false)
  const [loading, setLoading] = useState(false)
  // ─── Pending-deletion recovery panel state ────────────────────────────
  // When signin succeeds but the profile has deletion_status = 'pending',
  // we do NOT redirect. Instead we hold the session (so the user can act)
  // and render a panel with Recover / Delete-Now options. Per spec,
  // Delete-Now resets the 30-day timer rather than purging immediately.
  const [pending, setPending] = useState<null | { daysLeft: number; uid: string }>(null)
  const [pendingBusy, setPendingBusy] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const supabase = createClient()
  const anonDb = createAnonClient()

  // If AuthContext just force-signed-out a banned user and bounced them here,
  // show the suspension message immediately. The ?banned=1 marker is set by
  // AuthContext so we don't need a separate flag in state/localStorage.
  useEffect(() => {
    if (searchParams.get('banned') === '1') setBanned(true)
    // Same mechanism for pending-deletion redirects from the OAuth callback:
    // ?pending=1&uid=<id>&days=<n>. Presence of uid is the key.
    const pUid = searchParams.get('uid')
    const pDays = searchParams.get('days')
    if (searchParams.get('pending') === '1' && pUid) {
      setPending({ uid: pUid, daysLeft: parseInt(pDays || '30', 10) })
    }
  }, [searchParams])

  async function handleEmailSignIn() {
    setError('')
    setBanned(false)
    setPending(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    // Sign-in succeeded — now check flags BEFORE the router redirects.
    // Use anon client (no JWT) so the read doesn't race with session writes.
    const uid = data.user?.id
    if (uid) {
      const { data: prof } = await anonDb.from('profiles')
        .select('is_banned, deletion_status, deletion_scheduled_at')
        .eq('id', uid).maybeSingle() as { data: any }
      if (prof?.is_banned) {
        try { await supabase.auth.signOut() } catch {}
        setBanned(true)
        setLoading(false)
        return
      }
      if (prof?.deletion_status === 'pending') {
        // Keep the session live so the user can call /api/account-delete
        // with their own JWT. Render the recovery panel.
        const startMs = prof.deletion_scheduled_at ? new Date(prof.deletion_scheduled_at).getTime() : Date.now()
        const elapsedDays = Math.floor((Date.now() - startMs) / (24 * 60 * 60 * 1000))
        const daysLeft = Math.max(0, 30 - elapsedDays)
        setPending({ uid, daysLeft })
        setLoading(false)
        return
      }
    }
    router.push(redirect)
    router.refresh()
  }

  async function recoverAccount() {
    setPendingBusy(true)
    const res = await fetch('/api/account-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'recover' }),
    })
    const json = await res.json()
    setPendingBusy(false)
    if (!res.ok) { setError(json.error || 'Recovery failed'); return }
    // Session already active; just proceed to the app.
    router.push(redirect)
    router.refresh()
  }

  async function deleteNow() {
    // Per spec: "if they press delete again the count down for total
    // deletion is reset back to 30 days." So we re-stamp the schedule,
    // then sign the user out.
    setPendingBusy(true)
    const res = await fetch('/api/account-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-now' }),
    })
    await res.json().catch(() => ({}))
    try { await supabase.auth.signOut() } catch {}
    setPendingBusy(false)
    setPending(null)
    // Land back on home.
    window.location.replace('/')
  }

  async function handleOAuth(provider: 'google' | 'discord') {
    setError('')
    setBanned(false)
    setPending(null)
    // OAuth goes through /auth/callback which returns us here. AuthContext
    // will detect the banned flag after the session lands and redirect back
    // to /auth/signin?banned=1 — no extra check needed on this side.
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${redirect}` },
    })
    if (error) setError(error.message)
  }

  return (
    <div className="bg-[#18181b] rounded-2xl w-full max-w-[360px] border border-[#27272a] p-6">
      <h2 className="font-bold text-lg mb-5">Sign In to NANOTOON</h2>

      {/* ─── Pending-deletion recovery panel ──────────────────────────
         Shown when a signed-in user's profile is flagged pending. Takes
         over the whole card so the user has to consciously pick one of
         the two actions before using the site. */}
      {pending ? (
        <>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-base">⏳</span>
              <span className="text-[#fbbf24] text-xs font-semibold">Account pending deletion</span>
            </div>
            <p className="text-[#fde68a] text-[0.72rem] leading-relaxed">
              This account is scheduled to be permanently deleted in <strong>{pending.daysLeft} day{pending.daysLeft === 1 ? '' : 's'}</strong>. Would you like to recover it? After the countdown you won&apos;t be able to recover your account or series.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={recoverAccount} disabled={pendingBusy}
              className="w-full p-2.5 bg-[#7c3aed] text-white rounded-xl font-medium text-sm border-none cursor-pointer hover:bg-[#6d28d9] disabled:opacity-50">
              {pendingBusy ? 'Please wait…' : 'Recover My Account'}
            </button>
            <button onClick={deleteNow} disabled={pendingBusy}
              className="w-full p-2.5 border border-[#ef4444] text-[#f87171] bg-transparent rounded-xl font-medium text-sm cursor-pointer hover:bg-red-500/10 disabled:opacity-50">
              Keep deleting (resets timer to 30 days)
            </button>
          </div>
        </>
      ) : (<>

      {banned && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-base">🚫</span>
            <span className="text-[#f87171] text-xs font-semibold">Account Suspended</span>
          </div>
          <p className="text-[#fca5a5] text-[0.72rem] leading-relaxed">{BAN_MESSAGE}</p>
        </div>
      )}

      {error && !banned && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl p-2.5 mb-3">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 mb-4">
        <button
          onClick={() => handleOAuth('google')}
          className="w-full p-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#e4e4e7] text-sm flex items-center justify-center gap-2 cursor-pointer hover:border-[#a855f7]"
        >
          🔵 Continue with Google
        </button>
        <button
          onClick={() => handleOAuth('discord')}
          className="w-full p-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#e4e4e7] text-sm flex items-center justify-center gap-2 cursor-pointer hover:border-[#a855f7]"
        >
          🟣 Continue with Discord
        </button>
      </div>

      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="flex-1 h-px bg-[#27272a]"></div>
        <span className="text-[0.7rem] text-[#52525b]">or use email</span>
        <div className="flex-1 h-px bg-[#27272a]"></div>
      </div>

      <input
        type="email"
        placeholder="Email address"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl p-2.5 text-[#e4e4e7] text-sm outline-none mb-2 focus:border-[#a855f7]"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleEmailSignIn()}
        className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl p-2.5 text-[#e4e4e7] text-sm outline-none mb-1 focus:border-[#a855f7]"
      />

      <div className="flex justify-end mb-2">
        <Link href="/auth/forgot-password" className="text-[0.72rem] text-[#71717a] hover:text-[#c084fc] no-underline">
          Forgot password?
        </Link>
      </div>

      <button
        onClick={handleEmailSignIn}
        disabled={loading}
        className="w-full p-2.5 bg-[#7c3aed] text-white rounded-xl font-medium text-sm border-none cursor-pointer hover:bg-[#6d28d9] mt-0.5 disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      <p className="text-center mt-3 text-xs text-[#71717a]">
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" className="text-[#c084fc] no-underline">
          Register
        </Link>
      </p>
      </>)}
    </div>
  )
}

export default function SignInPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-[#71717a] text-sm">Loading Nanotoon...</div>}>
        <SignInContent />
      </Suspense>
    </div>
  )
}
