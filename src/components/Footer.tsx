import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-[#27272a] mt-10">
      <div className="px-4 md:px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-[#7c3aed] to-[#c026d3] rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-[10px]">N</span>
          </div>
          <span className="text-[#71717a] text-xs">© 2026 NANOTOON. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#71717a]">
          <Link href="/terms" className="hover:text-[#c084fc] no-underline text-[#71717a]">Terms</Link>
          <Link href="/privacy" className="hover:text-[#c084fc] no-underline text-[#71717a]">Privacy</Link>
          <Link href="/contact" className="hover:text-[#c084fc] no-underline text-[#71717a]">Contact</Link>
          <Link href="/faq" className="hover:text-[#c084fc] no-underline text-[#71717a]">FAQ</Link>
          <a href="https://discord.gg/VdN98Rurb" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#5865F2]/10 border border-[#5865F2]/30 rounded-lg hover:bg-[#5865F2]/20 no-underline text-[#7289DA] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            Join Discord
          </a>
        </div>
      </div>
    </footer>
  )
}
