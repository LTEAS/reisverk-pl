import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { createPayment } from '@/lib/vipps/client'
import { randomUUID } from 'crypto'

// Top-up options: creditNok → price in NOK
const TOP_UP_OPTIONS: Record<number, number> = {
  50: 49,
  100: 89,
  200: 169,
}

export async function POST(request: Request) {
  try {
    // Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 })
    }

    const body = await request.json() as { creditNok?: number }
    const creditNok = body.creditNok

    if (!creditNok || !TOP_UP_OPTIONS[creditNok]) {
      return NextResponse.json({ error: 'Ugyldig beløp' }, { status: 400 })
    }

    const amountNok = TOP_UP_OPTIONS[creditNok]
    const reference = `topup-${randomUUID()}`
    const periodMonth = new Date().toISOString().slice(0, 7)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

    // Create TopUp record (pending)
    await prisma.topUp.create({
      data: {
        userId: user.id,
        amountNok,
        creditNok,
        status: 'pending',
        vippsOrderId: reference,
        periodMonth,
      },
    })

    // Create Vipps payment
    const result = await createPayment({
      amountNok,
      reference,
      description: `Reisverk AI-kreditt: +${creditNok} kr`,
      returnUrl: `${appUrl}/api/vipps/callback?reference=${reference}`,
    })

    return NextResponse.json({ redirectUrl: result.redirectUrl })
  } catch (err) {
    console.error('[vipps/create-topup]', err)
    return NextResponse.json(
      { error: 'Kunne ikke opprette betaling' },
      { status: 500 }
    )
  }
}
