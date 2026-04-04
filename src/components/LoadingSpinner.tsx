'use client'

export function LoadingSpinner({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5">
      <div className="w-14 h-14 border-[#3f3f46] border-t-[#a855f7] rounded-full animate-spin" 
        style={{ borderWidth: '4px', borderStyle: 'solid' }} />
      <p className="text-[#71717a] text-xl md:text-2xl font-medium animate-pulse">{text}</p>
    </div>
  )
}
