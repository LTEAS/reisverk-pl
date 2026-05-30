import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SettingsForm } from './settings-form'
import { UsageCard } from './usage-card'

export default async function SettingsPage() {
  const user = await requireUser()
  const userId = user.id
  const periodMonth = new Date().toISOString().slice(0, 7)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const [settings, msAccount, subscription, monthlyUsage, recentTopUps] =
    await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.microsoftAccount.findUnique({
        where: { userId },
        select: {
          accountEmail: true,
          accountName: true,
          connectedAt: true,
          expiresAt: true,
        },
      }),
      prisma.subscription.findUnique({ where: { userId } }),
      prisma.monthlyUsage.findUnique({
        where: { userId_periodMonth: { userId, periodMonth } },
      }),
      prisma.topUp.findMany({
        where: { userId, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

  // If no monthly_usage row yet, compute from ai_call_log
  let usage = monthlyUsage
  if (!usage) {
    const aiStats = await prisma.aiCallLog.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { totalTokens: true, estimatedCostNok: true },
      _count: true,
    })
    usage = {
      userId,
      periodMonth,
      totalCostNok: aiStats._sum.estimatedCostNok || 0,
      totalCalls: aiStats._count || 0,
      totalTokens: aiStats._sum.totalTokens || 0,
      creditLimitNok: subscription?.monthlyCreditNok || 100,
      topUpCreditNok: 0,
      updatedAt: new Date(),
    }
  }

  const currentSettings = settings || {
    briefingTime: '06:00',
    aiLanguage: 'nb',
    autoCreateTasks: false,
    requireTaskConfirmation: true,
    syncEnabled: true,
    syncIntervalMin: 30,
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Innstillinger</h1>
        <p className="text-sm text-stone-400 mt-1">
          Administrer tilkoblinger og preferanser
        </p>
      </div>

      {/* Usage & billing card */}
      <UsageCard
        subscription={{
          status: subscription?.status || 'trial',
          priceNok: subscription?.priceNok || 149,
          trialEndsAt: subscription?.trialEndsAt || null,
        }}
        usage={{
          costThisMonth: usage.totalCostNok,
          callsThisMonth: usage.totalCalls,
          creditLimitNok: usage.creditLimitNok,
          topUpCreditNok: usage.topUpCreditNok,
        }}
        topUps={recentTopUps.map((t) => ({
          id: t.id,
          amountNok: t.amountNok,
          creditNok: t.creditNok,
          createdAt: t.createdAt,
        }))}
      />

      <SettingsForm
        settings={currentSettings}
        msAccount={msAccount}
        userId={userId}
      />
    </div>
  )
}
