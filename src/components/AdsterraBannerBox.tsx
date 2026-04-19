'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Adsterra 300x250 iframe banner (a.k.a. the "box" ad).
 *
 * Used inside the chapter reader in webtoon reading mode, dropped between
 * the Prev/Next chapter buttons and the chapter comments section. A sister
 * to `AdsterraBanner` (728x90) which is used everywhere else.
 *
 * Mirrors the mobile-safe pattern of AdsterraBanner:
 *   • atOptions is set on window BEFORE invoke.js loads
 *   • The loader script is injected into a dedicated container so SPA
 *     navigation doesn't leak state or stack iframes
 *   • The container is wiped on unmount so nothing lingers on route change
 *   • On narrow viewports (<300px available) we scale the iframe down and
 *     wrap everything in overflow:hidden so a stray pixel can never push
 *     the page wider than the viewport (the old swipe-right-to-black-page
 *     bug). 300x250 already fits on nearly every phone, but we keep the
 *     safety net so any weird small viewport (landscape watch-sized) still
 *     can't break horizontal scroll.
 */
export function AdsterraBannerBox() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    function compute() {
      if (typeof window === 'undefined') return
      const w = window.innerWidth
      const available = Math.max(0, w - 16)
      setScale(available >= 300 ? 1 : available / 300)
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('orientationchange', compute)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('orientationchange', compute)
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Wipe any previous ad content (prior mount / hot reload).
    container.innerHTML = ''

    // atOptions must exist on window BEFORE invoke.js loads.
    ;(window as any).atOptions = {
      key: 'ae75f4d367f87c11a177c3c3c0339bd8',
      format: 'iframe',
      height: 250,
      width: 300,
      params: {},
    }

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://www.highperformanceformat.com/ae75f4d367f87c11a177c3c3c0339bd8/invoke.js'
    script.async = true
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [])

  const scaledWidth = 300 * scale
  const scaledHeight = 250 * scale

  return (
    <div
      className="w-full flex justify-center py-4 px-2"
      style={{ overflow: 'hidden' }}
    >
      <div
        style={{
          width: scaledWidth,
          height: scaledHeight,
          maxWidth: '100%',
          position: 'relative',
          overflow: 'hidden',
        }}
        aria-label="Advertisement"
      >
        <div
          ref={containerRef}
          style={{
            width: 300,
            height: 250,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  )
}
