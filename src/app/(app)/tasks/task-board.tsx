'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, MessageSquare, CalendarDays } from 'lucide-react'
import { updateTaskStatus } from '@/lib/actions/tasks'
import type { TaskStatus, PriorityLevel } from '@prisma/client'

interface BoardTask {
  id: string
  title: string
  status: TaskStatus
  priority: PriorityLevel
  dueDate: Date | null
  taskNumber: number
  project: { id: string; name: string; shortCode: string | null }
}

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: 'apen', label: 'Åpen', accent: 'border-t-[#C07A4A]' },
  { status: 'sendt', label: 'Sendt', accent: 'border-t-yellow-500' },
  { status: 'mottatt', label: 'Mottatt', accent: 'border-t-orange-500' },
  { status: 'signert', label: 'Signert', accent: 'border-t-green-500' },
  { status: 'utfort', label: 'Utført', accent: 'border-t-emerald-500' },
  { status: 'lukket', label: 'Lukket', accent: 'border-t-stone-500' },
]

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-400',
  high: 'bg-orange-500/10 text-orange-400',
  normal: 'bg-stone-500/10 text-stone-400',
  low: 'bg-stone-800 text-stone-500',
}

const priorityLabels: Record<string, string> = {
  urgent: 'Haster',
  high: 'Høy',
  normal: 'Normal',
  low: 'Lav',
}

function formatDue(d: Date): string {
  return new Date(d).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
  })
}

export function TaskBoard({ tasks }: { tasks: BoardTask[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<Record<string, TaskStatus>>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)

  function effectiveStatus(t: BoardTask): TaskStatus {
    return optimistic[t.id] ?? t.status
  }

  function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault()
    setDragOver(null)
    const taskId = e.dataTransfer.getData('text/task-id')
    if (!taskId) return
    const task = tasks.find((t) => t.id === taskId)
    if (!task || effectiveStatus(task) === status) return

    setOptimistic((prev) => ({ ...prev, [taskId]: status }))
    setSaving((prev) => new Set(prev).add(taskId))
    startTransition(async () => {
      try {
        await updateTaskStatus(taskId, status)
        router.refresh()
      } catch {
        // Roll back on failure
        setOptimistic((prev) => {
          const next = { ...prev }
          delete next[taskId]
          return next
        })
      } finally {
        setSaving((prev) => {
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
      }
    })
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => effectiveStatus(t) === col.status)
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(col.status)
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, col.status)}
            className={`w-64 shrink-0 rounded-xl bg-[#1a1918] border border-[#2a2827] border-t-2 ${col.accent} ${
              dragOver === col.status ? 'ring-1 ring-[#C07A4A]/50 bg-[#201f1e]' : ''
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2a2827]">
              <span className="text-xs font-semibold text-stone-300">
                {col.label}
              </span>
              <span className="text-[10px] text-stone-600 font-medium">
                {colTasks.length}
              </span>
            </div>
            <div className="p-2 space-y-2 min-h-[120px] max-h-[70vh] overflow-y-auto">
              {colTasks.map((t) => {
                const overdue =
                  t.dueDate &&
                  new Date(t.dueDate) < new Date() &&
                  col.status !== 'utfort' &&
                  col.status !== 'lukket'
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData('text/task-id', t.id)
                    }
                    className={`group rounded-lg bg-[#161514] border border-[#2a2827] p-2.5 cursor-grab active:cursor-grabbing hover:border-stone-600 transition-colors ${
                      saving.has(t.id) ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <p className="text-xs text-stone-200 leading-snug">
                        {t.title}
                      </p>
                      {saving.has(t.id) && (
                        <Loader2 className="h-3 w-3 animate-spin text-stone-500 shrink-0 mt-0.5" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[10px] text-stone-600">
                        #{t.taskNumber}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                        {t.project.shortCode || t.project.name}
                      </span>
                      {t.priority !== 'normal' && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${priorityColors[t.priority]}`}
                        >
                          {priorityLabels[t.priority]}
                        </span>
                      )}
                      {t.dueDate && (
                        <span
                          className={`text-[10px] flex items-center gap-0.5 ${
                            overdue ? 'text-red-400' : 'text-stone-500'
                          }`}
                        >
                          <CalendarDays className="h-2.5 w-2.5" />
                          {formatDue(t.dueDate)}
                        </span>
                      )}
                      <Link
                        href={`/chat?q=${encodeURIComponent(`Gi meg status og forslag til neste steg for oppgave #${t.taskNumber} "${t.title}" i prosjekt ${t.project.shortCode || t.project.name}`)}`}
                        className="ml-auto opacity-0 group-hover:opacity-100 text-stone-500 hover:text-[#C07A4A] transition-all"
                        title="Spør AI om denne oppgaven"
                      >
                        <MessageSquare className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )
              })}
              {colTasks.length === 0 && (
                <p className="text-[10px] text-stone-700 text-center py-4">
                  Ingen oppgaver
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
