'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Mail,
  Bot,
  Calendar,
  Sparkles,
  User,
  Clock,
  AlarmClock,
  Trash2,
  X,
  Send,
  Circle,
  CheckCircle2,
} from 'lucide-react'
import { updateTaskStatus, snoozeTask, deleteTask, createTask } from '@/lib/actions/tasks'
import type { TaskStatus, PriorityLevel, TaskSource } from '@prisma/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskData {
  id: string
  title: string
  description: string | null
  note: string | null
  status: TaskStatus
  priority: PriorityLevel
  assignee: string | null
  dueDate: Date | null
  snoozeUntil: Date | null
  source: TaskSource
  taskNumber: number
  createdAt: Date
  updatedAt: Date
  project: { id: string; name: string; shortCode: string | null }
  sourceEmail: { id: string; subject: string | null } | null
  assigneeUser: { displayName: string | null; email: string | null } | null
}

interface GroupedTask {
  project: { id: string; name: string; shortCode: string | null }
  tasks: TaskData[]
}

interface TaskListProps {
  groupedTasks: GroupedTask[]
  projects: { id: string; name: string; shortCode: string | null }[]
  currentFilters: {
    status: string
    project: string
    priority: string
  }
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

function projectColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 55%, 55%)`
}

const statusLabels: Record<string, string> = {
  apen: 'Åpen',
  sendt: 'Sendt',
  mottatt: 'Mottatt',
  signert: 'Signert',
  utfort: 'Utført',
  lukket: 'Lukket',
}

const statusColors: Record<string, string> = {
  apen: 'bg-[#C07A4A]/10 text-[#C07A4A] border-[#C07A4A]/20',
  sendt: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  mottatt: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  signert: 'bg-green-500/10 text-green-400 border-green-500/20',
  utfort: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  lukket: 'bg-stone-500/10 text-stone-400 border-stone-500/20',
}

const priorityLabels: Record<string, string> = {
  urgent: 'Haster',
  high: 'Høy',
  normal: 'Normal',
  low: 'Lav',
}

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-400',
  high: 'bg-orange-500/10 text-orange-400',
  normal: 'bg-stone-500/10 text-stone-400',
  low: 'bg-stone-800 text-stone-500',
}

const sourceIcons: Record<string, React.ReactNode> = {
  manual: <User className="h-3 w-3" />,
  ai_email: <Mail className="h-3 w-3" />,
  ai_attachment: <Mail className="h-3 w-3" />,
  meeting: <Calendar className="h-3 w-3" />,
  briefing: <Sparkles className="h-3 w-3" />,
}

// UI-facing statuses (removed "sendt" from quick-pick)
const allStatuses: TaskStatus[] = ['apen', 'sendt', 'mottatt', 'signert', 'utfort', 'lukket']
const quickStatuses: TaskStatus[] = ['apen', 'mottatt', 'signert', 'utfort', 'lukket']
const allPriorities: PriorityLevel[] = ['urgent', 'high', 'normal', 'low']

// ---------------------------------------------------------------------------
// TaskList component
// ---------------------------------------------------------------------------

export function TaskList({ groupedTasks, projects, currentFilters }: TaskListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [showNewTask, setShowNewTask] = useState(false)
  const [showAiInput, setShowAiInput] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  function toggleTask(id: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(projectId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams()
    const filters = { ...currentFilters, [key]: value }
    for (const [k, v] of Object.entries(filters)) {
      if (v !== 'alle') params.set(k, v)
    }
    router.push(`/tasks?${params.toString()}`)
  }

  function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    startTransition(async () => {
      await updateTaskStatus(taskId, newStatus)
    })
  }

  function handleSnooze(taskId: string, duration: '1d' | '3d' | '1w' | '1m') {
    startTransition(async () => {
      await snoozeTask(taskId, duration)
    })
  }

  function handleDelete(taskId: string) {
    if (!confirm('Er du sikker på at du vil slette denne oppgaven?')) return
    startTransition(async () => {
      await deleteTask(taskId)
    })
  }

  async function handleAiSubmit() {
    if (!aiText.trim()) return
    setAiLoading(true)
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Opprett oppgaver basert på denne instruksjonen: ${aiText}`,
        }),
      })
      setAiText('')
      setShowAiInput(false)
      router.refresh()
    } catch (err) {
      console.error('AI task creation failed:', err)
    } finally {
      setAiLoading(false)
    }
  }

  const totalTasks = groupedTasks.reduce((sum, g) => sum + g.tasks.length, 0)

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Oppgaver</h1>
          <p className="text-sm text-stone-400 mt-1">
            {totalTasks} oppgave{totalTasks !== 1 ? 'r' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAiInput(!showAiInput)}
            className="flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-400 hover:bg-purple-500/20 transition-colors"
          >
            <Bot className="h-4 w-4" />
            AI-instruksjon
          </button>
          <button
            onClick={() => setShowNewTask(!showNewTask)}
            className="flex items-center gap-2 rounded-lg bg-[#C07A4A]/10 px-3 py-2 text-sm font-medium text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ny oppgave
          </button>
        </div>
      </div>

      {/* AI instruction panel */}
      {showAiInput && (
        <div className="rounded-xl bg-[#1a1918] border border-purple-500/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-medium text-white">AI-instruksjon</h3>
          </div>
          <p className="text-xs text-stone-400 mb-3">
            Beskriv oppgavene du vil opprette med fritekst. AI-en tolker teksten
            og oppretter oppgaver automatisk.
          </p>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="F.eks: &quot;Lag oppgaver for å følge opp betongarbeid på prosjekt Fjordgata: bestille armering, koordinere med UE, sjekke forskaling&quot;"
            className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-purple-500/50 resize-none"
            rows={3}
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setShowAiInput(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-stone-400 hover:text-white transition-colors"
            >
              Avbryt
            </button>
            <button
              onClick={handleAiSubmit}
              disabled={aiLoading || !aiText.trim()}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              {aiLoading ? 'Behandler...' : 'Send til AI'}
            </button>
          </div>
        </div>
      )}

      {/* New task form */}
      {showNewTask && (
        <NewTaskForm
          projects={projects}
          onClose={() => setShowNewTask(false)}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="Status"
          value={currentFilters.status}
          onChange={(v) => setFilter('status', v)}
          options={[
            { value: 'alle', label: 'Alle statuser' },
            ...allStatuses.map((s) => ({
              value: s,
              label: statusLabels[s],
            })),
          ]}
        />
        <FilterSelect
          label="Prosjekt"
          value={currentFilters.project}
          onChange={(v) => setFilter('project', v)}
          options={[
            { value: 'alle', label: 'Alle prosjekter' },
            ...projects.map((p) => ({
              value: p.id,
              label: p.shortCode ? `${p.shortCode} - ${p.name}` : p.name,
            })),
          ]}
        />
        <FilterSelect
          label="Prioritet"
          value={currentFilters.priority}
          onChange={(v) => setFilter('priority', v)}
          options={[
            { value: 'alle', label: 'Alle prioriteter' },
            ...allPriorities.map((p) => ({
              value: p,
              label: priorityLabels[p],
            })),
          ]}
        />
      </div>

      {/* Task groups */}
      {groupedTasks.length > 0 ? (
        <div className="space-y-4">
          {groupedTasks.map((group) => {
            const isCollapsed = collapsedGroups.has(group.project.id)
            const color = projectColor(group.project.name)
            return (
              <div
                key={group.project.id}
                className="rounded-xl bg-[#1a1918] border border-[#2a2827] overflow-hidden"
              >
                {/* Color accent bar */}
                <div className="h-0.5" style={{ backgroundColor: color }} />

                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.project.id)}
                  className="flex items-center gap-3 w-full px-5 py-3 hover:bg-[#2a2827] transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-stone-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-stone-500" />
                  )}
                  <div
                    className="h-3 w-3 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm font-semibold text-white">
                    {group.project.shortCode && (
                      <span style={{ color }} className="mr-2 font-mono text-xs">
                        {group.project.shortCode}
                      </span>
                    )}
                    {group.project.name}
                  </span>
                  <span className="text-xs text-stone-500 ml-auto">
                    {group.tasks.length} oppgave{group.tasks.length !== 1 ? 'r' : ''}
                  </span>
                </button>

                {/* Tasks */}
                {!isCollapsed && (
                  <div className="border-t border-[#2a2827] divide-y divide-[#2a2827]">
                    {group.tasks.map((task) => {
                      const isExpanded = expandedTasks.has(task.id)
                      const isDone = task.status === 'utfort' || task.status === 'lukket'
                      const isOverdue =
                        task.dueDate &&
                        new Date(task.dueDate) < new Date() &&
                        !isDone

                      return (
                        <div
                          key={task.id}
                          className="hover:bg-[#2a2827] transition-colors"
                        >
                          {/* Task row */}
                          <div className="flex items-center gap-3 px-5 py-3">
                            {/* Checkbox — click to toggle utført */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStatusChange(task.id, isDone ? 'apen' : 'utfort')
                              }}
                              className="shrink-0 group/check"
                              title={isDone ? 'Marker som åpen' : 'Marker som utført'}
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
                              ) : (
                                <Circle className="h-[18px] w-[18px] text-stone-600 group-hover/check:text-emerald-500/50 transition-colors" />
                              )}
                            </button>

                            {/* Title — click to expand */}
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => toggleTask(task.id)}
                            >
                              <p className={`text-sm truncate ${isDone ? 'text-stone-500 line-through' : 'text-stone-200'}`}>
                                <span className="text-stone-600 mr-1.5">
                                  #{task.taskNumber}
                                </span>
                                {task.title}
                              </p>
                            </div>

                            {/* Due date */}
                            {task.dueDate && (
                              <span
                                className={`text-xs shrink-0 flex items-center gap-1 ${
                                  isOverdue
                                    ? 'text-red-400'
                                    : 'text-stone-500'
                                }`}
                              >
                                <Clock className="h-3 w-3" />
                                {new Date(task.dueDate).toLocaleDateString(
                                  'nb-NO',
                                  { day: 'numeric', month: 'short' }
                                )}
                              </span>
                            )}

                            {/* Priority badge */}
                            {task.priority !== 'normal' && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                                  priorityColors[task.priority]
                                }`}
                              >
                                {priorityLabels[task.priority]}
                              </span>
                            )}

                            {/* Status badge */}
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border shrink-0 ${
                                statusColors[task.status]
                              }`}
                            >
                              {statusLabels[task.status]}
                            </span>
                          </div>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="px-5 pb-4 pt-1 ml-10 border-l-2 border-[#2a2827]">
                              {task.description && (
                                <p className="text-sm text-stone-400 mb-3">
                                  {task.description}
                                </p>
                              )}
                              {task.note && (
                                <p className="text-sm text-stone-500 italic mb-3">
                                  Notat: {task.note}
                                </p>
                              )}
                              {task.sourceEmail && (
                                <p className="text-xs text-stone-500 mb-3 flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  Fra e-post: {task.sourceEmail.subject || 'Uten emne'}
                                </p>
                              )}

                              {/* Status buttons */}
                              <div className="flex items-center gap-4 mt-3">
                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] text-stone-500 mr-1">Status:</span>
                                  {quickStatuses.map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => handleStatusChange(task.id, s)}
                                      className={`text-[11px] px-2.5 py-1 rounded-full font-medium border transition-colors ${
                                        task.status === s
                                          ? statusColors[s]
                                          : 'border-[#2a2827] text-stone-500 hover:text-stone-300 hover:border-stone-600'
                                      }`}
                                    >
                                      {statusLabels[s]}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Snooze buttons */}
                              <div className="flex items-center gap-1 mt-2">
                                <span className="text-[11px] text-stone-500 mr-1 flex items-center gap-1">
                                  <AlarmClock className="h-3 w-3" />
                                  Utsett:
                                </span>
                                {([['1d', '1 dag'], ['3d', '3 dager'], ['1w', '1 uke'], ['1m', '1 mnd']] as const).map(([val, label]) => (
                                  <button
                                    key={val}
                                    onClick={() => handleSnooze(task.id, val)}
                                    className="text-[11px] px-2.5 py-1 rounded-full border border-[#2a2827] text-stone-500 hover:text-stone-300 hover:border-stone-600 transition-colors"
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>

                              {/* Delete */}
                              <div className="mt-3">
                                <button
                                  onClick={() => handleDelete(task.id)}
                                  className="rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Slett
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center mb-4">
            <Plus className="h-6 w-6 text-stone-500" />
          </div>
          <h3 className="text-sm font-medium text-white mb-1">Ingen oppgaver</h3>
          <p className="text-xs text-stone-500">
            Opprett en ny oppgave eller bruk AI-instruksjon for å komme i gang.
          </p>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// FilterSelect
// ---------------------------------------------------------------------------

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg bg-[#1a1918] border border-[#2a2827] px-3 py-2 text-sm text-stone-300 focus:outline-none focus:border-[#C07A4A]/50"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------------------
// NewTaskForm
// ---------------------------------------------------------------------------

function NewTaskForm({
  projects,
  onClose,
}: {
  projects: { id: string; name: string; shortCode: string | null }[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await createTask(formData)
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="rounded-xl bg-[#1a1918] border border-[#C07A4A]/20 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Ny oppgave</h3>
        <button
          onClick={onClose}
          className="text-stone-500 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form action={handleSubmit} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Prosjekt *
            </label>
            <select
              name="projectId"
              required
              className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C07A4A]/50"
            >
              <option value="">Velg prosjekt...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.shortCode ? `${p.shortCode} - ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Tittel *
            </label>
            <input
              name="title"
              required
              placeholder="Oppgavetittel"
              className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">
            Beskrivelse
          </label>
          <textarea
            name="description"
            rows={2}
            placeholder="Valgfri beskrivelse"
            className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50 resize-none"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Prioritet
            </label>
            <select
              name="priority"
              defaultValue="normal"
              className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C07A4A]/50"
            >
              <option value="urgent">Haster</option>
              <option value="high">Høy</option>
              <option value="normal">Normal</option>
              <option value="low">Lav</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Ansvarlig
            </label>
            <input
              name="assignee"
              placeholder="Navn"
              className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Frist</label>
            <input
              name="dueDate"
              type="date"
              className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C07A4A]/50"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-stone-400 hover:text-white transition-colors"
          >
            Avbryt
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#C07A4A] px-4 py-2 text-sm font-medium text-white hover:bg-[#d4a574] disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Oppretter...' : 'Opprett oppgave'}
          </button>
        </div>
      </form>
    </div>
  )
}
