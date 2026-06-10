'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, ExternalLink, X, Loader2, Sparkles } from 'lucide-react'
import {
  createOutlookDraft,
  dismissReplySuggestion,
} from '@/lib/actions/emails'

interface ReplyQueueItem {
  id: string
  draftBody: string | null
  outlookWebLink: string | null
  email: {
    subject: string | null
    senderName: string | null
    senderEmail: string | null
  }
  project: { name: string; shortCode: string | null } | null
}

/**
 * Reply suggestions awaiting review — part of the unified approval queue
 * on the dashboard.
 */
export function DashboardReplyQueue({ items }: { items: ReplyQueueItem[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draftLoading, setDraftLoading] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (items.length === 0) return null

  async function handleCreateDraft(id: string) {
    setDraftLoading(id)
    try {
      const { webLink } = await createOutlookDraft(id)
      if (webLink) window.open(webLink, '_blank', 'noopener')
      router.refresh()
    } catch {
      // Error surfaces via refresh / list state
    } finally {
      setDraftLoading(null)
    }
  }

  function handleDismiss(id: string) {
    startTransition(async () => {
      await dismissReplySuggestion(id)
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl bg-[#1a1918] border border-sky-500/20 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="h-4 w-4 text-sky-400" />
        <h2 className="text-base font-semibold text-white">
          Svarforslag ({items.length})
        </h2>
        <span className="text-xs text-sky-400/70">
          AI har laget utkast — godkjenn for å opprette i Outlook
        </span>
      </div>
      <ul className="space-y-3">
        {items.map((s) => (
          <li
            key={s.id}
            className="rounded-lg bg-[#161514] border border-[#2a2827] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-200 truncate">
                  {s.email.subject || '(uten emne)'}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-stone-500">
                    Til: {s.email.senderName || s.email.senderEmail}
                  </span>
                  {s.project && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                      {s.project.shortCode || s.project.name}
                    </span>
                  )}
                </div>
                {s.draftBody && (
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === s.id ? null : s.id)
                    }
                    className="text-xs text-stone-500 hover:text-stone-300 mt-1.5 flex items-center gap-1 transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    {expandedId === s.id ? 'Skjul utkast' : 'Vis utkast'}
                  </button>
                )}
                {expandedId === s.id && s.draftBody && (
                  <p className="text-xs text-stone-400 whitespace-pre-wrap mt-2 rounded-lg bg-[#1a1918] border border-[#2a2827] p-2.5">
                    {s.draftBody}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {s.outlookWebLink ? (
                  <a
                    href={s.outlookWebLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg p-2 bg-[#C07A4A]/10 text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors"
                    title="Åpne utkast i Outlook"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <button
                    onClick={() => handleCreateDraft(s.id)}
                    disabled={draftLoading !== null}
                    className="rounded-lg p-2 bg-[#C07A4A]/10 text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors disabled:opacity-50"
                    title="Opprett utkast i Outlook"
                  >
                    {draftLoading === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => handleDismiss(s.id)}
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
  )
}
