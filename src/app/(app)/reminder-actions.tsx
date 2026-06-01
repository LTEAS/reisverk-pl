'use client'

import { useState } from 'react'
import { Trash2, Check } from 'lucide-react'
import { deleteReminder, completeReminder } from '@/lib/actions/reminders'

export function ReminderActions({ reminderId }: { reminderId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await deleteReminder(reminderId)
    } catch {
      setLoading(false)
    }
  }

  async function handleComplete() {
    setLoading(true)
    try {
      await completeReminder(reminderId)
    } catch {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-600 border-t-stone-400" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleComplete}
        className="p-1 rounded hover:bg-green-500/10 text-stone-500 hover:text-green-400 transition-colors"
        title="Fullfør"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleDelete}
        className="p-1 rounded hover:bg-red-500/10 text-stone-500 hover:text-red-400 transition-colors"
        title="Slett"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
