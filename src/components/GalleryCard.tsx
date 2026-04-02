import Link from 'next/link'
import { GRADIENTS } from '@/data/mock'

function formatNum(n: number | null | undefined): string {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toString()
}

export function GalleryCard({ item, index }: { item: any; index: number }) {
  const [c1, c2] = GRADIENTS[index % GRADIENTS.length]
  const imageUrls = item.image_urls || []
  const isAlbum = imageUrls.length > 1
  const thumbUrl = item.thumbnail_url || (imageUrls.length > 0 ? imageUrls[0] : null)

  return (
    <Link href={`/gallery/${item.id}`} className="group cursor-pointer block no-underline">
      <div className="relative rounded-xl overflow-hidden bg-[#27272a]">
        {thumbUrl ? (
          <img src={thumbUrl} alt={item.title} className="w-full aspect-[4/5] object-cover group-hover:-translate-y-1.5 transition-transform duration-300" />
        ) : (
          <div className="w-full aspect-[4/5] flex items-center justify-center text-white/10 text-4xl md:text-6xl font-bold group-hover:-translate-y-1.5 transition-transform duration-300"
            style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
            🎨
          </div>
        )}
        {item.is_mature && <div className="absolute top-1.5 left-1.5 bg-amber-600 text-white text-[0.6rem] px-1.5 py-0.5 rounded font-bold">MATURE</div>}
        {isAlbum && <div className="absolute bottom-1.5 left-1.5 bg-black/70 text-[0.59rem] px-1.5 py-0.5 rounded text-[#a1a1aa]">ALBUM · {imageUrls.length}</div>}
      </div>
      <div className="mt-1.5">
        <h4 className="font-medium text-sm truncate text-[#e4e4e7]">{item.title}</h4>
        <p className="text-[0.71rem] text-[#71717a] mt-0.5 truncate">{item.profiles?.display_name || 'Unknown'}</p>
        <div className="flex items-center gap-2 mt-1 text-[#52525b]">
          <span className="flex items-center gap-0.5 text-[0.58rem]">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {formatNum(item.total_views)}
          </span>
          <span className="flex items-center gap-0.5 text-[0.58rem]">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            {formatNum(item.total_likes)}
          </span>
        </div>
      </div>
    </Link>
  )
}
