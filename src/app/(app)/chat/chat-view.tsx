'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import {
  MessageSquare,
  Plus,
  Send,
  Bot,
  User,
  Wrench,
  Loader2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Thread {
  id: string
  title: string | null
  updatedAt: Date
  _count: { messages: number }
}

interface Message {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: { name: string }[]
}

const suggestions = [
  'Hva bør jeg prioritere i dag?',
  'Oppsummer ubesvarte e-poster',
  'Lag oppfølgingsoppgaver',
  'Gi meg en statusrapport for alle prosjekter',
  'Opprett prosjekt',
  'Finn søkeord for prosjekt',
  'Forbered meg til neste møte',
]

const capabilities = [
  { label: 'Prosjekter', desc: 'Opprette og endre prosjekter, finne relevante søkeord fra e-poster, legge til kontakter' },
  { label: 'Oppgaver', desc: 'Opprette, oppdatere og flytte oppgaver mellom prosjekter' },
  { label: 'E-post', desc: 'Søke i e-poster, oppsummere korrespondanse og lage svarforslag' },
  { label: 'Møter', desc: 'Se kalender, forberede til møter og finne relatert informasjon' },
  { label: 'AI-forslag', desc: 'Godkjenne ventende forslag og flytte oppgaver til riktig prosjekt' },
  { label: 'Hukommelse', desc: 'Lagre og hente kontekst som huskes mellom samtaler' },
]

// ---------------------------------------------------------------------------
// ChatView
// ---------------------------------------------------------------------------

