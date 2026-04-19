import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="max-w-[760px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl font-bold text-[#c084fc] mb-1">Terms of Service</h1>
      <p className="text-[#52525b] text-xs mb-5">Last updated: March 2026</p>
      <div className="bg-[#18181b] rounded-2xl p-5 border border-[#27272a] text-[#a1a1aa] text-sm leading-relaxed">
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">Welcome to NANOTOON</h3>
        <p className="mb-4">By using NANOTOON, you agree to these terms. They&apos;re written in plain language because we believe you should actually understand what you&apos;re agreeing to.</p>
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">What NANOTOON Is</h3>
        <p className="mb-4">NANOTOON is a platform for sharing and reading AI-generated comics, webtoons, manga, manhwa, and manhua. Traditional artists are welcome too. We provide the platform — you provide the creativity.</p>
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">Your Account</h3>
        <p className="mb-4">You need an account to upload, comment, like, or follow. You&apos;re responsible for keeping your login credentials secure. You must be at least 13 years old to create an account.</p>
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">Your Content</h3>
        <p className="mb-4">You own everything you upload. NANOTOON does not claim ownership of your work. By uploading, you grant us a non-exclusive license to display, distribute, and promote your content on the platform. You can delete your content at any time.</p>
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">Content Rules</h3>
        <p className="mb-2"><strong className="text-[#e4e4e7]">Allowed:</strong> Action, violence, blood, horror, and dark themes. Non-sexual nudity (genitalia must be obscured). Intense graphic violence must be tagged Mature.</p>
        <p className="mb-2">However, content that exists solely to depict sadistic torture without narrative purpose is prohibited.</p>
        <p className="mb-4"><strong className="text-[#e4e4e7]">Not allowed:</strong> Pornographic content. Sexual content involving minors (zero tolerance). Dangerous instructions. Self-harm promotion. Content inciting real-world violence. Malware, scams, spam.</p>
        <h3 className="text-[#e4e4e7] text-base font-semibold mb-2">Community Behavior</h3>
        <p>Be decent to each other. Harassment, hate speech, doxxing, impersonation, and targeted bullying are not tolerated.</p>
      </div>
    </div>
  )
}
