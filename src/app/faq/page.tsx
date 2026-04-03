"use client"
import { useState } from 'react'
import Link from 'next/link'

const faqs = [
  { q: "What is NANOTOON?", a: "NANOTOON is a platform for AI-generated webtoons, comics, manga, manhwa, and manhua. Traditional artists are welcome too \u2014 just let your readers know in your description, because most will assume it\u2019s AI otherwise.\n\nThis is a solo indie project built and maintained by one person." },
  { q: "How do I add a new chapter to my series?", a: "Easy \u2014 just hit the Upload button and choose \"Add chapter to existing series\", then pick which series you want to update. You can also go to your profile, find the series, hit Edit, and upload new pages from there." },
  { q: "Ads Implementation", a: "Heads up: I\u2019ll be adding ads to the site very soon. I\u2019m doing this to make sure the platform stays alive for the long run and truly becomes a permanent home for all AI comic, webtoon, and manga creators. Thanks for sticking with nanotoon!" },
  { q: "Upload Guidelines & Limits", a: "To keep the site fast and the experience smooth for everyone, NANOTOON has a few simple upload rules: each individual image is capped at 5 MB, with a total limit of 30 MB per Series Chapter or Gallery Album. To prevent loading lag and keep storage manageable for our growing platform, all uploads are automatically converted and compressed into WebP format. While this significantly reduces file size, the visual quality remains so high that it is extremely rare for the human eye to notice a difference. These limits are in place to ensure a lag-free experience for your readers, and we appreciate your support as we build this community together!" },
  { q: "What is allowed on this site?", a: "Violence & Dark Themes: We support high-stakes storytelling. Intense graphic violence and realistic blood are permitted in Mature-tagged chapters. However, content that exists solely to depict sadistic torture without narrative purpose, or content that mimics real-world \u2018snuff,\u2019 is prohibited to comply with safety regulations.\n\nNudity & Mature Content \u2014 Non-sexual nudity is allowed, provided that genitalia are fully obscured or censored. Pornographic content is strictly prohibited.\n\nProhibited Content:\n\u2022 Sexual content involving minors \u2014 zero tolerance\n\u2022 Instructions for making drugs, explosives, or weapons\n\u2022 Content that promotes self-harm or suicide\n\u2022 Malware, scams, or phishing\n\u2022 Content that incites real-world violence" },
  { q: "What is a Series vs a One Shot?", a: "A Series is an ongoing or multi-chapter story \u2014 you plan to keep adding chapters over time.\n\nA One Shot is a complete standalone story told in a single chapter. Done in one, basically." },
  { q: "Why can\u2019t I see the Gallery tab or my uploaded Artworks on my profile?", a: "If you can\u2019t see the Gallery tab or your Artworks, simply go to Settings and switch the \"Show Gallery/Artworks\" toggle to on." },
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
