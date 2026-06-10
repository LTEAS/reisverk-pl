import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { capturePayment, getPaymentStatus } from '@/lib/vipps/client'

/**
 * Vipps webhook for payment status changes.
 * Handles AUTHORIZED (auto-capture) and terminal states.
 *
 * Webhook URL: https://pl.reisverk.com/api/vipps/webhook
 * Must be registered in Vipps portal.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      reference: string
      pspReference?: string
      name: string // e.g. "epayments.payment.authorized.v1"
      amount?: { value: number; currency: string }
    }

    const { reference, name } = body

    if (!reference) {
      return NextResponse.json({ ok: true }) // Ack but ignore
    }

    const topUp = await prisma.topUp.findFirst({
      where: { vippsOrderId: reference },
    })

    if (!topUp || topUp.status === 'completed') {
      return NextResponse.json({ ok: true }) // Already handled or unknown
    }

    // The webhook payload is unauthenticated — never trust the event name
    // alone. Verify the actual payment state with the Vipps API first.
    let verifiedState: string
    try {
      const status = await getPaymentStatus(reference)
      verifiedState = status.state
    } catch (err) {
      console.error('[vipps/webhook] State verification failed:', err)
      return NextResponse.json({ ok: true }) // Ack; Vipps will retry
    }

    // Payment authorized — capture and credit
    if (name?.includes('authorized') && verifiedState === 'AUTHORIZED') {
      try {
        await capturePayment(reference, topUp.amountNok * 100)

        await prisma.topUp.update({
          where: { id: topUp.id },
          data: { status: 'completed' },
        })

        await prisma.monthlyUsage.upsert({
          where: { userId_periodMonth: { userId: topUp.userId, periodMonth: topUp.periodMonth } },
          create: {
            userId: topUp.userId,
            periodMonth: topUp.periodMonth,
            creditLimitNok: 100 + topUp.creditNok,
            topUpCreditNok: topUp.creditNok,
          },
          update: {
            creditLimitNok: { increment: topUp.creditNok },
            topUpCreditNok: { increment: topUp.creditNok },
          },
        })
      } catch (err) {
        console.error('[vipps/webhook] Capture failed:', err)
      }
    }

    // Payment aborted/expired/terminated — verified against actual state
    if (['ABORTED', 'EXPIRED', 'TERMINATED'].includes(verifiedState)) {
      await prisma.topUp.update({
        where: { id: topUp.id },
        data: { status: 'failed' },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[vipps/webhook]', err)
    return NextResponse.json({ ok: true }) // Always ack to Vipps
  }
}
