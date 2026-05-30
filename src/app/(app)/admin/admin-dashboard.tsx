'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Shield,
  Users,
  FolderKanban,
  Mail,
  Bot,
  Zap,
  TrendingUp,
  CreditCard,
  Plus,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import { setUserRole, toggleUserActive, toggleFreeAccount, addUserCredit, resetOnboarding } from '@/lib/actions/admin'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stats {
  totalUsers: number
  totalProjects: number
  totalEmails: number
  totalAiCalls: number
  aiCallsThisMonth: number
  totalTokensThisMonth: number
  totalCostThisMonth: number
}

interface UserData {
  id: string
  displayName: string | null
  email: string | null
  createdAt: Date
  role: string
  msConnected: boolean
  msEmail: string | null
  projectCount: number
  emailCount: number
  chatMessages: number
  subscriptionStatus: string
  priceNok: number
  costThisMonth: number
  callsThisMonth: number
  tokensThisMonth: number
  creditLimitNok: number
  topUpCreditNok: number
  isFreeAccount: boolean
  onboardingCompleted: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return n.toString()
}

function formatKr(n: number): string {
  return n.toFixed(1) + ' kr'
}

function relativeDate(date: Date): string {
  return new Date(date).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function usagePct(cost: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min((cost / limit) * 100, 100)
}

const statusLabels: Record<string, string> = {
  active: 'Aktiv',
  trial: 'Prøveperiode',
  paused: 'Pauset',
  cancelled: 'Avsluttet',
  none: 'Ingen',
}

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400',
  trial: 'bg-blue-500/10 text-blue-400',
  paused: 'bg-amber-500/10 text-amber-400',
  cancelled: 'bg-red-500/10 text-red-400',
  none: 'bg-stone-800 text-stone-500',
}

// ---------------------------------------------------------------------------
// AdminDashboard
// ---------------------------------------------------------------------------

