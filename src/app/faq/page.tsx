"use client"
import { useState } from 'react'
import Link from 'next/link'

const faqs = [
  { q: "What is NANOTOON?", a: "NANOTOON is a platform for AI-generated webtoons, comics, manga, manhwa, and manhua. Traditional artists are welcome too — just let your readers know in your description, because most will assume it’s AI otherwise.\n\nThis is a solo indie project built and maintained by one person." },
  { q: "How do I add a new chapter to my series?", a: "Easy — just hit the Upload button and choose \"Add chapter to existing series\", then pick which series you want to update. You can also go to your profile, find the series, hit Edit, and upload new pages from there." },
  { q: "Upload Guidelines & Limits", a: "To keep the site fast and the experience smooth for everyone, NANOTOON has a few simple upload rules:\nFile Size: Individual images are capped at 10 MB.\nChapter Limit: Total uploads are limited to 150 MB per Series Chapter.\nAutomatic Optimization: To ensure lightning-fast load times for your readers, all uploads are automatically converted to WebP format and resized to a width of 800px with slight compression.\nThese optimizations help your art look great while preventing lag on mobile devices and slower connections. We appreciate your support as we build this community together!" },
  { q: "What is allowed on this site?", a: "Violence & Dark Themes: We support high-stakes storytelling. Intense graphic violence and realistic blood are permitted in Mature-tagged chapters. However, content that exists solely to depict sadistic torture without narrative purpose is prohibited.\n\nNudity & Mature Content — Non-sexual nudity is allowed, provided that genitalia are fully obscured or censored. Pornographic content is strictly prohibited.\n\nProhibited Content:\n• Sexual content involving minors — zero tolerance\n• Instructions for making drugs, explosives, or weapons\n• Content that promotes self-harm or suicide\n• Malware, scams, or phishing\n• Content that incites real-world violence" },
  { q: "What is a Series vs a One Shot?", a: "A Series is an ongoing or multi-chapter story — you plan to keep adding chapters over time.\n\nA One Shot is a complete standalone story told in a single chapter or page. Done in one, basically." },
  { q: "Will the rules for NANOTOON change?", a: "Yes. As the creator, I am new to managing this platform, and NANOTOON is still in its early stages. To keep the site running smoothly as we grow, I may need to add, update, or change rules at any time. Please check back periodically for updates to our guidelines and policies." },
  { q: "Communication & Support", a: "This website is a solo project, which means everything from development to maintenance is handled by one person. Because I am managing every aspect of the platform alone, I likely won’t have the time to reply to most messages.\n\nWhile I value your feedback and will try my best to read through inquiries when time permits, please expect a very slow response or no response at all. My priority is keeping the site stable and updated, so please don't take a lack of reply personally—it just means I'm busy under the hood!" },
]

export default function FAQPage() {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  return (
    <div className="max-w-[720px] md:max-w-[960px] mx-auto px-4 py-6 md:py-10">
      <Link href="/" className="mb-4 flex items-center gap-1 text-[#71717a] text-sm md:text-base hover:text-[#e4e4e7] no-underline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
      </Link>
      <h1 className="text-xl md:text-3xl font-bold text-[#c084fc] mb-1 md:mb-2">FAQ & About NANOTOON</h1>
      <p className="text-[#71717a] text-sm md:text-lg mb-5 md:mb-7">Everything you need to know before you dive in.</p>
      <div className="bg-[#18181b] rounded-2xl px-4 md:px-6 border border-[#27272a]">
        {faqs.map((f, i) => (
          <div key={i} className={i < faqs.length - 1 ? 'border-b border-[#27272a]' : ''}>
            <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full bg-transparent border-none py-4 md:py-5 text-left text-[#e4e4e7] text-sm md:text-xl font-medium cursor-pointer flex justify-between items-center gap-3">
              {f.q}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`shrink-0 transition-transform ${openIdx === i ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {openIdx === i && <div className="pb-4 md:pb-5 text-[#a1a1aa] text-sm md:text-lg leading-relaxed whitespace-pre-line">{f.a}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
