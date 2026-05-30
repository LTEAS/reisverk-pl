'use client'

import { useState } from 'react'
import { Zap, CreditCard, TrendingUp, ShoppingCart, Gift, Loader2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageCardProps {
  subscription: {
    status: string
    priceNok: number
    trialEndsAt: Date | null
  }
  usage: {
    costThisMonth: number
    callsThisMonth: number
    creditLimitNok: number
    topUpCreditNok: number
  }
  topUps: Array<{
    id: string
    amountNok: number
    creditNok: number
    createdAt: Date
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatKr(n: number): string {
  return n.toFixed(1) + ' kr'
}

const statusLabels: Record<string, string> = {
  active: 'Aktivt abonnement',
  trial: 'Prøveperiode',
  paused: 'Pauset',
  cancelled: 'Avsluttet',
  none: 'Ikke aktivert',
}

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  trial: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
  none: 'bg-stone-800 text-stone-400 border-stone-700',
}

// ---------------------------------------------------------------------------
// UsageCard
// ---------------------------------------------------------------------------

export function UsageCard({ subscription, usage, topUps }: UsageCardProps) {
  const [buyingCredit, setBuyingCredit] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remaining = Math.max(usage.creditLimitNok - usage.costThisMonth, 0)
  const pct = usage.creditLimitNok > 0
    ? Math.min((usage.costThisMonth / usage.creditLimitNok) * 100, 100)
    : 0
  const nearLimit = pct >= 80

  const topUpOptions = [
    { creditNok: 50, amountNok: 49, label: '50 kr kreditt' },
    { creditNok: 100, amountNok: 89, label: '100 kr kreditt' },
    { creditNok: 200, amountNok: 169, label: '200 kr kreditt' },
  ]

  async function handleTopUp(creditNok: number) {
    setBuyingCredit(creditNok)
    setError(null)
    try {
      const res = await fetch('/api/vipps/create-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditNok }),
      })
      const data = await res.json()
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
      } else {
        setError(data.error || 'Noe gikk galt')
        setBuyingCredit(null)
      }
    } catch {
      setError('Nettverksfeil')
      setBuyingCredit(null)
    }
  }

  return (
    <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-[#2a2827]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#C07A4A]/10 flex items-center justify-center">
            <Zap className="h-4.5 w-4.5 text-[#C07A4A]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Forbruk & Abonnement</h2>
            <p className="text-[11px] text-stone-500">
              {new Date().toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        <span
          className={`text-[11px] px-2.5 py-1 rounded-full font-medium border ${
            statusColors[subscription.status] || statusColors.none
          }`}
        >
          {statusLabels[subscription.status] || subscription.status}
          {subscription.status === 'active' && ` — ${subscription.priceNok} kr/mnd`}
          {subscription.status === 'trial' && subscription.trialEndsAt && (
            <> — utløper {new Date(subscription.trialEndsAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}</>
          )}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Usage meter */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-stone-300">AI-forbruk</p>
            <p className="text-sm font-medium text-white">
              {formatKr(usage.costThisMonth)}
              <span className="text-stone-500"> / {formatKr(usage.creditLimitNok)}</span>
            </p>
          </div>
          <div className="h-3 rounded-full bg-[#2a2827] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                nearLimit ? 'bg-rose-400' : 'bg-[#C07A4A]'
              }`}
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] text-stone-500">
              {usage.callsThisMonth} AI-kall denne måneden
            </p>
            <p className={`text-[11px] font-medium ${remaining < 20 ? 'text-rose-400' : 'text-stone-400'}`}>
              {formatKr(remaining)} gjenstår
            </p>
          </div>
          {usage.topUpCreditNok > 0 && (
            <p className="text-[10px] text-[#C07A4A] mt-1 flex items-center gap-1">
              <Gift className="h-3 w-3" />
              Inkluderer {formatKr(usage.topUpCreditNok)} fra top-up
            </p>
          )}
        </div>

        {/* Top-up section */}
        <div className="border-t border-[#2a2827] pt-5">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="h-4 w-4 text-[#C07A4A]" />
            <h3 className="text-sm font-semibold text-white">Kjøp mer AI-kreditt</h3>
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            {topUpOptions.map((opt) => (
              <button
                key={opt.creditNok}
                onClick={() => handleTopUp(opt.creditNok)}
                disabled={buyingCredit !== null}
                className="rounded-lg border border-[#2a2827] hover:border-[#C07A4A]/30 p-3 text-left transition-colors group disabled:opacity-50"
              >
                {buyingCredit === opt.creditNok ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#C07A4A]" />
                    <span className="text-sm text-stone-400">Åpner Vipps...</span>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-white group-hover:text-[#C07A4A] transition-colors">
                      +{opt.creditNok} kr kreditt
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">{opt.amountNok} kr</p>
                  </>
                )}
              </button>
            ))}
          </div>
          {error && (
            <p className="text-[11px] text-rose-400 mt-2">{error}</p>
          )}
          <p className="text-[10px] text-stone-600 mt-2">
            Betaling via Vipps. Kreditten gjelder inneværende måned.
          </p>
        </div>

        {/* Recent top-ups */}
        {topUps.length > 0 && (
          <div className="border-t border-[#2a2827] pt-4">
            <h4 className="text-xs font-medium text-stone-400 mb-2">Tidligere kjøp</h4>
            <div className="space-y-1.5">
              {topUps.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-400">
                    +{t.creditNok} kr kreditt
                  </span>
                  <span className="text-stone-500">
                    {t.amountNok > 0 ? `${t.amountNok} kr` : 'Gratis'} &middot;{' '}
                    {new Date(t.createdAt).toLocaleDateString('nb-NO', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
