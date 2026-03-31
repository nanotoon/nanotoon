'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleReset() {
    setError('')
    setSuccess('')
    if (!email.trim()) { setError('Please enter your email address'); return }
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Password reset email sent! Check your inbox (and spam folder).')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="bg-[#18181b] rounded-2xl w-full max-w-[360px] border border-[#27272a] p-6">
        <h2 className="font-bold text-lg mb-1">Forgot Password</h2>
        <p className="text-xs text-[#71717a] mb-5">Enter your email and we'll send you a reset link.</p>

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
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleReset()}
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl p-2.5 text-[#e4e4e7] text-sm outline-none mb-3 focus:border-[#a855f7]"
        />

        <button
          onClick={handleReset}
          disabled={loading}
          className="w-full p-2.5 bg-[#7c3aed] text-white rounded-xl font-medium text-sm border-none cursor-pointer hover:bg-[#6d28d9] disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>

        <p className="text-center mt-3 text-xs text-[#71717a]">
          Remember it?{' '}
          <Link href="/auth/signin" className="text-[#c084fc] no-underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
