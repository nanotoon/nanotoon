import './globals.css'
import type { Metadata } from 'next'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { ToastProvider } from '@/components/Toast'
import { AuthProvider } from '@/contexts/AuthContext'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nanotoon.io'
const SITE_NAME = 'NANOTOON'
const SITE_DESCRIPTION = 'The home for AI-powered comics, manga, and webtoons. Share your vision, tell your story, and discover new worlds from creators using AI to push storytelling forward.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NANOTOON · AI Comics, Manga & Webtoons',
    template: '%s · NANOTOON',
  },
  description: SITE_DESCRIPTION,
  keywords: ['AI comics', 'AI manga', 'AI webtoon', 'AI manhwa', 'webtoon platform', 'comic reader', 'digital comics', 'NANOTOON'],
  applicationName: SITE_NAME,
  authors: [{ name: 'NANOTOON' }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  // Favicon & icons — drop your own favicon.ico and apple-icon.png into /public
  // and these will pick them up automatically. Next also supports app/icon.png
  // etc. if you prefer the app-router convention.
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: 'NANOTOON · AI Comics, Manga & Webtoons',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: '/og-default.png',
        width: 1200,
        height: 630,
        alt: 'NANOTOON — AI Comics, Manga & Webtoons',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NANOTOON · AI Comics, Manga & Webtoons',
    description: SITE_DESCRIPTION,
    images: ['/og-default.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      </head>
      <body className="bg-[#09090b] text-[#e4e4e7] min-h-screen font-sans">
        <AuthProvider>
          <ToastProvider>
            <Navbar />
            {children}
            <Footer />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