export function ChatView({
  threads: initialThreads,
  initialPrompt = null,
}: {
  threads: Thread[]
  initialPrompt?: string | null
}) {
  const router = useRouter()
  const [threads, setThreads] = useState(initialThreads)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Prefill input from ?q= deep links (e.g. "Spør AI" buttons)
  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt)
      inputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // AI usage meter
  const [usage, setUsage] = useState<{
    unlimited: boolean
    spentNok: number
    limitNok: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) setUsage(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [loading])

  async function loadThread(threadId: string) {
    setSelectedThreadId(threadId)
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/chat/threads/${threadId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(
          data.messages.map((m: any) => {
            const parts = m.parts as any[]
            const textParts = parts.filter((p: any) => p.type === 'text')
            const toolParts = parts.filter((p: any) => p.type === 'tool_calls')
            return {
              role: m.role,
              text: textParts.map((p: any) => p.text).join('\n'),
              toolCalls: toolParts.flatMap((p: any) => p.calls || []),
            }
          })
        )
      }
    } catch (err) {
      console.error('Failed to load thread:', err)
    } finally {
      setLoadingMessages(false)
    }
  }

  function handleNewThread() {
    setSelectedThreadId(null)
    setMessages([])
    inputRef.current?.focus()
  }

  async function handleSend(text?: string) {
    const messageText = text || input.trim()
    if (!messageText || loading) return

    setInput('')
    const userMessage: Message = { role: 'user', text: messageText }
    setMessages((prev) => [...prev, userMessage])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: selectedThreadId || undefined,
          message: messageText,
          stream: true,
        }),
      })

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: 'Beklager, noe gikk galt. Prøv igjen.' },
        ])
        return
      }

      // Add empty assistant message that we'll fill progressively
      const assistantIdx = messages.length + 1 // +1 for the user message we just added
      setMessages((prev) => [...prev, { role: 'assistant', text: '', toolCalls: [] }])

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No reader')
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''
      let toolCalls: { name: string }[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line.startsWith('event: ')) {
            const event = line.slice(7).trim()
            const dataLine = lines[i + 1]
            if (!dataLine?.startsWith('data: ')) continue
            const data = JSON.parse(dataLine.slice(6))
            i++ // Skip the data line

            if (event === 'text_delta') {
              fullText += data.delta
              const captured = fullText
              setMessages((prev) => {
                const updated = [...prev]
                updated[assistantIdx] = {
                  ...updated[assistantIdx],
                  text: captured,
                }
                return updated
              })
            } else if (event === 'tool_call') {
              toolCalls = [...toolCalls, { name: data.name }]
              const captured = toolCalls
              setMessages((prev) => {
                const updated = [...prev]
                updated[assistantIdx] = {
                  ...updated[assistantIdx],
                  toolCalls: captured,
                }
                return updated
              })
            } else if (event === 'done') {
              // Final update with complete data
              setMessages((prev) => {
                const updated = [...prev]
                updated[assistantIdx] = {
                  role: 'assistant',
                  text: data.response,
                  toolCalls: data.toolCalls || [],
                }
                return updated
              })
              if (!selectedThreadId && data.threadId) {
                setSelectedThreadId(data.threadId)
                setThreads((prev) => [
                  {
                    id: data.threadId,
                    title: messageText.slice(0, 80),
                    updatedAt: new Date(),
                    _count: { messages: 2 },
                  },
                  ...prev,
                ])
              }
            } else if (event === 'error') {
              setMessages((prev) => {
                const updated = [...prev]
                updated[assistantIdx] = {
                  role: 'assistant',
                  text: `Feil: ${data.message}`,
                }
                return updated
              })
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Nettverksfeil. Sjekk tilkoblingen.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function relativeTime(date: Date): string {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Nå'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}t`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  return (
    <>
      {/* Thread sidebar */}
      <div className="w-60 shrink-0 border-r border-[#2a2827] bg-[#1a1918] flex flex-col hidden md:flex">
        <div className="p-3 border-b border-[#2a2827]">
          <button
            onClick={handleNewThread}
            className="flex items-center gap-2 w-full rounded-lg bg-[#C07A4A]/10 px-3 py-2 text-sm font-medium text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ny samtale
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => loadThread(thread.id)}
              className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                selectedThreadId === thread.id
                  ? 'bg-[#C07A4A]/10 text-white'
                  : 'text-stone-400 hover:bg-[#2a2827] hover:text-white'
              }`}
            >
              <p className="truncate">
                {thread.title || 'Uten tittel'}
              </p>
              <p className="text-[10px] text-stone-600 mt-0.5">
                {relativeTime(thread.updatedAt)} &middot;{' '}
                {thread._count.messages} melding
                {thread._count.messages !== 1 ? 'er' : ''}
              </p>
            </button>
          ))}
          {threads.length === 0 && (
            <p className="text-xs text-stone-600 text-center py-4">
              Ingen samtaler ennå
            </p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top banner — always visible */}
        <div className="shrink-0 border-b border-[#2a2827] bg-[#161514]">
          {messages.length === 0 && !loadingMessages ? (
            /* Full banner when no messages */
            <div className="p-5 max-w-3xl mx-auto">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#C07A4A]/20 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-[#C07A4A]" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-white">AI-assistent</h2>
                  <p className="text-xs text-stone-500">Din prosjektassistent for Reisverk</p>
                </div>
                <UsageMeter usage={usage} />
              </div>
              <p className="text-sm text-stone-400 mb-4">
                Jeg kan hjelpe deg med det meste i prosjektoppfølgingen. Spør meg om noe, eller bruk en av hurtigkommandoene under.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                {capabilities.map((cap) => (
                  <div
                    key={cap.label}
                    className="rounded-lg bg-[#1a1918] border border-[#2a2827] px-3 py-2"
                  >
                    <p className="text-xs font-medium text-stone-200">{cap.label}</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">{cap.desc}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="rounded-lg bg-[#1a1918] border border-[#2a2827] px-3 py-1.5 text-xs text-stone-400 hover:text-white hover:border-[#C07A4A]/30 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Compact banner when messages exist */
            <div className="px-5 py-3 max-w-3xl mx-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[#C07A4A]" />
                  <span className="text-sm font-medium text-white">AI-assistent</span>
                  <span className="text-[11px] text-stone-600">—</span>
                  <span className="text-[11px] text-stone-500">Prosjekter, oppgaver, e-post, møter, forslag</span>
                </div>
                <UsageMeter usage={usage} />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {suggestions.slice(0, 4).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="rounded-md bg-[#1a1918] border border-[#2a2827] px-2 py-1 text-[11px] text-stone-500 hover:text-white hover:border-[#C07A4A]/30 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loadingMessages && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-stone-500 animate-spin" />
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${
                msg.role === 'user' ? 'justify-end' : ''
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C07A4A]/10">
                  <Bot className="h-4 w-4 text-[#C07A4A]" />
                </div>
              )}
              <div
                className={`rounded-xl px-4 py-3 max-w-[80%] ${
                  msg.role === 'user'
                    ? 'bg-[#C07A4A] text-white'
                    : 'bg-[#1a1918] border border-[#2a2827] text-stone-200'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-headings:text-stone-100 prose-h2:text-base prose-h2:font-semibold prose-h2:mt-5 prose-h2:mb-2 prose-h3:text-sm prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-1.5 prose-p:my-2 prose-p:leading-relaxed prose-ul:my-2 prose-li:my-0.5 prose-strong:text-stone-100 prose-hr:border-stone-700/50 prose-hr:my-4 first:prose-h2:mt-0 first:prose-h3:mt-0">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                )}

                {/* Tool call badges */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[#2a2827]">
                    {msg.toolCalls.map((tc, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 text-[10px] bg-purple-500/10 text-purple-400 rounded px-1.5 py-0.5"
                      >
                        <Wrench className="h-2.5 w-2.5" />
                        {tc.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-800">
                  <User className="h-4 w-4 text-stone-400" />
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C07A4A]/10">
                <Bot className="h-4 w-4 text-[#C07A4A]" />
              </div>
              <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-stone-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-stone-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-stone-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[#2a2827] p-4">
          <div className="flex items-end gap-3 max-w-3xl mx-auto">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Skriv en melding..."
                rows={1}
                className="w-full rounded-xl bg-[#1a1918] border border-[#2a2827] px-4 py-3 pr-12 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50 resize-none"
                style={{ minHeight: '44px', maxHeight: '160px' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="absolute right-2 bottom-2 rounded-lg bg-[#C07A4A] p-1.5 text-white hover:bg-[#d4a574] disabled:opacity-30 disabled:hover:bg-[#C07A4A] transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// UsageMeter — compact AI quota indicator for the chat header
// ---------------------------------------------------------------------------

function UsageMeter({
  usage,
}: {
  usage: { unlimited: boolean; spentNok: number; limitNok: number } | null
}) {
  if (!usage || usage.unlimited) return null

  const pct = usage.limitNok > 0
    ? Math.min((usage.spentNok / usage.limitNok) * 100, 100)
    : 0
  const nearLimit = pct >= 80
  const exhausted = pct >= 100

  return (
    <a
      href="/settings"
      className="shrink-0 group"
      title={`AI-forbruk: ${usage.spentNok.toFixed(1)} av ${usage.limitNok.toFixed(0)} kr denne måneden`}
    >
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 rounded-full bg-[#2a2827] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              exhausted ? 'bg-red-500' : nearLimit ? 'bg-amber-400' : 'bg-[#C07A4A]'
            }`}
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
        </div>
        <span
          className={`text-[10px] font-medium ${
            exhausted
              ? 'text-red-400'
              : nearLimit
                ? 'text-amber-400'
                : 'text-stone-500 group-hover:text-stone-300'
          }`}
        >
          {exhausted
            ? 'Kvote brukt opp'
            : `${usage.spentNok.toFixed(0)}/${usage.limitNok.toFixed(0)} kr`}
        </span>
      </div>
    </a>
  )
}
