'use client'

import { RefreshCw } from 'lucide-react'
import { useSyncContext } from './sync-context'

export function RefreshButton() {
  const { loading, elapsed, status, startSync } = useSyncContext()

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => startSync()}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-[#C07A4A]/10 px-4 py-2 text-sm font-medium text-[#C07A4A] transition-colors hover:bg-[#C07A4A]/20 disabled:opacity-50"
      >
        <RefreshCw
          className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
        />
        {loading ? 'Synkroniserer...' : 'Synkroniser'}
      </button>
      {loading && (
        <div className="text-right">
          <span className="text-xs text-stone-500">
            Startet for {elapsed} siden
          </span>
          <p className="text-[10px] text-stone-600">
            Dette kan ta 2-5 minutter
          </p>
        </div>
      )}
      {!loading && status && (
        <span className="text-xs text-stone-400">{status}</span>
      )}
    </div>
  )
}
