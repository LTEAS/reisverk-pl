'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppRole } from '@prisma/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAdmin() {
  const user = await requireUser()
  const roles = await prisma.userRole.findMany({
    where: { userId: user.id },
    select: { role: true },
  })
  if (!roles.some((r) => r.role === 'admin')) {
    throw new Error('Unauthorized')
  }
  return user
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export async function setUserRole(userId: string, role: AppRole) {
  await requireAdmin()

  // Upsert the role
  const existing = await prisma.userRole.findFirst({
    where: { userId },
  })

  if (existing) {
    await prisma.userRole.update({
      where: { id: existing.id },
      data: { role },
    })
  } else {
    await prisma.userRole.create({
      data: { userId, role },
    })
  }
}

export async function toggleUserActive(userId: string, active: boolean) {
  await requireAdmin()

  if (active) {
    // Ensure subscription exists and is active
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        status: 'active',
        priceNok: 149,
        monthlyCreditNok: 100,
      },
      update: { status: 'active', cancelledAt: null },
    })
  } else {
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        status: 'paused',
        priceNok: 149,
        monthlyCreditNok: 100,
      },
      update: { status: 'paused' },
    })
  }
}

export async function resetOnboarding(userId: string) {
  await requireAdmin()
  await prisma.profile.update({
    where: { id: userId },
    data: { onboardingCompleted: false },
  })
  revalidatePath('/')
}

export async function dismissOnboarding() {
  const user = await requireUser()
  await prisma.profile.update({
    where: { id: user.id },
    data: { onboardingCompleted: true },
  })
  revalidatePath('/')
}

export async function toggleFreeAccount(userId: string, isFree: boolean) {
  await requireAdmin()

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      status: 'active',
      priceNok: 0,
      monthlyCreditNok: 100,
      isFreeAccount: isFree,
    },
    update: { isFreeAccount: isFree },
  })

  revalidatePath('/admin')
}

export async function addUserCredit(userId: string, creditNok: number) {
  await requireAdmin()

  const periodMonth = new Date().toISOString().slice(0, 7) // "2026-05"

  // Add a manual top-up
  await prisma.topUp.create({
    data: {
      userId,
      amountNok: 0, // Admin-granted, no charge
      creditNok,
      status: 'completed',
      periodMonth,
    },
  })

  // Update monthly usage credit limit
  await prisma.monthlyUsage.upsert({
    where: { userId_periodMonth: { userId, periodMonth } },
    create: {
      userId,
      periodMonth,
      creditLimitNok: 100 + creditNok,
      topUpCreditNok: creditNok,
    },
    update: {
      creditLimitNok: { increment: creditNok },
      topUpCreditNok: { increment: creditNok },
    },
  })
}
