'use client'
import { useState } from 'react'
import Link from 'next/link'

const faqs = [
  { q: "What is NANOTOON?", a: "NANOTOON is a platform for AI-generated webtoons, comics, manga, manhwa, and manhua. Traditional artists are welcome too — just let your readers know in your description, because most will assume it's AI otherwise.\n\nThis is a solo indie project built and maintained by one person." },
  { q: "How do I add a new chapter to my series?", a: "Easy — just hit the Upload button and choose \"Add chapter to existing series\", then pick which series you want to update. You can also go to your profile, find the series, hit Edit, and upload new pages from there." },
  { q: "What is allowed on this site?", a: "Violence & Dark Themes — Tag individual chapters as Mature if they contain intense graphic violence, excessive gore, or non-sexual nudity. Action, blood, and horror elements are permitted.\n\nNudity & Mature Content — Non-sexual nudity is allowed, provided that genitalia are fully obscured or censored. Pornographic content is strictly prohibited.\n\nProhibited Content:\n• Sexual content involving minors — zero tolerance\n• Instructions for making drugs, explosives, or weapons\n• Content that promotes self-harm or suicide\n• Malware, scams, or phishing\n• Content that incites real-world violence" },
  { q: "What is a Series vs a One Shot?", a: "A Series is an ongoing or multi-chapter story — you plan to keep adding chapters over time.\n\nA One Shot is a complete standalone story told in a single chapter. Done in one, basically." },
]

export default function FAQPage() {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl font-bold text-[#c084fc] mb-1">FAQ & About NANOTOON</h1>
      <p className="text-[#71717a] text-sm mb-5">Everything you need to know before you dive in.</p>
      <div className="bg-[#18181b] rounded-2xl px-4 border border-[#27272a]">
        {faqs.map((f, i) => (
          <div key={i} className={`${i < faqs.length - 1 ? 'border-b border-[#27272a]' : ''}`}>
            <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full bg-transparent border-none py-4 text-left text-[#e4e4e7] text-sm font-medium cursor-pointer flex justify-between items-center gap-3">
              {f.q}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`shrink-0 transition-transform ${openIdx === i ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {openIdx === i && <div className="pb-4 text-[#a1a1aa] text-sm leading-relaxed whitespace-pre-line">{f.a}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
