'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { List, Columns3 } from 'lucide-react'

export function ViewToggle({ active }: { active: 'liste' | 'tavle' }) {
  const searchParams = useSearchParams()

  function hrefFor(view: 'liste' | 'tavle'): string {
    const params = new URLSearchParams(searchParams.toString())
    if (view === 'tavle') params.set('view', 'tavle')
    else params.delete('view')
    const qs = params.toString()
    return qs ? `/tasks?${qs}` : '/tasks'
  }

  return (
    <div className="flex items-center rounded-lg bg-[#1a1918] border border-[#2a2827] p-0.5">
      <Link
        href={hrefFor('liste')}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
          active === 'liste'
            ? 'bg-[#C07A4A]/15 text-[#C07A4A]'
            : 'text-stone-500 hover:text-stone-300'
        }`}
      >
        <List className="h-3.5 w-3.5" />
        Liste
      </Link>
      <Link
        href={hrefFor('tavle')}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
          active === 'tavle'
            ? 'bg-[#C07A4A]/15 text-[#C07A4A]'
            : 'text-stone-500 hover:text-stone-300'
        }`}
      >
        <Columns3 className="h-3.5 w-3.5" />
        Tavle
      </Link>
    </div>
  )
}
