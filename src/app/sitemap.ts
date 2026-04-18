import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nanotoon.io'

// Dynamic sitemap. Pulls live series + profile handles from Supabase at
// build/revalidate time and emits a single sitemap.xml. If anything goes
// wrong (e.g. Supabase is temporarily unreachable during build), we still
// return the static routes so the sitemap is never empty. Google re-crawls
// periodically, so fresh content added after the last deploy just shows up
// on the next deploy rather than instantly — that's fine for launch.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`,            lastModified: now, changeFrequency: 'daily',   priority: 1.0 },
    { url: `${SITE_URL}/browse`,      lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${SITE_URL}/categories`,  lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${SITE_URL}/faq`,         lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/contact`,     lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${SITE_URL}/privacy`,     lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${SITE_URL}/terms`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ]

  try {
    // Server-safe anon client — can't use /lib/supabase/anon here because it's
    // 'use client'. We use the public anon key directly; there's no session to
    // manage for these read-only queries.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const [seriesRes, profilesRes] = await Promise.all([
      supabase.from('series')
        .select('slug, updated_at')
        .neq('is_removed', true)
        .order('updated_at', { ascending: false })
        .limit(5000),
      supabase.from('profiles')
        .select('handle, created_at')
        .not('handle', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000),
    ]) as any[]

    const seriesRoutes: MetadataRoute.Sitemap = ((seriesRes.data ?? []) as any[])
      .filter(s => s?.slug)
      .map(s => ({
        url: `${SITE_URL}/series/${s.slug}`,
        lastModified: s.updated_at ? new Date(s.updated_at) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))

    const profileRoutes: MetadataRoute.Sitemap = ((profilesRes.data ?? []) as any[])
      .filter(p => p?.handle)
      .map(p => ({
        url: `${SITE_URL}/user/${p.handle}`,
        lastModified: p.created_at ? new Date(p.created_at) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      }))

    return [...staticRoutes, ...seriesRoutes, ...profileRoutes]
  } catch {
    // On any failure, return at least the static routes — never emit a
    // broken / empty sitemap that would hurt crawling.
    return staticRoutes
  }
}
