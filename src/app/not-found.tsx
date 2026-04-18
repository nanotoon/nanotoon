import Link from 'next/link'

export const metadata = {
  title: 'Page not found · NANOTOON',
  description: 'The page you were looking for could not be found.',
}

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-6 max-w-[420px] w-full text-center">
        <div className="text-4xl mb-2">🔍</div>
        <h2 className="text-lg font-bold text-[#e4e4e7] mb-1.5">Page not found</h2>
        <p className="text-sm text-[#a1a1aa] mb-4">
          We couldn&apos;t find that page. It may have been moved, removed, or never existed.
        </p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link
            href="/"
            className="px-4 py-2 bg-[#7c3aed] text-white rounded-lg text-sm no-underline hover:bg-[#6d28d9]"
          >
            Home
          </Link>
          <Link
            href="/browse"
            className="px-4 py-2 border border-[#3f3f46] rounded-lg text-sm text-[#c084fc] hover:border-[#a855f7] no-underline"
          >
            Browse
          </Link>
        </div>
      </div>
    </div>
  )
}