export function AdminDashboard({
  stats,
  users,
}: {
  stats: Stats
  users: UserData[]
}) {
  const [tab, setTab] = useState<'overview' | 'users' | 'billing'>('overview')

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <Shield className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Admin</h1>
          <p className="text-sm text-stone-400">
            Systemadministrasjon og brukeroversikt
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#2a2827] pb-px">
        {[
          { key: 'overview' as const, label: 'Oversikt', icon: TrendingUp },
          { key: 'users' as const, label: 'Brukere', icon: Users },
          { key: 'billing' as const, label: 'Forbruk & Faktura', icon: CreditCard },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-[#C07A4A] text-white'
                  : 'border-transparent text-stone-500 hover:text-stone-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && <OverviewTab stats={stats} users={users} />}
      {tab === 'users' && <UsersTab users={users} />}
      {tab === 'billing' && <BillingTab stats={stats} users={users} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// OverviewTab
// ---------------------------------------------------------------------------

function OverviewTab({ stats, users }: { stats: Stats; users: UserData[] }) {
  const totalRevenue = users.reduce((sum, u) => {
    if (u.subscriptionStatus === 'active') return sum + u.priceNok
    return sum
  }, 0)

  const totalCost = stats.totalCostThisMonth
  const margin = totalRevenue - totalCost

  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} color="text-blue-400" bg="bg-blue-500/10" label="Brukere" value={stats.totalUsers} />
        <StatCard icon={FolderKanban} color="text-green-400" bg="bg-green-500/10" label="Prosjekter" value={stats.totalProjects} />
        <StatCard icon={Mail} color="text-purple-400" bg="bg-purple-500/10" label="E-poster" value={stats.totalEmails} />
        <StatCard icon={Bot} color="text-amber-400" bg="bg-amber-500/10" label="AI-kall denne mnd" value={stats.aiCallsThisMonth} />
      </div>

      {/* Revenue vs cost */}
      <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Økonomi denne måneden</h3>
        <div className="grid sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-stone-500">Inntekt (abonnement)</p>
            <p className="text-xl font-bold text-green-400">{formatKr(totalRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">AI-kostnad</p>
            <p className="text-xl font-bold text-rose-400">{formatKr(totalCost)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Margin</p>
            <p className={`text-xl font-bold ${margin >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
              {formatKr(margin)}
            </p>
          </div>
        </div>
      </div>

      {/* Users at a glance */}
      <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Brukere — forbruk</h3>
        <div className="space-y-3">
          {users.map((u) => {
            const pct = usagePct(u.costThisMonth, u.creditLimitNok)
            const nearLimit = pct >= 80

            return (
              <div key={u.id} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-[#C07A4A]/15 flex items-center justify-center text-[10px] font-medium text-[#C07A4A] shrink-0">
                  {(u.displayName || u.email || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-white truncate">{u.displayName || u.email}</p>
                    <span className="text-[11px] text-stone-400 shrink-0">
                      {formatKr(u.costThisMonth)} / {formatKr(u.creditLimitNok)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#2a2827] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        nearLimit ? 'bg-rose-400' : 'bg-[#C07A4A]/60'
                      }`}
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, color, bg, label, value }: {
  icon: any; color: string; bg: string; label: string; value: number
}) {
  return (
    <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-4">
      <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center mb-2`}>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-white">{formatNumber(value)}</p>
      <p className="text-[11px] text-stone-500 mt-0.5">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UsersTab
// ---------------------------------------------------------------------------

function UsersTab({ users }: { users: UserData[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [creditAmount, setCreditAmount] = useState<Record<string, string>>({})

  function handleRoleChange(userId: string, role: 'admin' | 'user') {
    startTransition(async () => {
      await setUserRole(userId, role)
      router.refresh()
    })
  }

  function handleToggleActive(userId: string, active: boolean) {
    startTransition(async () => {
      await toggleUserActive(userId, active)
      router.refresh()
    })
  }

  function handleToggleFreeAccount(userId: string, isFree: boolean) {
    startTransition(async () => {
      await toggleFreeAccount(userId, isFree)
      router.refresh()
    })
  }

  function handleResetOnboarding(userId: string) {
    startTransition(async () => {
      await resetOnboarding(userId)
      router.refresh()
    })
  }

  function handleAddCredit(userId: string) {
    const amount = parseInt(creditAmount[userId] || '50')
    if (isNaN(amount) || amount <= 0) return
    startTransition(async () => {
      await addUserCredit(userId, amount)
      setCreditAmount((prev) => ({ ...prev, [userId]: '' }))
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-400">{users.length} registrerte brukere</p>

      {users.map((u) => {
        const expanded = expandedUser === u.id
        const pct = usagePct(u.costThisMonth, u.creditLimitNok)

        return (
          <div
            key={u.id}
            className="rounded-xl bg-[#1a1918] border border-[#2a2827] overflow-hidden"
          >
            {/* User row */}
            <button
              onClick={() => setExpandedUser(expanded ? null : u.id)}
              className="w-full flex items-center gap-4 p-4 hover:bg-[#2a2827]/50 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-full bg-[#C07A4A]/15 flex items-center justify-center text-[11px] font-medium text-[#C07A4A] shrink-0">
                {(u.displayName || u.email || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {u.displayName || u.email || 'Uten navn'}
                </p>
                <p className="text-[11px] text-stone-500">{u.email}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Free account badge */}
                {u.isFreeAccount && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-green-500/10 text-green-400">
                    Gratis
                  </span>
                )}

                {/* Subscription badge */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[u.subscriptionStatus] || statusColors.none}`}>
                  {statusLabels[u.subscriptionStatus] || u.subscriptionStatus}
                </span>

                {/* Role badge */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  u.role === 'admin' ? 'bg-purple-500/10 text-purple-400' : 'bg-stone-800 text-stone-400'
                }`}>
                  {u.role === 'admin' ? 'Admin' : 'Bruker'}
                </span>

                {/* MS status */}
                <span
                  className={`w-2 h-2 rounded-full ${u.msConnected ? 'bg-green-400' : 'bg-stone-600'}`}
                  title={u.msConnected ? `Microsoft: ${u.msEmail}` : 'Microsoft ikke koblet'}
                />

                {expanded ? (
                  <ChevronUp className="h-4 w-4 text-stone-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-stone-500" />
                )}
              </div>
            </button>

            {/* Expanded panel */}
            {expanded && (
              <div className="border-t border-[#2a2827] p-4 space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] text-stone-500 uppercase tracking-wider">Prosjekter</p>
                    <p className="text-sm font-medium text-white">{u.projectCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-500 uppercase tracking-wider">E-poster</p>
                    <p className="text-sm font-medium text-white">{formatNumber(u.emailCount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-500 uppercase tracking-wider">Chat</p>
                    <p className="text-sm font-medium text-white">{u.chatMessages}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-500 uppercase tracking-wider">Registrert</p>
                    <p className="text-sm font-medium text-white">{relativeDate(u.createdAt)}</p>
                  </div>
                </div>

                {/* Usage bar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-stone-400">AI-forbruk denne mnd</p>
                    <p className="text-xs text-stone-400">
                      {formatKr(u.costThisMonth)} / {formatKr(u.creditLimitNok)}
                      {u.topUpCreditNok > 0 && (
                        <span className="text-[#C07A4A] ml-1">(+{formatKr(u.topUpCreditNok)} top-up)</span>
                      )}
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-[#2a2827] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-rose-400' : 'bg-[#C07A4A]/60'}`}
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-stone-500 mt-1">
                    {u.callsThisMonth} AI-kall &middot; {formatNumber(u.tokensThisMonth)} tokens
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2 border-t border-[#2a2827] flex-wrap">
                  {/* Role toggle */}
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-stone-500 mr-1">Rolle:</span>
                    {(['user', 'admin'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => handleRoleChange(u.id, r)}
                        disabled={isPending}
                        className={`text-[11px] px-2.5 py-1 rounded-full font-medium border transition-colors disabled:opacity-50 ${
                          u.role === r
                            ? r === 'admin'
                              ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
                              : 'border-stone-600 bg-stone-800 text-stone-300'
                            : 'border-[#2a2827] text-stone-500 hover:text-stone-300 hover:border-stone-600'
                        }`}
                      >
                        {r === 'admin' ? 'Admin' : 'Bruker'}
                      </button>
                    ))}
                  </div>

                  {/* Subscription toggle */}
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-stone-500 mr-1">Status:</span>
                    <button
                      onClick={() => handleToggleActive(u.id, true)}
                      disabled={isPending}
                      className={`text-[11px] px-2.5 py-1 rounded-full font-medium border transition-colors disabled:opacity-50 ${
                        u.subscriptionStatus === 'active'
                          ? 'border-green-500/30 bg-green-500/10 text-green-400'
                          : 'border-[#2a2827] text-stone-500 hover:text-stone-300 hover:border-stone-600'
                      }`}
                    >
                      Aktiv
                    </button>
                    <button
                      onClick={() => handleToggleActive(u.id, false)}
                      disabled={isPending}
                      className={`text-[11px] px-2.5 py-1 rounded-full font-medium border transition-colors disabled:opacity-50 ${
                        u.subscriptionStatus === 'paused'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                          : 'border-[#2a2827] text-stone-500 hover:text-stone-300 hover:border-stone-600'
                      }`}
                    >
                      Pauset
                    </button>
                  </div>

                  {/* Free account toggle */}
                  <button
                    onClick={() => handleToggleFreeAccount(u.id, !u.isFreeAccount)}
                    disabled={isPending}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium border transition-colors disabled:opacity-50 ${
                      u.isFreeAccount
                        ? 'border-green-500/30 bg-green-500/10 text-green-400'
                        : 'border-[#2a2827] text-stone-500 hover:text-stone-300 hover:border-stone-600'
                    }`}
                  >
                    {u.isFreeAccount ? 'Gratis-konto (aktiv)' : 'Gjør gratis'}
                  </button>

                  {/* Add credit */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-stone-500">Gi kreditt:</span>
                    <input
                      type="number"
                      value={creditAmount[u.id] || ''}
                      onChange={(e) =>
                        setCreditAmount((prev) => ({ ...prev, [u.id]: e.target.value }))
                      }
                      placeholder="50"
                      className="w-16 rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-2 py-1 text-[11px] text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50"
                    />
                    <button
                      onClick={() => handleAddCredit(u.id)}
                      disabled={isPending}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-[#C07A4A]/10 text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors disabled:opacity-50 font-medium"
                    >
                      <Plus className="h-3 w-3 inline -mt-0.5 mr-0.5" />
                      Legg til
                    </button>
                  </div>

                  {/* Onboarding reset */}
                  <button
                    onClick={() => handleResetOnboarding(u.id)}
                    disabled={isPending || !u.onboardingCompleted}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-[#2a2827] text-stone-500 hover:text-stone-300 hover:border-stone-600 transition-colors disabled:opacity-30 font-medium flex items-center gap-1"
                    title={u.onboardingCompleted ? 'Vis onboarding igjen for denne brukeren' : 'Onboarding er allerede aktiv'}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Vis onboarding
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BillingTab
// ---------------------------------------------------------------------------

function BillingTab({ stats, users }: { stats: Stats; users: UserData[] }) {
  const activeUsers = users.filter((u) => u.subscriptionStatus === 'active')
  const totalRevenue = activeUsers.reduce((sum, u) => sum + u.priceNok, 0)
  const totalCost = stats.totalCostThisMonth
  const sortedByUsage = [...users].sort((a, b) => b.costThisMonth - a.costThisMonth)
  const usersNearLimit = users.filter((u) => usagePct(u.costThisMonth, u.creditLimitNok) >= 80)

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-4">
          <p className="text-xs text-stone-500">Mnd. inntekt</p>
          <p className="text-xl font-bold text-green-400 mt-1">{formatKr(totalRevenue)}</p>
          <p className="text-[10px] text-stone-500 mt-0.5">{activeUsers.length} aktive × 149 kr</p>
        </div>
        <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-4">
          <p className="text-xs text-stone-500">AI-kostnad denne mnd</p>
          <p className="text-xl font-bold text-rose-400 mt-1">{formatKr(totalCost)}</p>
          <p className="text-[10px] text-stone-500 mt-0.5">{formatNumber(stats.totalTokensThisMonth)} tokens</p>
        </div>
        <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-4">
          <p className="text-xs text-stone-500">Margin</p>
          <p className={`text-xl font-bold mt-1 ${totalRevenue - totalCost >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
            {formatKr(totalRevenue - totalCost)}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">
            {totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100) : 0}% margin
          </p>
        </div>
        <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-4">
          <p className="text-xs text-stone-500">Nær kvotegrense</p>
          <p className={`text-xl font-bold mt-1 ${usersNearLimit.length > 0 ? 'text-amber-400' : 'text-white'}`}>
            {usersNearLimit.length}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">brukere over 80%</p>
        </div>
      </div>

      {/* Warning for users near limit */}
      {usersNearLimit.length > 0 && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">Brukere nær kvotegrense</p>
            <p className="text-xs text-stone-400 mt-1">
              {usersNearLimit.map((u) => u.displayName || u.email).join(', ')} har brukt over 80% av sin AI-kvote.
            </p>
          </div>
        </div>
      )}

      {/* Per-user usage table */}
      <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Forbruk per bruker</h3>
        <div className="space-y-4">
          {sortedByUsage.map((u) => {
            const pct = usagePct(u.costThisMonth, u.creditLimitNok)
            const remaining = Math.max(u.creditLimitNok - u.costThisMonth, 0)

            return (
              <div key={u.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white">{u.displayName || u.email}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColors[u.subscriptionStatus] || statusColors.none}`}>
                      {statusLabels[u.subscriptionStatus] || u.subscriptionStatus}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="text-stone-400">{u.callsThisMonth} kall</span>
                    <span className="text-stone-400">{formatKr(u.costThisMont