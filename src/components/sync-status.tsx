'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

const AUTO_SYNC_THRESHOLD_MIN = 30

/**
 * Shows when data was last synced, and triggers a lightweight background
 * email sync if it has been more than 30 minutes (debounced per session).
 */
export function SyncStatus() {
  const router = useRouter()
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch('/api/sync/status')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setLastSyncAt(data.lastSyncAt)

        const ageMin = data.lastSyncAt
          ? (Date.now() - new Date(data.lastSyncAt).getTime()) / 60000
          : Infinity
        const lastAuto = Number(sessionStorage.getItem('autoSyncAt') || 0)
        const autoAgeMin = (Date.now() - lastAuto) / 60000

        if (ageMin > AUTO_SYNC_THRESHOLD_MIN && autoAgeMin > AUTO_SYNC_THRESHOLD_MIN) {
          sessionStorage.setItem('autoSyncAt', String(Date.now()))
          setSyncing(true)
          try {
            await fetch('/api/cron/sync-email')
            const after = await fetch('/api/sync/status')
            if (after.ok && !cancelled) {
              const d = await after.json()
              setLastSyncAt(d.lastSyncAt)
            }
            router.refresh()
          } finally {
            if (!cancelled) setSyncing(false)
          }
        }
      } catch {
        // Best effort — ignore
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [router])

  const label = syncing
    ? 'Synkroniserer…'
    : lastSyncAt
      ? `Sist synket ${new Date(lastSyncAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`
      : 'Ikke synkronisert ennå'

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-stone-600">
      <RefreshCw className={`h-2.5 w-2.5 ${syncing ? 'animate-spin text-[#C07A4A]' : ''}`} />
      {label}
    </div>
  )
}
