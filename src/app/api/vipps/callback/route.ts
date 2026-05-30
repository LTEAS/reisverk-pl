import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPaymentStatus, capturePayment } from '@/lib/vipps/client'

/**
 * Vipps redirects the user here after payment.
 * We check the payment status, capture if authorized, and credit the user.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (!reference) {
    return NextResponse.redirect(`${appUrl}/settings?vipps=error`)
  }

  try {
    // Look up the top-up record
    const topUp = await prisma.topUp.findFirst({
      where: { vippsOrderId: reference },
    })

    if (!topUp) {
      return NextResponse.redirect(`${appUrl}/settings?vipps=error`)
    }

    // Already processed?
    if (topUp.status === 'completed') {
      return NextResponse.redirect(`${appUrl}/settings?vipps=success`)
    }

    // Check payment status with Vipps
    const status = await getPaymentStatus(reference)

    if (status.state === 'AUTHORIZED') {
      // Capture the payment
      await capturePayment(reference, topUp.amountNok * 100)

      // Credit the user
      await creditTopUp(topUp.id, topUp.userId, topUp.creditNok, topUp.periodMonth)

      return NextResponse.redirect(`${appUrl}/settings?vipps=success`)
    }

    if (status.state === 'ABORTED' || status.state === 'EXPIRED' || status.state === 'TERMINATED') {
      await prisma.topUp.update({
        where: { id: topUp.id },
        data: { status: 'failed' },
      })
      return NextResponse.redirect(`${appUrl}/settings?vipps=cancelled`)
    }

    // Still in CREATED state — user didn't complete yet
    return NextResponse.redirect(`${appUrl}/settings?vipps=pending`)
  } catch (err) {
    console.error('[vipps/callback]', err)
    return NextResponse.redirect(`${appUrl}/settings?vipps=error`)
  }
}

// ---------------------------------------------------------------------------
// Credit helper
// ---------------------------------------------------------------------------

async function creditTopUp(topUpId: string, userId: string, creditNok: number, periodMonth: string) {
  // Mark top-up as completed
  await prisma.topUp.update({
    where: { id: topUpId },
    data: { status: 'completed' },
  })

  // Add credit to monthly usage
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
