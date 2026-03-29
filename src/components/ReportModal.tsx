'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export function ReportModal({ title, onClose, onSubmit, seriesId, chapterId, commentId }: {
  title: string; onClose: () => void; onSubmit: () => void;
  seriesId?: string; chapterId?: string; commentId?: string;
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()

  const reasons = ['Inappropriate content', 'Spam or misleading', 'Harassment', 'Copyright violation', 'Other']

  async function submit() {
    if (!reason) return
    setSubmitting(true)
    if (user) {
      await supabase.from('reports').insert({
        reporter_id: user.id, reason, note: note || null,
        series_id: seriesId || null, chapter_id: chapterId || null, comment_id: commentId || null, status: 'pending',
      })
    }
    setSubmitting(false)
    onSubmit()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center" onClick={onClose}>
      <div className="bg-[#18181b] rounded-2xl w-full max-w-[400px] mx-3.5 border border-[#27272a]" onClick={e => e.stopPropagation()}>
        <div className="p-3.5 border-b border-[#27272a] flex justify-between items-center">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button onClick={onClose} className="bg-[#27272a] border-none w-6 h-6 rounded-md cursor-pointer text-[#a1a1aa] text-base flex items-center justify-center">×</button>
        </div>
        <div className="p-4 flex flex-col gap-2">
          {reasons.map(r => (
            <button key={r} onClick={() => setReason(r)}
              className={`w-full p-2.5 border rounded-lg text-sm text-left cursor-pointer transition-all ${reason === r ? 'border-[#a855f7] text-[#c084fc] bg-purple-500/10' : 'border-[#3f3f46] text-[#a1a1aa] bg-transparent'}`}>
              {r}
            </button>
          ))}
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Additional details (optional)" rows={2}
            className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg p-2 text-[#e4e4e7] text-sm outline-none resize-y font-[inherit] focus:border-[#a855f7] mt-1" />
        </div>
        <div className="p-3 border-t border-[#27272a] flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 border border-[#3f3f46] rounded-lg bg-transparent text-[#a1a1aa] cursor-pointer text-sm">Cancel</button>
          <button onClick={submit} disabled={!reason || submitting}
            className={`flex-[2] py-2 bg-[#ef4444] text-white rounded-lg text-sm font-medium border-none ${reason && !submitting ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
