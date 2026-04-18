'use client'
import Link from 'next/link'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log for debugging; shows in Cloudflare Pages logs for server errors.
    console.error('Page error:', error)
  }, [error])

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-6 max-w-[420px] w-full text-center">
        <div className="text-4xl mb-2">😵</div>
        <h2 className="text-lg font-bold text-[#e4e4e7] mb-1.5">Something broke</h2>
        <p className="text-sm text-[#a1a1aa] mb-4">
          This page hit an unexpected error. Try again, or head back to the home page.
          {error?.digest && (
            <span className="block mt-2 text-[0.7rem] text-[#52525b]">Error ID: {error.digest}</span>
          )}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-[#7c3aed] text-white rounded-lg text-sm border-none cursor-pointer hover:bg-[#6d28d9]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 border border-[#3f3f46] rounded-lg text-sm text-[#c084fc] hover:border-[#a855f7] no-underline"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
