'use client'
import { useEffect, useRef } from 'react'

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
 */
export function AdsterraBanner() {
  const containerRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="w-full flex justify-center py-4 px-2">
      <div
        ref={containerRef}
        style={{ width: 728, maxWidth: '100%', minHeight: 90 }}
        aria-label="Advertisement"
      />
    </div>
  )
}
