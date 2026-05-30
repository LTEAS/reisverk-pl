import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  if (error) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set(
      'error',
      errorDescription || error || 'Autentisering feilet'
    )
    return NextResponse.redirect(loginUrl)
  }

  if (!code) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('error', 'Ingen autorisasjonskode mottatt')
    return NextResponse.redirect(loginUrl)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set(
      'error',
      exchangeError.message || 'Kunne ikke fullføre innlogging'
    )
    return NextResponse.redirect(loginUrl)
  }

  // Ensure profile exists for the authenticated user
  if (data.user) {
    try {
      await prisma.profile.upsert({
        where: { id: data.user.id },
        update: {
          email: data.user.email,
          displayName:
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            null,
        },
        create: {
          id: data.user.id,
          email: data.user.email,
          displayName:
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            null,
        },
      })

      // Auto-create trial subscription for new users (7 days)
      const existingSub = await prisma.subscription.findUnique({
        where: { userId: data.user.id },
      })
      if (!existingSub) {
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + 7)
        await prisma.subscription.create({
          data: {
            userId: data.user.id,
            status: 'trial',
            trialEndsAt: trialEnd,
            priceNok: 149,
            monthlyCreditNok: 100,
          },
        })
      }
    } catch (e) {
      console.error('Failed to upsert profile:', e)
    }
  }

  return NextResponse.redirect(new URL('/', requestUrl.origin))
}
