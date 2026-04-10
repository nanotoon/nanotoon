'use client'
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type ToastContextType = { show: (msg: string) => void }
const ToastContext = createContext<ToastContextType>({ show: () => {} })
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  const [visible, setVisible] = useState(false)

  const show = useCallback((m: string) => {
    setMsg(m); setVisible(true)
    setTimeout(() => setVisible(false), 2200)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {visible && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#27272a] border border-[#3f3f46] text-[#e4e4e7] px-4 py-2.5 rounded-xl z-[9999] text-sm whitespace-nowrap shadow-2xl animate-[fadeInUp_0.3s_ease]">
          {msg}
        </div>
      )}
    </ToastContext.Provider>
  )
}
