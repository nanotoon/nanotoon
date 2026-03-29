import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="max-w-[760px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl font-bold text-[#c084fc] mb-1">Privacy Policy</h1>
      <p className="text-[#52525b] text-xs mb-5">Last updated: March 2026</p>
      <div className="bg-[#18181b] rounded-2xl p-5 border border-[#27272a] text-[#a1a1aa] text-sm leading-relaxed">
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">The Short Version</h3>
        <p className="mb-4">We collect only what we need to run the platform. We don&apos;t sell your data to anyone. We don&apos;t track you across the web. We use cookies only for keeping you logged in and remembering your preferences.</p>
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">What We Collect</h3>
        <p className="mb-4"><strong className="text-[#e4e4e7]">Account information:</strong> Display name, email address, and password (stored securely). <strong className="text-[#e4e4e7]">Content you upload:</strong> Comics, chapter pages, thumbnails, profile pictures, comments. <strong className="text-[#e4e4e7]">Usage data:</strong> Basic analytics like page views and traffic patterns. <strong className="text-[#e4e4e7]">Technical data:</strong> IP address, browser type, and device information.</p>
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">Data Sharing</h3>
        <p className="mb-4">We do not sell your personal data. Period. We may share data only with service providers who help us run the platform, if required by law, or to protect user safety.</p>
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">Your Rights</h3>
        <p>You can access, update, or delete your personal information through your account settings. Contact nanotoon@proton.me for data requests.</p>
      </div>
    </div>
  )
}
