'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function SignInContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const supabase = createClient()

  async function handleEmailSignIn() {
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push(redirect)
    router.refresh()
  }

  async function handleOAuth(provider: 'google' | 'discord') {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${redirect}` },
    })
    if (error) setError(error.message)
  }

  return (
    <div className="bg-[#18181b] rounded-2xl w-full max-w-[360px] border border-[#27272a] p-6">
      <h2 className="font-bold text-lg mb-5">Sign In to NANOTOON</h2>

      {error && (
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
