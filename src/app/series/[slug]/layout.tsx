import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nanotoon.io'

// Per-series SEO metadata. Fetches the series row server-side and builds
// Open Graph + Twitter card tags so shared links show the actual thumbnail
// and title instead of the generic site default. Returns the fallback if
// the series is missing so we never crash the page.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const { slug } = await params
    // Server-safe anon client (the /lib/supabase/anon module is 'use client').
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data: s } = await supabase
      .from('series')
      .select('title, description, thumbnail_url, profiles!series_author_id_fkey(display_name, handle)')
      .eq('slug', slug)
      .neq('is_removed', true)
      .maybeSingle() as any

    if (!s) return { title: 'Series not found' }

    const author = s.profiles?.display_name || 'Unknown'
    const title = `${s.title} by ${author}`
    const description = (s.description || `Read "${s.title}" by ${author} on NANOTOON — AI comics, manga & webtoons.`).slice(0, 160)
    const image = s.thumbnail_url || `${SITE_URL}/og-default.png`
    const url = `${SITE_URL}/series/${slug}`

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        type: 'article',
        title,
        description,
        url,
        images: [{ url: image, alt: s.title }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [image],
      },
    }
  } catch {
    return {}
  }
}

export default function SeriesLayout({ children }: { children: React.ReactNode }) {
  return children
}
