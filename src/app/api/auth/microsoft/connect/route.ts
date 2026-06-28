import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(
      new URL('/login', process.env.NEXT_PUBLIC_APP_URL!)
    )
  }

  // Generate a random state for CSRF protection
  const state = crypto.randomBytes(32).toString('hex')

  // Store state in a cookie
  const cookieStore = await cookies()
  cookieStore.set('microsoft_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  })

  // Calendar write access is opt-in: only requested when the meeting-creation
  // feature is enabled (the settings reconnect button hits ?write=1). Default
  // stays read-only for least privilege.
  const wantCalendarWrite =
    new URL(request.url).searchParams.get('write') === '1'

  const scopes = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'Mail.Read',
    wantCalendarWrite ? 'Calendars.ReadWrite' : 'Calendars.Read',
  ]

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
    response_mode: 'query',
    scope: scopes.join(' '),
    state,
    prompt: 'consent',
  })

  const authorizeUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`

  return NextResponse.redirect(authorizeUrl)
}
