import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const settingsUrl = new URL('/settings', appUrl)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', appUrl))
  }

  try {
    await prisma.microsoftAccount.delete({
      where: { userId: user.id },
    })

    settingsUrl.searchParams.set('success', 'Microsoft account disconnected')
    return NextResponse.redirect(settingsUrl)
  } catch (err) {
    // If the record doesn't exist, that's fine — still redirect to settings
    console.error('Microsoft disconnect error:', err)
    settingsUrl.searchParams.set('success', 'Microsoft account disconnected')
    return NextResponse.redirect(settingsUrl)
  }
}
