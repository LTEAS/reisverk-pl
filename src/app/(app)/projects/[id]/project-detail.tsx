'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckSquare,
  Mail,
  Sparkles,
  Settings,
  Clock,
  User,
  Check,
  X,
  Plus,
  Trash2,
  Building2,
  Search,
  AtSign,
  Users,
} from 'lucide-react'
import { updateTaskStatus, proposeTaskDueDates, setTaskDueDate } from '@/lib/actions/tasks'
import { changeEmailProject } from '@/lib/actions/emails'
import {
  updateProject,
  addContact,
  addSearchTerm,
  removeSearchTerm,
  addEmailMonitor,
  removeEmailMonitor,
} from '@/lib/actions/projects'
import type { TaskStatus, SuggestionType, ProjectRole } from '@prisma/client'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const statusLabels: Record<string, string> = {
  apen: 'Åpen', sendt: 'Sendt', mottatt: 'Mottatt',
  signert: 'Signert', utfort: 'Utført', lukket: 'Lukket',
}

const statusColors: Record<string, string> = {
  apen: 'bg-[#C07A4A]/10 text-[#C07A4A] border-[#C07A4A]/20',
  sendt: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  mottatt: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  signert: 'bg-green-500/10 text-green-400 border-green-500/20',
  utfort: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  lukket: 'bg-stone-500/10 text-stone-400 border-stone-500/20',
}

const suggestionTypeLabels: Record<string, string> = {
  new_task: 'Ny oppgave',
  status_update: 'Statusoppdatering',
  close_task: 'Lukk oppgave',
}

const tabs = [
  { key: 'tasks', label: 'Oppgaver', icon: CheckSquare },
  { key: 'emails', label: 'E-poster', icon: Mail },
  { key: 'suggestions', label: 'AI-forslag', icon: Sparkles },
  { key: 'settings', label: 'Innstillinger', icon: Settings },
] as const

type TabKey = (typeof tabs)[number]['key']

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProjectDetailProps {
  project: {
    id: string
    name: string
    shortCode: string | null
    description: string | null
    byggherre: string | null
    searchTerms: string[]
    excludeTerms: string[]
  }
  tasks: Array<{
    id: string
    title: string
    description: string | null
    status: TaskStatus
    priority: string
    assignee: string | null
    dueDate: Date | null
    taskNumber: number
    assigneeUser: { displayName: string | null; email: string | null } | null
    sourceEmail: { id: string; subject: string | null } | null
  }>
  emails: Array<{
    id: string
    subject: string | null
    senderEmail: string | null
    senderName: string | null
    receivedAt: Date | null
    aiSummary: string | null
    replyStatus: string | null
    direction: string | null
  }>
  suggestions: Array<{
    id: string
    suggestionType: SuggestionType
    title: string
    details: any
    sourceEmailSubject: string | null
    createdAt: Date
  }>
  contacts: Array<{
    id: string
    name: string
    email: string | null
    phone: string | null
    company: string | null
    roleDescription: string | null
  }>
  emailMonitors: Array<{
    id: string
    emailAddress: string
    displayName: string | null
    description: string | null
  }>
  members: Array<{
    id: string
    role: ProjectRole
    user: { id: string; displayName: string | null; email: string | null }
  }>
  allProjects: Array<{ id: string; name: string; shortCode: string | null }>
  userRole: ProjectRole
}

// ---------------------------------------------------------------------------
// ProjectDetail
// ---------------------------------------------------------------------------

