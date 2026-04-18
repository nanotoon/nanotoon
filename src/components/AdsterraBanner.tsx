'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Adsterra 728x90 iframe banner.
 *
 * The Adsterra "invoke.js" loader reads a global `atOptions` variable and
 * injects an iframe ad into the DOM position where the loader <script> tag
 * lives. Because Next.js is a SPA, we can't just drop the raw <script> tags
 * into JSX — they'd only run on the initial hard load, and atOptions would
 * leak across pages. Instead we mount a dedicated container div, set
 * atOptions, and append the loader script into that container on mount.
 * On unmount we tear the container contents down so navigation stays clean.
 *
 * Mobile fix:
 *   The injected iframe is hard-coded to 728px wide. On a narrow phone
 *   (~380px viewport) this overflows horizontally, which lets the whole
 *   page be swiped right to reveal a black strip — exactly the issue we
 *   were seeing on phones. Desktop was fine because the layout had room.
 *
 *   We keep a single 728x90 ad zone (desktop requirement) but on viewports
 *   narrower than 728px we scale the rendered iframe down proportionally
 *   with a CSS transform, and wrap it in `overflow: hidden` so any stray
 *   pixels can't push the page wider than the viewport. Desktop rendering
 *   is unchanged: the scale becomes 1 at widths ≥ 728px.
 */
export function AdsterraBanner() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  // Track viewport width and compute a scale factor. We subtract a small
  // safety margin (16px) so the scaled iframe never sits right against the
  // edge of a phone screen with a rounded corner / notch cutout.
  useEffect(() => {
    function compute() {
      if (typeof window === 'undefined') return
      const w = window.innerWidth
      const available = Math.max(0, w - 16)
      setScale(available >= 728 ? 1 : available / 728)
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

    // Wipe any previous ad content (e.g. from a prior mount / hot reload).
    container.innerHTML = ''

    // atOptions must exist on window BEFORE invoke.js loads.
    ;(window as any).atOptions = {
      key: '87dd8a896c63314680f407f1dbfd3bdf',
      format: 'iframe',
      height: 90,
      width: 728,
      params: {},
    }

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://www.highperformanceformat.com/87dd8a896c63314680f407f1dbfd3bdf/invoke.js'
    script.async = true
    container.appendChild(script)

    return () => {
      // Clean up the injected ad iframe + script on unmount / route change.
      container.innerHTML = ''
    }
  }, [])

  // Scaled dimensions for the outer wrapper. At scale=1 (desktop) this is
  // exactly 728x90 as before. On mobile it shrinks so the visible box
  // matches the scaled iframe — no empty whitespace below the ad.
  const scaledWidth = 728 * scale
  const scaledHeight = 90 * scale

  return (
    // overflow-hidden on the outer strip is the safety net: even if the
    // browser ignores the transform for a frame, nothing inside can push
    // the page wider than the viewport. This is what kills the mobile
    // swipe-right-to-black-page behaviour.
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
            width: 728,
            height: 90,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  )
}
