import { Suspense } from 'react'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  CheckSquare,
  Calendar,
  AlertTriangle,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { RefreshButton } from './dashboard-refresh'
import { DashboardSuggestions } from './dashboard-suggestions'
import { BriefingSection } from './dashboard-briefing'
import { DashboardChat } from './dashboard-chat'
import { Onboarding } from './onboarding'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'God natt'
  if (hour < 10) return 'God morgen'
  if (hour < 14) return 'God formiddag'
  if (hour < 18) return 'God ettermiddag'
  return 'God kveld'
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
  })
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const user = await requireUser()
  const userId = user.id
  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Bruker'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Parallel data fetching
  const [
    openTaskCount,
    overdueTasks,
    todayMeetings,
    _unansweredEmails,
    latestBriefing,
    openPriorities,
    pendingSuggestions,
    activeReminders,
    userProjects,
    msAccount,
    projectCount,
    profileData,
  ] = await Promise.all([
    // Open tasks count
    prisma.task.count({
      where: {
        project: { members: { some: { userId } } },
        status: { in: ['apen', 'sendt', 'mottatt'] },
      },
    }),

    // Overdue tasks
    prisma.task.count({
      where: {
        project: { members: { some: { userId } } },
        status: { notIn: ['utfort', 'lukket'] },
        dueDate: { lt: new Date() },
      },
    }),

    // Today's meetings
    prisma.meeting.findMany({
      where: {
        userId,
        startsAt: { gte: today, lt: tomorrow },
        status: { not: 'cancelled' },
      },
      orderBy: { startsAt: 'asc' },
      include: { project: { select: { name: true, shortCode: true } } },
    }),

    // Unanswered emails
    prisma.email.count({
      where: {
        userId,
        replyStatus: { in: ['needs_reply', 'awaiting_reply'] },
      },
    }),

    // Latest briefing
    prisma.dailyBriefing.findFirst({
      where: { userId },
      orderBy: { briefingDate: 'desc' },
    }),

    // Open priorities
    prisma.briefingPriority.findMany({
      where: {
        userId,
        status: 'open',
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        task: { select: { id: true, title: true, status: true } },
      },
    }),

    // Pending AI suggestions
    prisma.aiSuggestion.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        suggestionType: true,
        details: true,
        sourceEmailSubject: true,
        project: { select: { name: true, shortCode: true } },
      },
    }),

    // Active reminders
    prisma.reminder.findMany({
      where: {
        userId,
        completed: false,
      },
      orderBy: { remindAt: 'asc' },
      take: 8,
    }),

    // User's projects (for suggestion project picker)
    prisma.project.findMany({
      where: { members: { some: { userId } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shortCode: true },
    }),

    // Onboarding checks
    prisma.microsoftAccount.findUnique({
      where: { userId },
      select: { connectedAt: true },
    }),
    prisma.project.count({
      where: { members: { some: { userId } } },
    }),
    prisma.profile.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true },
    }),
  ])

  const greeting = getGreeting()

  // Onboarding state
  const onboardingState = {
    msConnected: !!msAccount?.connectedAt,
    hasProjects: projectCount > 0,
    hasBriefing: !!latestBriefing,
  }
  const showOnboarding = !profileData?.onboardingCompleted

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Onboarding for new users */}
      {showOnboarding && (
        <Onboarding
          displayName={displayName.split(' ')[0]}
          state={onboardingState}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting}, {displayName.split(' ')[0]}
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            {new Date().toLocaleDateString('nb-NO', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <RefreshButton />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Åpne oppgaver"
          value={openTaskCount}
          icon={<CheckSquare className="h-5 w-5" />}
          color="blue"
          href="/tasks"
        />
        <StatCard
          label="Dagens møter"
          value={todayMeetings.length}
          icon={<Calendar className="h-5 w-5" />}
          color="purple"
          href="/meetings"
        />
        <StatCard
          label="Forfalt"
          value={overdueTasks}
          icon={<AlertTriangle className="h-5 w-5" />}
          color="red"
          href="/tasks?filter=overdue"
        />
      </div>

      {/* Dagens briefing — full width, collapsible */}
      <BriefingSection summary={latestBriefing?.summary || null} />

      {/* AI suggestions requiring approval */}
      <DashboardSuggestions suggestions={pendingSuggestions} projects={userProjects} />

      {/* AI chat — compact inline */}
      <DashboardChat />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Prioriterte handlingspunkter */}
          <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
            <h2 className="text-base font-semibold text-white mb-4">
              Prioriterte handlingspunkter
            </h2>
            {openPriorities.length > 0 ? (
              <ul className="space-y-2">
                {openPriorities.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-[#2a2827] transition-colors"
                  >
                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#C07A4A]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-200">{p.itemText}</p>
                      {p.task && (
                        <p className="text-xs text-stone-500 mt-0.5">
                          Oppgave: {p.task.title}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500 text-center py-4">
                Ingen åpne handlingspunkter
              </p>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Dagens møter */}
          <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">
                Dagens møter
              </h2>
              <a
                href="/meetings"
                className="text-xs text-[#C07A4A] hover:text-[#d4a574] flex items-center gap-1"
              >
                Se alle <ArrowRight className="h-3 w-3" />
              </a>
            </div>
            {todayMeetings.length > 0 ? (
              <ul className="space-y-2">
                {todayMeetings.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[#2a2827] transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center rounded-lg bg-[#2a2827] px-2.5 py-1.5 min-w-[52px]">
                      <span className="text-xs font-medium text-white">
                        {formatTime(m.startsAt)}
                      </span>
                      <span className="text-[10px] text-stone-500">
                        {formatTime(m.endsAt)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-200 truncate">
                        {m.subject || 'Uten tittel'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {m.isOnline && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C07A4A]/10 text-[#C07A4A]">
                            Online
                          </span>
                        )}
                        {m.location && !m.isOnline && (
                          <span className="text-xs text-stone-500 truncate">
                            {m.location}
                          </span>
                        )}
                        {m.project && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                            {m.project.shortCode || m.project.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500 text-center py-4">
                Ingen møter i dag
              </p>
            )}
          </section>

          {/* Påminnelser */}
          <section className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">
                Påminnelser
              </h2>
            </div>
            {activeReminders.length > 0 ? (
              <ul className="space-y-2">
                {activeReminders.map((r) => {
                  const isPast = r.remindAt < new Date()
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[#2a2827] transition-colors"
                    >
                      <div className={`flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 min-w-[52px] ${isPast ? 'bg-red-500/10' : 'bg-[#2a2827]'}`}>
                        <span className={`text-xs font-medium ${isPast ? 'text-red-400' : 'text-white'}`}>
                          {formatTime(r.remindAt)}
                        </span>
                        <span className="text-[10px] text-stone-500">
                          {formatDate(r.remindAt)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-200 truncate">
                          {r.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {r.recurring && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C07A4A]/10 text-[#C07A4A]">
                              {{daily: 'Daglig', weekly: 'Ukentlig', monthly: 'Månedlig'}[r.recurring] || r.recurring}
                            </span>
                          )}
                          {r.description && (
                            <span className="text-[10px] text-stone-500 truncate">
                              {r.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center py-4 text-center">
                <Clock className="h-6 w-6 text-stone-600 mb-2" />
                <p className="text-sm text-stone-500">
                  Ingen påminnelser
                </p>
                <p className="text-xs text-stone-600 mt-1">
                  Si &quot;Minn meg på...&quot; i AI-chatten
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  color,
  href,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: 'blue' | 'purple' | 'amber' | 'red'
  href?: string
}) {
  const colorMap = {
    blue: {
      bg: 'bg-[#C07A4A]/10',
      text: 'text-[#C07A4A]',
      value: 'text-[#C07A4A]',
    },
    purple: {
      bg: 'bg-[#8B6040]/10',
      text: 'text-[#d4a574]',
      value: 'text-[#d4a574]',
    },
    amber: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      value: 'text-amber-400',
    },
    red: {
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      value: 'text-red-400',
    },
  }

  const c = colorMap[color]

  const inner = (
    <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-4 hover:bg-[#2a2827] transition-colors">
      <div className="flex items-center justify-between">
        <div className={`rounded-lg ${c.bg} p-2`}>
          <div className={c.text}>{icon}</div>
        </div>
        <span className={`text-2xl font-bold ${c.value}`}>{value}</span>
      </div>
      <p className="text-sm text-stone-400 mt-3">{label}</p>
    </div>
  )

  if (href) {
    return <a href={href}>{inner}</a>
  }

  return inner
}
                                                                                                                                                                                                                          