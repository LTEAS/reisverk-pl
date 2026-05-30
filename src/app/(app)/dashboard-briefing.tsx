'use client'

import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'

function stripBriefingTitle(text: string): string {
  // Remove AI-generated title lines like "DAGLIG BRIEFING — FREDAG 29. MAI 2026"
  return text.replace(/^.*DAGLIG BRIEFING.*$/gim, '').replace(/^\s*\n/, '')
}

function formatBriefingHtml(markdown: string): string {
  let html = stripBriefingTitle(markdown)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-stone-100 font-semibold">$1</strong>')
    .replace(/^---$/gm, '{{HR}}')
    .replace(/^[•·]\s*(.+)$/gm, '{{LI}}$1{{/LI}}')
    .replace(/^- (.+)$/gm, '{{LI}}$1{{/LI}}')

  html = html.replace(/((?:{{LI}}.*?{{\/LI}}\n?)+)/g, (match) => {
    const items = match
      .split('\n')
      .filter((l) => l.includes('{{LI}}'))
      .map((l) => l.replace(/{{LI}}(.*){{\/LI}}/, '<li>$1</li>'))
      .join('')
    return `<ul class="list-disc ml-5 my-1">${items}</ul>`
  })

  html = html
    .replace(/{{HR}}/g, '<hr class="border-stone-700/50 my-3" />')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>')

  return `<p>${html}</p>`
}

export function BriefingSection({ summary }: { summary: string | null }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <section className="rounded-xl bg-[#1a1918] border border-[#2a2827]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 hover:bg-[#2a2827] transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#C07A4A]" />
          <h2 className="text-base font-semibold text-white">
            Dagens briefing
          </h2>
        </div>
        {summary && (
          expanded
            ? <ChevronUp className="h-4 w-4 text-stone-500" />
            : <ChevronDown className="h-4 w-4 text-stone-500" />
        )}
      </button>

      {summary ? (
        expanded && (
          <div
            className="text-sm text-stone-300 leading-relaxed px-5 pb-5"
            dangerouslySetInnerHTML={{ __html: formatBriefingHtml(summary) }}
          />
        )
      ) : (
        <div className="flex flex-col items-center py-6 text-center">
          <Sparkles className="h-8 w-8 text-stone-600 mb-2" />
          <p className="text-sm text-stone-500">
            Ingen briefing generert enn&aring;
          </p>
          <p className="text-xs text-stone-600 mt-1">
            Trykk oppdater for &aring; generere
          </p>
        </div>
      )}
    </section>
  )
}
