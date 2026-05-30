'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Bot, Send, Wrench, Loader2 } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: { name: string }[]
}

const quickActions = [
  'Legg alle oppgavene på ',
  'Opprett prosjekt ',
  'Hva bør jeg prioritere i dag?',
  'Oppsummer ubesvarte e-poster',
]

export function DashboardChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(text?: string) {
    const messageText = text || input.trim()
    if (!messageText || loading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: messageText }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: threadId || undefined,
          message: messageText,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.response,
            toolCalls: data.toolCalls,
          },
        ])
        if (!threadId && data.threadId) {
          setThreadId(data.threadId)
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: 'Beklager, noe gikk galt.' },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Nettverksfeil.' },
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

  return (
    <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="h-4 w-4 text-[#C07A4A]" />
        <h2 className="text-base font-semibold text-white">AI-assistent</h2>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#C07A4A]/10 mt-0.5">
                  <Bot className="h-3 w-3 text-[#C07A4A]" />
                </div>
              )}
              <div
                className={`rounded-lg px-3 py-2 max-w-[85%] ${
                  msg.role === 'user'
                    ? 'bg-[#C07A4A] text-white text-sm'
                    : 'bg-[#1a1918] border border-[#2a2827] text-stone-200'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-headings:text-stone-100 prose-h2:text-sm prose-h2:font-semibold prose-h2:mt-4 prose-h2:mb-1.5 prose-h3:text-sm prose-h3:font-semibold prose-h3:mt-3 prose-h3:mb-1 prose-p:my-1.5 prose-p:leading-relaxed prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-stone-100 prose-hr:border-stone-700/50 prose-hr:my-3 first:prose-h2:mt-0 first:prose-h3:mt-0 text-sm">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                )}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-[#2a2827]">
                    {msg.toolCalls.map((tc, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-0.5 text-[10px] bg-purple-500/10 text-purple-400 rounded px-1.5 py-0.5"
                      >
                        <Wrench className="h-2.5 w-2.5" />
                        {tc.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#C07A4A]/10">
                <Bot className="h-3 w-3 text-[#C07A4A]" />
              </div>
              <div className="rounded-lg bg-[#1a1918] border border-[#2a2827] px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Quick actions when no messages */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {quickActions.map((action) => (
            <button
              key={action}
              onClick={() => {
                if (action.endsWith(' ')) {
                  setInput(action)
                  inputRef.current?.focus()
                } else {
                  handleSend(action)
                }
              }}
              className="text-xs rounded-lg bg-[#1a1918] border border-[#2a2827] px-2.5 py-1.5 text-stone-400 hover:text-white hover:border-[#C07A4A]/30 transition-colors"
            >
              {action.endsWith(' ') ? `${action}...` : action}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Spør meg om noe, eller gi en kommando..."
            rows={1}
            className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2.5 pr-10 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50 resize-none"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="absolute right-1.5 bottom-1.5 rounded-md bg-[#C07A4A] p-1.5 text-white hover:bg-[#d4a574] disabled:opacity-30 disabled:hover:bg-[#C07A4A] transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  )
}
