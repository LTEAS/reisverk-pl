'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface SyncState {
  loading: boolean
  startTime: number | null
  status: string | null
  elapsed: string
}

interface SyncContextValue extends SyncState {
  startSync: (reset?: boolean) => void
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function useSyncContext() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSyncContext must be used within SyncProvider')
  return ctx
}

function formatElapsed(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000)
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs.toString().padStart(2, '0')}s`
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()
  const abortRef = useRef<AbortController | null>(null)

  // Tick elapsed time every second while loading
  useEffect(() => {
    if (!loading || !startTime) return
    const interval = setInterval(() => {
      setElapsed(formatElapsed(startTime))
    }, 1000)
    return () => clearInterval(interval)
  }, [loading, startTime])

  const startSync = useCallback(async (reset = false) => {
    if (loading) return

    setLoading(true)
    setStatus(null)
    const now = Date.now()
    setStartTime(now)
    setElapsed('0s')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const url = reset
        ? '/api/briefing/refresh?reset=true'
        : '/api/briefing/refresh'
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
      })
      const data = await res.json()

      console.log('Refresh response:', JSON.stringify(data, null, 2))

      if (data.ok) {
        const parts: string[] = []
        if (data.sync?.synced) parts.push(`${data.sync.synced} e-poster`)
        if (data.classification?.processed) parts.push(`${data.classification.processed} klassifisert`)
        if (data.classification?.suggestionsCreated) parts.push(`${data.classification.suggestionsCreated} forslag`)
        if (data.autoClose?.tasksUpdated) parts.push(`${data.autoClose.tasksUpdated} auto-oppdatert`)
        if (data.classification?.error) parts.push(`FEIL: ${data.classification.error}`)
        if (data.sync?.error) parts.push(`Synk-feil: ${data.sync.error}`)
        const info = parts.length > 0 ? parts.join(', ') : 'Ingen nye endringer'
        setStatus(`Ferdig (${formatElapsed(now)}) — ${info}`)
      } else {
        setStatus(data.error || 'Synkronisering feilet')
      }

      router.refresh()
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setStatus('Nettverksfeil')
      }
    } finally {
      setLoading(false)
      setStartTime(null)
      abortRef.current = null
      setTimeout(() => setStatus(null), 20000)
    }
  }, [loading, router])

  return (
    <SyncContext.Provider value={{ loading, startTime, status, elapsed, startSync }}>
      {children}
    </SyncContext.Provider>
  )
}
