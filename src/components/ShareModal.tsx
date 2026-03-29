'use client'

export function ShareModal({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  function shareToSocial(platform: string) {
    const u = encodeURIComponent(url), t = encodeURIComponent(title)
    let link = ''
    switch (platform) {
      case 'x': link = `https://x.com/intent/tweet?text=${t}&url=${u}`; break
      case 'facebook': link = `https://www.facebook.com/sharer/sharer.php?u=${u}`; break
      case 'reddit': link = `https://www.reddit.com/submit?url=${u}&title=${t}`; break
      case 'whatsapp': link = `https://wa.me/?text=${t}%20${u}`; break
      case 'telegram': link = `https://t.me/share/url?url=${u}&text=${t}`; break
      case 'copy':
        navigator.clipboard.writeText(url).catch(() => {})
        onClose(); return
    }
    if (link) window.open(link, '_blank', 'width=600,height=500')
    onClose()
  }

  const buttons = [
    { id: 'x', label: 'X', icon: '𝕏' },
    { id: 'facebook', label: 'Facebook', icon: 'f' },
    { id: 'reddit', label: 'Reddit', icon: 'r' },
    { id: 'whatsapp', label: 'WhatsApp', icon: 'W' },
    { id: 'telegram', label: 'Telegram', icon: 'T' },
    { id: 'copy', label: 'Copy Link', icon: '📋' },
  ]

  return (
    <div className="fixed inset-0 bg-black/90 z-[310] flex items-center justify-center" onClick={onClose}>
      <div className="bg-[#18181b] rounded-2xl w-full max-w-[380px] mx-3.5 border border-[#27272a] p-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3.5">
          <h3 className="font-semibold text-base">Share</h3>
          <button onClick={onClose} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa] text-base flex items-center justify-center">×</button>
        </div>
        <div className="bg-[#27272a] border border-[#3f3f46] rounded-lg p-2.5 text-xs text-[#a1a1aa] break-all mb-4">{url}</div>
        <div className="grid grid-cols-3 gap-2.5">
          {buttons.map(b => (
            <button key={b.id} onClick={() => shareToSocial(b.id)}
              className="flex flex-col items-center gap-1.5 p-3 bg-[#27272a] border border-[#3f3f46] rounded-xl cursor-pointer text-[#e4e4e7] text-[0.68rem] hover:border-[#a855f7] transition-colors">
              <span className="text-lg">{b.icon}</span>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
