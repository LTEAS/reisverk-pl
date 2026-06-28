'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Cloud,
  CloudOff,
  Check,
  Clock,
  Globe,
  Bot,
  RefreshCw,
  Shield,
  RotateCcw,
  CalendarPlus,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingsData {
  briefingTime: string
  aiLanguage: string
  autoCreateTasks: boolean
  requireTaskConfirmation: boolean
  syncEnabled: boolean
  syncIntervalMin: number
  meetingCreationEnabled: boolean
}

type MsAccountData = {
  accountEmail: string | null
  accountName: string | null
  connectedAt: Date | null
  expiresAt: Date | null
} | null

// ---------------------------------------------------------------------------
// Server action for settings update
// ---------------------------------------------------------------------------

async function saveSettings(userId: string, data: Partial<SettingsData>) {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.ok
}

// ---------------------------------------------------------------------------
// SettingsForm
// ---------------------------------------------------------------------------

export function SettingsForm({
  settings,
  msAccount,
  userId,
}: {
  settings: SettingsData
  msAccount: MsAccountData
  userId: string
}) {
  const router = useRouter()
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyResult, setReclassifyResult] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const ok = await saveSettings(userId, form)
    setSaving(false)
    if (ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    }
  }

  function updateField<K extends keyof SettingsData>(
    key: K,
    value: SettingsData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/cron/sync-email?userId=${userId}`)
      const data = await res.json()
      const r = data.results?.[userId]
      if (r?.error) {
        setSyncResult(`Feil: ${r.error}`)
      } else if (r) {
        setSyncResult(
          `Synkronisert ${r.synced} e-poster (${r.created} nye, ${r.updated} oppdatert)`
        )
      }
      router.refresh()
    } catch {
      setSyncResult('Synkronisering feilet')
    }
    setSyncing(false)
    setTimeout(() => setSyncResult(null), 5000)
  }

  async function handleReclassify() {
    setReclassifying(true)
    setReclassifyResult(null)
    try {
      const res = await fetch('/api/briefing/refresh?reset=true', { method: 'POST' })
      const data = await res.json()
      console.log('Reclassify response:', JSON.stringify(data, null, 2))
      if (data.ok) {
        const parts: string[] = []
        if (data.suggestionsDeleted) parts.push(`${data.suggestionsDeleted} forslag slettet`)
        if (data.reclassifyReset) parts.push(`${data.reclassifyReset} e-poster resatt`)
        if (data.classification?.suggestionsCreated) parts.push(`${data.classification.suggestionsCreated} nye forslag`)
        setReclassifyResult(parts.join(', ') || 'Ferdig')
      } else {
        setReclassifyResult(`Feil: ${data.error}`)
      }
      router.refresh()
    } catch {
      setReclassifyResult('Reklassifisering feilet')
    }
    setReclassifying(false)
    setTimeout(() => setReclassifyResult(null), 10000)
  }

  const isConnected = !!msAccount?.connectedAt
  const tokenExpired = msAccount?.expiresAt
    ? new Date(msAccount.expiresAt) < new Date()
    : false

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Microsoft 365 connection */}
      <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cloud className="h-4 w-4 text-[#C07A4A]" />
          <h2 className="text-base font-semibold text-white">
            Microsoft 365-tilkobling
          </h2>
        </div>

        {isConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-green-500/5 border border-green-500/20 px-4 py-3">
              <Check className="h-5 w-5 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-400">Tilkoblet</p>
                <p className="text-xs text-stone-400 truncate">
                  {msAccount!.accountName || msAccount!.accountEmail}
                </p>
              </div>
              {tokenExpired && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 shrink-0">
                  Token utlopt
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`}
                />
                {syncing ? 'Synkroniserer...' : 'Synk e-post na'}
              </button>
              <a
                href="/api/auth/microsoft/connect"
                className="rounded-lg bg-[#C07A4A]/10 px-3 py-2 text-sm text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors"
              >
                Koble til pa nytt
              </a>
              <a
                href="/api/auth/microsoft/disconnect"
                className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Koble fra
              </a>
            </div>
            {syncResult && (
              <p className="text-xs text-stone-400 mt-2">{syncResult}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-stone-800/50 border border-[#2a2827] px-4 py-3">
              <CloudOff className="h-5 w-5 text-stone-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-stone-300">
                  Ikke tilkoblet
                </p>
                <p className="text-xs text-stone-500">
                  Koble til Microsoft 365 for e-post og kalendersynkronisering
                </p>
              </div>
            </div>
            <a
              href="/api/auth/microsoft/connect"
              className="inline-flex items-center gap-2 rounded-lg bg-[#C07A4A] px-4 py-2 text-sm font-medium text-white hover:bg-[#d4a574] transition-colors"
            >
              <Cloud className="h-4 w-4" />
              Koble til Microsoft 365
            </a>
          </div>
        )}
      </section>

      {/* Briefing settings */}
      <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-purple-400" />
          <h2 className="text-base font-semibold text-white">
            Briefing-innstillinger
          </h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-200">Briefing-tidspunkt</p>
              <p className="text-xs text-stone-500">
                Nar daglig briefing skal genereres
              </p>
            </div>
            <input
              type="time"
              value={form.briefingTime}
              onChange={(e) => updateField('briefingTime', e.target.value)}
              className="rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#C07A4A]/50"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-200">AI-sprak</p>
              <p className="text-xs text-stone-500">
                Spraket AI-en bruker i svar og briefinger
              </p>
            </div>
            <select
              value={form.aiLanguage}
              onChange={(e) => updateField('aiLanguage', e.target.value)}
              className="rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#C07A4A]/50"
            >
              <option value="nb">Norsk (bokmal)</option>
              <option value="nn">Norsk (nynorsk)</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </section>

      {/* AI settings */}
      <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">
            AI-innstillinger
          </h2>
        </div>

        <div className="space-y-4">
          <ToggleSetting
            label="Opprett oppgaver automatisk"
            description="La AI-en opprette oppgaver fra e-poster uten godkjenning"
            checked={form.autoCreateTasks}
            onChange={(v) => updateField('autoCreateTasks', v)}
          />
          <ToggleSetting
            label="Krev bekreftelse for oppgaver"
            description="AI-forslag ma godkjennes for de blir til oppgaver"
            checked={form.requireTaskConfirmation}
            onChange={(v) => updateField('requireTaskConfirmation', v)}
          />
        </div>
      </section>

      {/* Calendar / meeting creation */}
      <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarPlus className="h-4 w-4 text-sky-400" />
          <h2 className="text-base font-semibold text-white">Kalender</h2>
        </div>

        <div className="space-y-4">
          <ToggleSetting
            label="La AI opprette møter"
            description="Tillat at assistenten oppretter møter i Outlook-kalenderen din med påminnelse. Assistenten bekrefter alltid tidspunkt og deltakere før et møte opprettes."
            checked={form.meetingCreationEnabled}
            onChange={(v) => updateField('meetingCreationEnabled', v)}
          />

          {form.meetingCreationEnabled && (
            <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 px-4 py-3 space-y-2">
              <p className="text-xs text-sky-300">
                Når dette er på må du (1) lagre innstillingene og (2) koble til
                Microsoft på nytt én gang for å gi kalenderskriving. Etterpå
                opprettes møter uten ny innlogging.
              </p>
              <a
                href="/api/auth/microsoft/connect?write=1"
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-300 hover:bg-sky-500/20 transition-colors"
              >
                <Cloud className="h-3.5 w-3.5" />
                Koble til Microsoft på nytt (med skrivetilgang)
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Advanced / maintenance */}
      <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
        <div className="flex items-center gap-2 mb-4">
          <RotateCcw className="h-4 w-4 text-amber-400" />
          <h2 className="text-base font-semibold text-white">
            Vedlikehold
          </h2>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm text-stone-200">Reklassifiser e-poster</p>
            <p className="text-xs text-stone-500">
              Sletter ventende forslag og kjorer AI-klassifisering pa nytt for alle e-poster siste 7 dager. Bruk etter endring av prosjekter eller sokeord.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReclassify}
              disabled={reclassifying}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${reclassifying ? 'animate-spin' : ''}`} />
              {reclassifying ? 'Reklassifiserer...' : 'Reklassifiser'}
            </button>
            {reclassifyResult && (
              <span className="text-xs text-stone-400">{reclassifyResult}</span>
            )}
          </div>
        </div>
      </section>

      {/* Sync settings */}
      <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="h-4 w-4 text-amber-400" />
          <h2 className="text-base font-semibold text-white">
            Synk-innstillinger
          </h2>
        </div>

        <div className="space-y-4">
          <ToggleSetting
            label="Automatisk synkronisering"
            description="Kjører daglig synk + briefing automatisk hver morgen"
            checked={form.syncEnabled}
            onChange={(v) => updateField('syncEnabled', v)}
          />
        </div>
      </section>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[#C07A4A] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#d4a574] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Lagrer...' : 'Lagre innstillinger'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-400">
            <Check className="h-4 w-4" />
            Lagret
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ToggleSetting
// ---------------------------------------------------------------------------

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-stone-200">{label}</p>
        <p className="text-xs text-stone-500">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-[#C07A4A]' : 'bg-stone-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
