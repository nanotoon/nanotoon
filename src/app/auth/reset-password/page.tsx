'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Supabase puts the session tokens in the URL hash when the user clicks the email link.
  // We wait for the auth state to update before showing the form.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleUpdate() {
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError("Passwords don't match"); return }
    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess('Password updated! Redirecting to sign in...')
    setTimeout(() => router.push('/auth/signin'), 2000)
    setLoading(false)
  }

  if (!ready) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-[#18181b] rounded-2xl w-full max-w-[360px] border border-[#27272a] p-6 text-center">
          <p className="text-[#71717a] text-sm">Verifying your reset link...</p>
          <p className="text-[#52525b] text-xs mt-2">
            If nothing happens,{' '}
            <a href="/auth/forgot-password" className="text-[#c084fc]">request a new link</a>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="bg-[#18181b] rounded-2xl w-full max-w-[360px] border border-[#27272a] p-6">
        <h2 className="font-bold text-lg mb-1">Set New Password</h2>
        <p className="text-xs text-[#71717a] mb-5">Choose a strong password for your account.</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl p-2.5 mb-3">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs rounded-xl p-2.5 mb-3">
            {success}
          </div>
        )}

        <input
          type="password"
          placeholder="New password (min 8 chars)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl p-2.5 text-[#e4e4e7] text-sm outline-none mb-2 focus:border-[#a855f7]"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleUpdate()}
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl p-2.5 text-[#e4e4e7] text-sm outline-none mb-3 focus:border-[#a855f7]"
        />

        <button
          onClick={handleUpdate}
          disabled={loading || !!success}
          className="w-full p-2.5 bg-[#7c3aed] text-white rounded-xl font-medium text-sm border-none cursor-pointer hover:bg-[#6d28d9] disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </div>
  )
}
