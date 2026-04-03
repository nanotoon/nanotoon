import Link from 'next/link'
import { GRADIENTS } from '@/data/mock'
function fmt(n: number | null | undefined): string { if (!n) return '0'; if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString() }
export function GalleryCard({ item, index }: { item: any; index: number }) {
  const [c1, c2] = GRADIENTS[index % GRADIENTS.length]
  const imgs = item.image_urls || []
  const thumb = item.thumbnail_url || (imgs.length > 0 ? imgs[0] : null)
  return (
    <Link href={`/gallery/${item.id}`} className="group cursor-pointer block no-underline">
      <div className="relative rounded-xl overflow-hidden bg-[#27272a]">
        {thumb ? <img src={thumb} alt={item.title} className="w-full aspect-[4/5] object-cover group-hover:-translate-y-1.5 transition-transform duration-300" />
          : <div className="w-full aspect-[4/5] flex items-center justify-center text-4xl" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>\u{1f3a8}</div>}
        {item.is_mature && <div className="absolute top-1.5 left-1.5 bg-amber-600 text-white text-[0.6rem] px-1.5 py-0.5 rounded font-bold">MATURE</div>}
        {imgs.length > 1 && <div className="absolute bottom-1.5 left-1.5 bg-black/70 text-[0.59rem] px-1.5 py-0.5 rounded text-[#a1a1aa]">ALBUM</div>}
      </div>
      <div className="mt-1.5">
        <h4 className="font-medium text-sm truncate text-[#e4e4e7]">{item.title}</h4>
        <p className="text-[0.71rem] text-[#71717a] mt-0.5 truncate">{item.profiles?.display_name || 'Unknown'}</p>
        <div className="flex items-center gap-2 mt-1 text-[#52525b]">
          <span className="text-[0.58rem]">{fmt(item.total_views)} views</span>
          <span className="text-[0.58rem]">{fmt(item.total_likes)} likes</span>
        </div>
      </div>
    </Link>
  )
}
