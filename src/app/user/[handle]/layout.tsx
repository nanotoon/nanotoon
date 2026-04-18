import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nanotoon.io'

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  try {
    const { handle } = await params
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data: p } = await supabase
      .from('profiles')
      .select('display_name, handle, bio, avatar_url')
      .eq('handle', handle)
      .maybeSingle() as any

    if (!p) return { title: `@${handle}` }

    const name = p.display_name || `@${p.handle || handle}`
    const title = `${name} (@${p.handle || handle})`
    const description = (p.bio || `${name} on NANOTOON — creator of AI comics, manga & webtoons.`).slice(0, 160)
    const image = p.avatar_url || `${SITE_URL}/og-default.png`
    const url = `${SITE_URL}/user/${p.handle || handle}`

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        type: 'profile',
        title,
        description,
        url,
        images: [{ url: image, alt: name }],
      },
      twitter: {
        card: 'summary',
        title,
        description,
        images: [image],
      },
    }
  } catch {
    return {}
  }
}

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return children
}