export function ProjectDetail({
  project,
  tasks,
  emails,
  suggestions,
  contacts,
  emailMonitors,
  members,
  allProjects,
  userRole,
}: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('tasks')
  const isAdmin = userRole === 'owner' || userRole === 'pl'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/projects"
          className="rounded-lg p-2 text-stone-400 hover:bg-[#2a2827] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
            {project.shortCode && (
              <span className="text-sm font-mono text-stone-500 bg-stone-800 px-2 py-0.5 rounded">
                {project.shortCode}
              </span>
            )}
          </div>
          {project.byggherre && (
            <div className="flex items-center gap-1.5 mt-1">
              <Building2 className="h-3 w-3 text-stone-500" />
              <span className="text-sm text-stone-400">{project.byggherre}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#2a2827]">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          let count = 0
          if (tab.key === 'tasks') count = tasks.filter((t) => !['utfort', 'lukket'].includes(t.status)).length
          if (tab.key === 'emails') count = emails.length
          if (tab.key === 'suggestions') count = suggestions.length

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-[#C07A4A] text-white'
                  : 'border-transparent text-stone-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {count > 0 && (
                <span className="text-[10px] bg-stone-800 text-stone-400 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'tasks' && <TasksTab tasks={tasks} projectId={project.id} />}
      {activeTab === 'emails' && <EmailsTab emails={emails} currentProjectId={project.id} allProjects={allProjects} />}
      {activeTab === 'suggestions' && (
        <SuggestionsTab suggestions={suggestions} projectId={project.id} />
      )}
      {activeTab === 'settings' && (
        <SettingsTab
          project={project}
          contacts={contacts}
          emailMonitors={emailMonitors}
          members={members}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TasksTab
// ---------------------------------------------------------------------------

type DueDateProposal = {
  taskId: string
  taskNumber: number
  title: string
  suggestedDueDate: string
  reason: string
  confidence: number
}

function TasksTab({
  tasks,
  projectId,
}: {
  tasks: ProjectDetailProps['tasks']
  projectId: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [loadingProposals, setLoadingProposals] = useState(false)
  const [proposals, setProposals] = useState<DueDateProposal[] | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [dates, setDates] = useState<Record<string, string>>({})
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    startTransition(async () => {
      await updateTaskStatus(taskId, newStatus)
    })
  }

  async function handlePropose() {
    setLoadingProposals(true)
    setError(null)
    try {
      const result = await proposeTaskDueDates(projectId)
      setProposals(result)
      const sel: Record<string, boolean> = {}
      const dt: Record<string, string> = {}
      for (const p of result) {
        sel[p.taskId] = true
        dt[p.taskId] = p.suggestedDueDate
      }
      setSelected(sel)
      setDates(dt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke hente forslag')
    } finally {
      setLoadingProposals(false)
    }
  }

  async function handleApply() {
    if (!proposals) return
    setApplying(true)
    setError(null)
    try {
      const chosen = proposals.filter((p) => selected[p.taskId] && dates[p.taskId])
      for (const p of chosen) {
        await setTaskDueDate(p.taskId, dates[p.taskId])
      }
      setProposals(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre frister')
    } finally {
      setApplying(false)
    }
  }

  if (tasks.length === 0) {
    return (
      <EmptyState icon={CheckSquare} title="Ingen oppgaver" description="Det er ingen oppgaver i dette prosjektet ennå." />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={handlePropose}
          disabled={loadingProposals}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {loadingProposals ? 'Analyserer…' : 'Foreslå frister (AI)'}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {proposals && (
        <div className="rounded-xl bg-[#1a1918] border border-purple-500/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-purple-200 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" /> Forslag til frister
            </h4>
            <button onClick={() => setProposals(null)} className="text-stone-500 hover:text-stone-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          {proposals.length === 0 ? (
            <p className="text-xs text-stone-500">
              AI-en fant ikke konkret grunnlag for frister på de gjenstående oppgavene.
            </p>
          ) : (
            <>
              <div className="divide-y divide-[#2a2827]">
                {proposals.map((p) => (
                  <div key={p.taskId} className="flex items-start gap-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={!!selected[p.taskId]}
                      onChange={(e) => setSelected((s) => ({ ...s, [p.taskId]: e.target.checked }))}
                      className="mt-1 accent-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-200 truncate">
                        <span className="text-stone-600 mr-1.5">#{p.taskNumber}</span>
                        {p.title}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">{p.reason}</p>
                    </div>
                    <input
                      type="date"
                      value={dates[p.taskId] || ''}
                      onChange={(e) => setDates((d) => ({ ...d, [p.taskId]: e.target.value }))}
                      className="text-xs rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-2 py-1 text-stone-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setProposals(null)} className="text-xs px-3 py-1.5 rounded-lg text-stone-400 hover:text-stone-200">
                  Avbryt
                </button>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                >
                  {applying ? 'Lagrer…' : 'Lagre valgte'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] divide-y divide-[#2a2827]">
        {tasks.map((task) => {
          const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !['utfort', 'lukket'].includes(task.status)
          return (
            <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#2a2827] transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-200 truncate">
                  <span className="text-stone-600 mr-1.5">#{task.taskNumber}</span>
                  {task.title}
                </p>
                {task.description && (
                  <p className="text-xs text-stone-500 truncate mt-0.5">{task.description}</p>
                )}
              </div>
              {(task.assigneeUser || task.assignee) && (
                <span className="text-xs text-stone-500 hidden sm:block">{task.assigneeUser?.displayName || task.assignee}</span>
              )}
              {task.dueDate && (
                <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-stone-500'}`}>
                  <Clock className="h-3 w-3" />
                  {new Date(task.dueDate).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                </span>
              )}
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium border appearance-none cursor-pointer focus:outline-none ${statusColors[task.status]}`}
              >
                {Object.entries(statusLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmailsTab
// ---------------------------------------------------------------------------

function EmailsTab({
  emails,
  currentProjectId,
  allProjects,
}: {
  emails: ProjectDetailProps['emails']
  currentProjectId: string
  allProjects: ProjectDetailProps['allProjects']
}) {
  const [movingId, setMovingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleMove(emailId: string, newProjectId: string) {
    startTransition(async () => {
      await changeEmailProject(emailId, newProjectId)
      setMovingId(null)
      router.refresh()
    })
  }

  if (emails.length === 0) {
    return <EmptyState icon={Mail} title="Ingen e-poster" description="Ingen e-poster er klassifisert til dette prosjektet ennå." />
  }

  const otherProjects = allProjects.filter((p) => p.id !== currentProjectId)

  return (
    <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] divide-y divide-[#2a2827]">
      {emails.map((email) => (
        <div key={email.id} className="px-5 py-3 hover:bg-[#2a2827] transition-colors group">
          <div className="flex items-center gap-3">
            <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${
              email.replyStatus === 'needs_reply' ? 'bg-amber-400' :
              email.replyStatus === 'awaiting_reply' ? 'bg-[#C07A4A]' : 'bg-stone-600'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-stone-200 truncate">{email.subject || 'Uten emne'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-stone-500">{email.senderName || email.senderEmail}</span>
                {email.receivedAt && (
                  <span className="text-[10px] text-stone-600">
                    {new Date(email.receivedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
            {email.direction && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                email.direction === 'inbound' ? 'bg-[#C07A4A]/10 text-[#C07A4A]' : 'bg-green-500/10 text-green-400'
              }`}>
                {email.direction === 'inbound' ? 'Inn' : 'Ut'}
              </span>
            )}
            {/* Move to project button */}
            {movingId === email.id ? (
              <select
                autoFocus
                className="text-[10px] bg-[#2a2827] border border-[#3a3837] rounded px-1.5 py-1 text-stone-300 focus:outline-none"
                onChange={(e) => {
                  if (e.target.value) handleMove(email.id, e.target.value)
                  else setMovingId(null)
                }}
                onBlur={() => setMovingId(null)}
                disabled={isPending}
              >
                <option value="">Velg prosjekt...</option>
                {otherProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shortCode ? `[${p.shortCode}] ` : ''}{p.name}
                  </option>
                ))}
              </select>
            ) : (
              <button
                onClick={() => setMovingId(email.id)}
                className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded text-stone-500 hover:text-stone-300 hover:bg-[#3a3837] transition-all"
                title="Flytt til annet prosjekt"
              >
                Flytt
              </button>
            )}
          </div>
          {email.aiSummary && (
            <p className="text-xs text-stone-500 mt-1.5 ml-4 line-clamp-2">{email.aiSummary}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SuggestionsTab
// ---------------------------------------------------------------------------

function SuggestionsTab({
  suggestions,
  projectId,
}: {
  suggestions: ProjectDetailProps['suggestions']
  projectId: string
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function handleAction(suggestionId: string, action: 'accepted' | 'rejected') {
    startTransition(async () => {
      await fetch(`/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: action === 'accepted'
            ? `Godkjenn AI-forslaget med ID ${suggestionId}`
            : `Avvis AI-forslaget med ID ${suggestionId}`,
        }),
      })
      router.refresh()
    })
  }

  if (suggestions.length === 0) {
    return <EmptyState icon={Sparkles} title="Ingen ventende forslag" description="AI-en har ingen ubehandlede forslag for dette prosjektet." />
  }

  return (
    <div className="space-y-3">
      {suggestions.map((s) => (
        <div key={s.id} className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-4 hover:bg-[#2a2827] transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">
                  {suggestionTypeLabels[s.suggestionType] || s.suggestionType}
                </span>
                <span className="text-[10px] text-stone-600">
                  {new Date(s.createdAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <p className="text-sm text-stone-200">{s.title}</p>
              {s.sourceEmailSubject && (
                <p className="text-xs text-stone-500 mt-1">
                  <Mail className="h-3 w-3 inline mr-1" />
                  Fra: {s.sourceEmailSubject}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleAction(s.id, 'accepted')}
                disabled={isPending}
                className="rounded-lg bg-green-500/10 p-1.5 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                title="Godkjenn"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleAction(s.id, 'rejected')}
                disabled={isPending}
                className="rounded-lg bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                title="Avvis"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsTab
// ---------------------------------------------------------------------------

function SettingsTab({
  project,
  contacts,
  emailMonitors,
  members,
  isAdmin,
}: {
  project: ProjectDetailProps['project']
  contacts: ProjectDetailProps['contacts']
  emailMonitors: ProjectDetailProps['emailMonitors']
  members: ProjectDetailProps['members']
  isAdmin: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [editName, setEditName] = useState(project.name)
  const [editDesc, setEditDesc] = useState(project.description || '')
  const [editByggherre, setEditByggherre] = useState(project.byggherre || '')
  const [newTerm, setNewTerm] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [newContactCompany, setNewContactCompany] = useState('')
  const [newMonitorEmail, setNewMonitorEmail] = useState('')
  const [newMonitorName, setNewMonitorName] = useState('')

  function handleSaveProject() {
    startTransition(async () => {
      await updateProject(project.id, {
        name: editName,
        description: editDesc || undefined,
        byggherre: editByggherre || undefined,
      })
      router.refresh()
    })
  }

  function handleAddTerm() {
    if (!newTerm.trim()) return
    startTransition(async () => {
      await addSearchTerm(project.id, newTerm.trim())
      setNewTerm('')
      router.refresh()
    })
  }

  function handleRemoveTerm(term: string) {
    startTransition(async () => {
      await removeSearchTerm(project.id, term)
      router.refresh()
    })
  }

  function handleAddContact() {
    if (!newContactName.trim()) return
    startTransition(async () => {
      await addContact(project.id, {
        name: newContactName.trim(),
        email: newContactEmail || undefined,
        company: newContactCompany || undefined,
      })
      setNewContactName('')
      setNewContactEmail('')
      setNewContactCompany('')
      router.refresh()
    })
  }

  function handleAddMonitor() {
    if (!newMonitorEmail.trim()) return
    startTransition(async () => {
      await addEmailMonitor(project.id, {
        emailAddress: newMonitorEmail.trim(),
        displayName: newMonitorName || undefined,
      })
      setNewMonitorEmail('')
      setNewMonitorName('')
      router.refresh()
    })
  }

  function handleRemoveMonitor(monitorId: string) {
    startTransition(async () => {
      await removeEmailMonitor(monitorId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Project info */}
      <Section title="Prosjektinformasjon">
        <div className="space-y-3">
          <Field label="Prosjektnavn" value={editName} onChange={setEditName} disabled={!isAdmin} />
          <Field label="Beskrivelse" value={editDesc} onChange={setEditDesc} disabled={!isAdmin} multiline />
          <Field label="Byggherre" value={editByggherre} onChange={setEditByggherre} disabled={!isAdmin} />
          {isAdmin && (
            <button onClick={handleSaveProject} disabled={isPending} className="rounded-lg bg-[#C07A4A] px-4 py-2 text-sm font-medium text-white hover:bg-[#d4a574] disabled:opacity-50 transition-colors">
              {isPending ? 'Lagrer...' : 'Lagre endringer'}
            </button>
          )}
        </div>
      </Section>

      {/* Search terms */}
      <Section title="Søkeord for e-postklassifisering" icon={Search}>
        <div className="flex flex-wrap gap-2 mb-3">
          {project.searchTerms.map((term) => (
            <span key={term} className="flex items-center gap-1.5 text-xs bg-[#C07A4A]/10 text-[#C07A4A] rounded-full px-2.5 py-1">
              {term}
              {isAdmin && (
                <button onClick={() => handleRemoveTerm(term)} className="hover:text-white transition-colors">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {project.searchTerms.length === 0 && (
            <span className="text-xs text-stone-500">Ingen søkeord definert</span>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <input value={newTerm} onChange={(e) => setNewTerm(e.target.value)} placeholder="Legg til søkeord" onKeyDown={(e) => e.key === 'Enter' && handleAddTerm()} className="flex-1 rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-1.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50" />
            <button onClick={handleAddTerm} disabled={isPending} className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-700 transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </Section>

      {/* Contacts */}
      <Section title="Kontakter" icon={Users}>
        {contacts.length > 0 && (
          <div className="space-y-2 mb-3">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg bg-[#0f0e0d] px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-800 text-xs font-medium text-stone-300">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-200">{c.name}</p>
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    {c.company && <span>{c.company}</span>}
                    {c.email && <span>{c.email}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="grid grid-cols-3 gap-2">
            <input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Navn" className="rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-1.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50" />
            <input value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} placeholder="E-post" className="rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-1.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50" />
            <div className="flex gap-2">
              <input value={newContactCompany} onChange={(e) => setNewContactCompany(e.target.value)} placeholder="Firma" className="flex-1 rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-1.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50" />
              <button onClick={handleAddContact} disabled={isPending} className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-700 transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* Email monitors */}
      <Section title="E-postovervåking" icon={AtSign}>
        {emailMonitors.length > 0 && (
          <div className="space-y-2 mb-3">
            {emailMonitors.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-[#0f0e0d] px-3 py-2">
                <div>
                  <p className="text-sm text-stone-200">{m.emailAddress}</p>
                  {m.displayName && <p className="text-xs text-stone-500">{m.displayName}</p>}
                </div>
                {isAdmin && (
                  <button onClick={() => handleRemoveMonitor(m.id)} className="text-stone-500 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-2">
            <input value={newMonitorEmail} onChange={(e) => setNewMonitorEmail(e.target.value)} placeholder="E-postadresse" className="flex-1 rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-1.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50" />
            <input value={newMonitorName} onChange={(e) => setNewMonitorName(e.target.value)} placeholder="Visningsnavn" className="flex-1 rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-1.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50" />
            <button onClick={handleAddMonitor} disabled={isPending} className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-700 transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </Section>

      {/* Members */}
      <Section title="Medlemmer" icon={Users}>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg bg-[#0f0e0d] px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#C07A4A]/20 text-xs font-medium text-[#d4a574]">
                {(m.user.displayName || m.user.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-200">{m.user.displayName || m.user.email}</p>
                {m.user.email && <p className="text-xs text-stone-500">{m.user.email}</p>}
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 font-medium">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon?: any
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="h-4 w-4 text-stone-500" />}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  disabled,
  multiline,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  multiline?: boolean
}) {
  const cls = 'w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50 disabled:opacity-50'
  return (
    <div>
      <label className="block text-xs text-stone-400 mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={2} className={`${cls} resize-none`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={cls} />
      )}
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-stone-500" />
      </div>
      <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
      <p className="text-xs text-stone-500">{description}</p>
    </div>
  )
}
