'use client'
import { useEffect } from 'react'

// Rendered when even the RootLayout crashes, so it must provide its own
// <html> and <body>. Kept deliberately minimal — no app providers, no fonts
// from globals — so it has the best chance of rendering.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#09090b', color: '#e4e4e7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '16px', padding: '24px', maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>😵</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px' }}>Something broke badly</h2>
          <p style={{ fontSize: '14px', color: '#a1a1aa', margin: '0 0 16px' }}>
            A serious error prevented the site from rendering.
            {error?.digest && <span style={{ display: 'block', marginTop: '8px', fontSize: '11px', color: '#52525b' }}>Error ID: {error.digest}</span>}
          </p>
          <button
            onClick={() => reset()}
            style={{ padding: '8px 16px', background: '#7c3aed', color: 'white', borderRadius: '8px', fontSize: '14px', border: 'none', cursor: 'pointer', marginRight: '8px' }}
          >
            Try again
          </button>
          <a href="/" style={{ padding: '8px 16px', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: '14px', color: '#c084fc', textDecoration: 'none' }}>
            Home
          </a>
        </div>
      </body>
    </html>
  )
}
