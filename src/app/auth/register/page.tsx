'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const supabase = createClient()

  async function handleRegister() {
    setError('')
    setSuccess('')

    if (!name.trim()) { setError('Display name is required'); return }
    if (!email.trim()) { setError('Email is required'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError("Passwords don't match"); return }

    setLoading(true)

    // Sign up — the database trigger handle_new_user() automatically
    // creates the profile row, so we do NOT insert into profiles manually.
    // We pass the display_name in metadata so the trigger can use it.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name.trim(),
          full_name: name.trim(),
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // If email confirmation is required, show message
    if (data.user && !data.session) {
      setSuccess('Check your email to confirm your account!')
      setLoading(false)
      return
    }

    // If auto-confirmed (e.g. email confirmation disabled in Supabase), redirect
    if (data.session) {
      router.push('/')
      router.refresh()
      return
    }

    setLoading(false)
  }

  async function handleOAuth(provider: 'google' | 'discord') {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) setError(error.message)
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="bg-[#18181b] rounded-2xl w-full max-w-[360px] border border-[#27272a] p-6">
        <h2 className="font-bold text-lg mb-5">Create Account</h2>

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

        <div className="flex flex-col gap-2 mb-4">
          <button onClick={() => handleOAuth('google')}
            className="w-full p-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#e4e4e7] text-sm flex items-center justify-center gap-2 cursor-pointer hover:border-[#a855f7]">
            🔵 Continue with Google
          </button>
          <button onClick={() => handleOAuth('discord')}
            className="w-full p-2.5 border border-[#3f3f46] rounded-xl bg-transparent text-[#e4e4e7] text-sm flex items-center justify-center gap-2 cursor-pointer hover:border-[#a855f7]">
            🟣 Continue with Discord
          </button>
        </div>

        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="flex-1 h-px bg-[#27272a]"></div>
          <span className="text-[0.7rem] text-[#52525b]">or use email</span>
          <div className="flex-1 h-px bg-[#27272a]"></div>
        </div>

        <input type="text" placeholder="Display Name" value={name} onChange={e => setName(e.target.value)}
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl p-2.5 text-[#e4e4e7] text-sm outline-none mb-2 focus:border-[#a855f7]" />
        <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)}
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl p-2.5 text-[#e4e4e7] text-sm outline-none mb-2 focus:border-[#a855f7]" />
        <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)}
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl p-2.5 text-[#e4e4e7] text-sm outline-none mb-2 focus:border-[#a855f7]" />
        <input type="password" placeholder="Confirm Password" value={confirm} onChange={e => setConfirm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRegister()}
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl p-2.5 text-[#e4e4e7] text-sm outline-none mb-2 focus:border-[#a855f7]" />
        <button onClick={handleRegister} disabled={loading}
          className="w-full p-2.5 bg-[#7c3aed] text-white rounded-xl font-medium text-sm border-none cursor-pointer hover:bg-[#6d28d9] mt-0.5 disabled:opacity-50">
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <p className="text-center mt-3 text-xs text-[#71717a]">
          Already have an account? <Link href="/auth/signin" className="text-[#c084fc] no-underline">Sign In</Link>
        </p>
      </div>
    </div>
  )
}
