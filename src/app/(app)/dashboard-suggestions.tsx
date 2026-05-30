'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Mail, Sparkles, FolderPlus, ChevronDown } from 'lucide-react'
import { acceptSuggestion, rejectSuggestion } from '@/lib/actions/suggestions'

interface Suggestion {
  id: string
  title: string
  suggestionType: string
  details: any
  sourceEmailSubject: string | null
  project: { name: string; shortCode: string | null } | null
}

interface Project {
  id: string
  name: string
  shortCode: string | null
}

export function DashboardSuggestions({
  suggestions,
  projects = [],
}: {
  suggestions: Suggestion[]
  projects?: Project[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Track selected project per suggestion
  const [selectedProjects, setSelectedProjects] = useState<Record<string, string>>({})

  if (suggestions.length === 0) return null

  const projectSuggestions = suggestions.filter((s) => s.suggestionType === 'new_project')
  const taskSuggestions = suggestions.filter((s) => s.suggestionType !== 'new_project')

  function handleAccept(id: string) {
    const overrideProjectId = selectedProjects[id]
    startTransition(async () => {
      await acceptSuggestion(id, overrideProjectId || undefined)
      router.refresh()
    })
  }

  function handleReject(id: string) {
    startTransition(async () => {
      await rejectSuggestion(id)
      router.refresh()
    })
  }

  function setProjectForSuggestion(suggestionId: string, projectId: string) {
    setSelectedProjects((prev) => ({ ...prev, [suggestionId]: projectId }))
  }

  return (
    <div className="space-y-4">
      {/* Project suggestions */}
      {projectSuggestions.length > 0 && (
        <section className="rounded-xl bg-[#1a1918] border border-[#C07A4A]/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FolderPlus className="h-4 w-4 text-[#C07A4A]" />
            <h2 className="text-base font-semibold text-white">
              Nye prosjekter ({projectSuggestions.length})
            </h2>
            <span className="text-xs text-[#d4a574]/70">AI har oppdaget prosjekter fra e-post</span>
          </div>
          <ul className="space-y-3">
            {projectSuggestions.map((s) => (
              <li
                key={s.id}
                className="rounded-lg bg-[#161514] border border-[#C07A4A]/10 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#d4a574]">{s.title}</p>
                    {s.details?.reason && (
                      <p className="text-xs text-stone-400 mt-1">{s.details.reason}</p>
                    )}
                    {s.details?.suggestedSearchTerms?.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] text-stone-500">Søkeord:</span>
                        {s.details.suggestedSearchTerms.map((term: string, i: number) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[#C07A4A]/10 text-[#C07A4A]/80">
                            {term}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.details?.suggestedContacts?.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-stone-500">Kontakter:</span>
                        {s.details.suggestedContacts.map((c: string, i: number) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.sourceEmailSubject && (
                      <p className="text-xs text-stone-500 mt-1.5 flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {s.sourceEmailSubject}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleAccept(s.id)}
                      disabled={isPending}
                      className="rounded-lg p-2 bg-[#C07A4A]/10 text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors disabled:opacity-50"
                      title="Opprett prosjekt"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleReject(s.id)}
                      disabled={isPending}
                      className="rounded-lg p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      title="Avvis"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Task suggestions */}
      {taskSuggestions.length > 0 && (
        <section className="rounded-xl bg-[#1a1918] border border-amber-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h2 className="text-base font-semibold text-white">
              Oppgaveforslag ({taskSuggestions.length})
            </h2>
            <span className="text-xs text-amber-400/70">Venter på godkjenning</span>
          </div>
          <ul className="space-y-3">
            {taskSuggestions.map((s) => (
              <li
                key={s.id}
                className="rounded-lg bg-[#161514] border border-[#2a2827] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-200">{s.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <select
                        value={selectedProjects[s.id] || ''}
                        onChange={(e) => setProjectForSuggestion(s.id, e.target.value)}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-stone-300 hover:border-stone-600 focus:border-[#C07A4A] focus:outline-none cursor-pointer"
                      >
                        <option value="">
                          {s.project?.shortCode || s.project?.name || 'Velg prosjekt'}
                        </option>
                        {projects
                          .filter((p) => p.shortCode !== 'GEN' && p.shortCode !== 'PRIVAT')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.shortCode ? `${p.shortCode} — ${p.name}` : p.name}
                            </option>
                          ))}
                        {projects
                          .filter((p) => p.shortCode === 'GEN' || p.shortCode === 'PRIVAT')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                      {s.details?.priority && s.details.priority !== 'normal' && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            s.details.priority === 'urgent'
                              ? 'bg-red-500/10 text-red-400'
                              : s.details.priority === 'high'
                                ? 'bg-orange-500/10 text-orange-400'
                                : 'bg-stone-800 text-stone-400'
                          }`}
                        >
                          {s.details.priority === 'urgent'
                            ? 'Haster'
                            : s.details.priority === 'high'
                              ? 'Høy'
                              : s.details.priority}
                        </span>
                      )}
                    </div>
                    {s.sourceEmailSubject && (
                      <p className="text-xs text-stone-500 mt-1.5 flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {s.sourceEmailSubject}
                      </p>
                    )}
                    {s.details?.description && (
                      <p className="text-xs text-stone-400 mt-1">
                        {s.details.description.slice(0, 120)}
                        {s.details.description.length > 120 ? '...' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleAccept(s.id)}
                      disabled={isPending}
                      className="rounded-lg p-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                      title="Godkjenn"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleReject(s.id)}
                      disabled={isPending}
                      className="rounded-lg p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      title="Avvis"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
