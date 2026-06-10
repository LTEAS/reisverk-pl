'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Mail,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Check,
  X,
  Sparkles,
  MessageSquare,
  Loader2,
} from 'lucide-react'
import {
  createOutlookDraft,
  setEmailReplyStatus,
  dismissReplySuggestion,
} from '@/lib/actions/emails'

interface ReplySuggestionData {
  id: string
  draftSubject: string | null
  draftBody: string | null
  status: string
  outlookWebLink: string | null
}

interface EmailData {
  id: string
  subject: string | null
  senderName: string | null
  senderEmail: string | null
  receivedAt: Date | null
  bodyPreview: string | null
  aiSummary: string | null
  replyStatus: string | null
  project: { name: string; shortCode: string | null } | null
  replySuggestions: ReplySuggestionData[]
}

interface EmailListProps {
  emails: EmailData[]
  activeFilter: 'needs_reply' | 'awaiting_reply'
  counts: { needsReply: number; awaiting: number }
}

function formatDateTime(d: Date | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function EmailList({ emails, activeFilter, counts }: EmailListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [draftLoading, setDraftLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreateDraft(suggestionId: string) {
    setDraftLoading(suggestionId)
    setError(null)
    try {
      const { webLink } = await createOutlookDraft(suggestionId)
      if (webLink) {
        window.open(webLink, '_blank', 'noopener')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt')
    } finally {
      setDraftLoading(null)
    }
  }

  function handleMarkHandled(emailId: string) {
    startTransition(async () => {
      await setEmailReplyStatus(emailId, 'no_reply_needed')
      router.refresh()
    })
  }

  function handleDismissSuggestion(suggestionId: string) {
    startTransition(async () => {
      await dismissReplySuggestion(suggestionId)
      router.refresh()
    })
  }

  function askAiHref(email: EmailData): string {
    const subject = email.subject || '(uten emne)'
    const sender = email.senderName || email.senderEmail || 'ukjent avsender'
    const q = `Lag et svarforslag for e-posten fra ${sender} med emne "${subject}"`
    return `/chat?q=${encodeURIComponent(q)}`
  }

  return (
    <>
      {/* Header + filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">E-post</h1>
        <div className="flex items-center gap-1.5">
          <Link
            href="/emails"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'needs_reply'
                ? 'bg-[#C07A4A]/15 text-[#C07A4A]'
                : 'bg-[#1a1918] text-stone-500 hover:text-stone-300'
            }`}
          >
            Trenger svar ({counts.needsReply})
          </Link>
          <Link
            href="/emails?filter=venter"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'awaiting_reply'
                ? 'bg-[#C07A4A]/15 text-[#C07A4A]'
                : 'bg-[#1a1918] text-stone-500 hover:text-stone-300'
            }`}
          >
            Venter på andre ({counts.awaiting})
          </Link>
        </div>
      </div>

      {error && (
        <p className="text-xs text-rose-400 rounded-lg bg-rose-500/10 px-3 py-2">
          {error}
        </p>
      )}

      {/* Email list */}
      {emails.length === 0 ? (
        <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-10 text-center">
          <Mail className="h-8 w-8 text-stone-600 mx-auto mb-3" />
          <p className="text-sm text-stone-400">
            {activeFilter === 'needs_reply'
              ? 'Ingen e-poster trenger svar'
              : 'Ingen e-poster venter på svar fra andre'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {emails.map((email) => {
            const isOpen = expanded.has(email.id)
            const suggestion = email.replySuggestions[0] || null
            return (
              <li
                key={email.id}
                className="rounded-xl bg-[#1a1918] border border-[#2a2827] overflow-hidden"
              >
                {/* Row */}
                <button
                  onClick={() => toggle(email.id)}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-[#201f1e] transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-stone-500 mt-0.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-stone-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-stone-200 truncate">
                        {email.subject || '(uten emne)'}
                      </p>
                      {suggestion && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 shrink-0 flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" />
                          {suggestion.status === 'drafted'
                            ? 'Utkast i Outlook'
                            : 'Svarforslag klart'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-stone-500">
                        {email.senderName || email.senderEmail}
                      </span>
                      <span className="text-xs text-stone-600">
                        {formatDateTime(email.receivedAt)}
                      </span>
                      {email.project && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                          {email.project.shortCode || email.project.name}
                        </span>
                      )}
                    </div>
                    {email.aiSummary && (
                      <p className="text-xs text-stone-500 mt-1 truncate">
                        {email.aiSummary}
                      </p>
                    )}
                  </div>
                </button>

                {/* Expanded */}
                {isOpen && (
                  <div className="px-4 pb-4 pl-11 space-y-3">
                    {email.bodyPreview && (
                      <p className="text-xs text-stone-400 whitespace-pre-wrap rounded-lg bg-[#161514] border border-[#2a2827] p-3">
                        {email.bodyPreview}
                      </p>
                    )}

                    {suggestion && (
                      <div className="rounded-lg bg-[#161514] border border-amber-500/15 p-3">
                        <p className="text-[11px] font-medium text-amber-400 mb-1.5 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          AI-svarforslag
                        </p>
                        <p className="text-xs text-stone-300 whitespace-pre-wrap">
                          {suggestion.draftBody}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {suggestion && !suggestion.outlookWebLink && (
                        <button
                          onClick={() => handleCreateDraft(suggestion.id)}
                          disabled={draftLoading !== null}
                          className="flex items-center gap-1.5 rounded-lg bg-[#C07A4A]/10 px-3 py-1.5 text-xs font-medium text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors disabled:opacity-50"
                        >
                          {draftLoading === suggestion.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5" />
                          )}
                          Opprett utkast i Outlook
                        </button>
                      )}
                      {suggestion?.outlookWebLink && (
                        <a
                          href={suggestion.outlookWebLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-lg bg-[#C07A4A]/10 px-3 py-1.5 text-xs font-medium text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Åpne utkast i Outlook
                        </a>
                      )}
                      <Link
                        href={askAiHref(email)}
                        className="flex items-center gap-1.5 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-300 hover:bg-stone-700 transition-colors"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Spør AI
                      </Link>
                      <button
                        onClick={() => handleMarkHandled(email.id)}
                        disabled={isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Marker som håndtert
                      </button>
                      {suggestion && (
                        <button
                          onClick={() => handleDismissSuggestion(suggestion.id)}
                          disabled={isPending}
                          className="flex items-center gap-1.5 rounded-lg bg-stone-800/50 px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-300 transition-colors disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          Avvis forslag
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
