import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/usage — current user's AI usage this month (for the chat meter).
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const periodMonth = new Date().toISOString().slice(0, 7)
  const [usage, subscription] = await Promise.all([
    prisma.monthlyUsage.findUnique({
      where: { userId_periodMonth: { userId: user.id, periodMonth } },
      select: { totalCostNok: true, creditLimitNok: true },
    }),
    prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { isFreeAccount: true, status: true, trialEndsAt: true },
    }),
  ])

  const unlimited =
    !!subscription?.isFreeAccount ||
    (subscription?.status === 'trial' &&
      !!subscription.trialEndsAt &&
      subscription.trialEndsAt > new Date())

  return NextResponse.json({
    unlimited,
    spentNok: usage?.totalCostNok ?? 0,
    limitNok: usage?.creditLimitNok ?? 100,
  })
}
