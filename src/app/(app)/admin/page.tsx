import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AdminDashboard } from './admin-dashboard'

export default async function AdminPage() {
  const user = await requireUser()

  const periodMonth = new Date().toISOString().slice(0, 7)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  // Fetch all users with roles, subscription, and usage
  const profiles = await prisma.profile.findMany({
    include: {
      userRoles: true,
      microsoftAccount: {
        select: { accountEmail: true, connectedAt: true },
      },
      subscription: true,
      _count: {
        select: {
          emails: true,
          createdProjects: true,
          chatMessages: true,
          aiCallLogs: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Monthly usage per user
  const monthlyUsages = await prisma.monthlyUsage.findMany({
    where: { periodMonth },
  })

  // AI usage per user this month (from ai_call_log)
  const aiUsageByUser = await prisma.aiCallLog.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: monthStart } },
    _sum: { totalTokens: true, estimatedCostNok: true },
    _count: true,
  })

  // System-wide stats
  const [totalProjects, totalEmails, totalAiCalls, aiCallsThisMonth] =
    await Promise.all([
      prisma.project.count(),
      prisma.email.count(),
      prisma.aiCallLog.count(),
      prisma.aiCallLog.count({ where: { createdAt: { gte: monthStart } } }),
    ])

  const totalCostThisMonth = aiUsageByUser.reduce(
    (sum, u) => sum + (u._sum.estimatedCostNok || 0),
    0
  )
  const totalTokensThisMonth = aiUsageByUser.reduce(
    (sum, u) => sum + (u._sum.totalTokens || 0),
    0
  )

  const stats = {
    totalUsers: profiles.length,
    totalProjects,
    totalEmails,
    totalAiCalls,
    aiCallsThisMonth,
    totalTokensThisMonth,
    totalCostThisMonth,
  }

  const users = profiles.map((p) => {
    const usage = monthlyUsages.find((u) => u.userId === p.id)
    const aiUsage = aiUsageByUser.find((u) => u.userId === p.id)

    return {
      id: p.id,
      displayName: p.displayName,
      email: p.email,
      createdAt: p.createdAt,
      role: p.userRoles[0]?.role || 'user',
      msConnected: !!p.microsoftAccount?.connectedAt,
      msEmail: p.microsoftAccount?.accountEmail || null,
      projectCount: p._count.createdProjects,
      emailCount: p._count.emails,
      chatMessages: p._count.chatMessages,
      // Subscription
      subscriptionStatus: p.subscription?.status || 'none',
      priceNok: p.subscription?.priceNok || 149,
      // Usage this month
      costThisMonth: usage?.totalCostNok || aiUsage?._sum.estimatedCostNok || 0,
      callsThisMonth: usage?.totalCalls || aiUsage?._count || 0,
      tokensThisMonth: usage?.totalTokens || aiUsage?._sum.totalTokens || 0,
      creditLimitNok: usage?.creditLimitNok || 100,
      topUpCreditNok: usage?.topUpCreditNok || 0,
      isFreeAccount: p.subscription?.isFreeAccount || false,
      onboardingCompleted: p.onboardingCompleted,
    }
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <Ad