import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const settingsUrl = new URL('/settings', appUrl)

  // Handle errors from Microsoft
  if (error) {
    console.error('Microsoft OAuth error:', error, errorDescription)
    settingsUrl.searchParams.set(
      'error',
      errorDescription || 'Microsoft authentication failed'
    )
    return NextResponse.redirect(settingsUrl)
  }

  if (!code || !state) {
    settingsUrl.searchParams.set('error', 'Missing authorization code or state')
    return NextResponse.redirect(settingsUrl)
  }

  // Validate state from cookie
  const cookieStore = await cookies()
  const storedState = cookieStore.get('microsoft_oauth_state')?.value

  if (!storedState || storedState !== state) {
    settingsUrl.searchParams.set('error', 'Invalid state parameter')
    return NextResponse.redirect(settingsUrl)
  }

  // Clear the state cookie
  cookieStore.delete('microsoft_oauth_state')

  // Get authenticated user
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', appUrl))
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          code,
          redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
          grant_type: 'authorization_code',
        }),
      }
    )

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Token exchange failed:', errorData)
      settingsUrl.searchParams.set(
        'error',
        'Failed to exchange authorization code for tokens'
      )
      return NextResponse.redirect(settingsUrl)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in, scope } = tokenData

    // Get user profile from Microsoft Graph
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    let accountEmail: string | null = null
    let accountName: string | null = null

    if (profileResponse.ok) {
      const profile = await profileResponse.json()
      accountEmail = profile.mail || profile.userPrincipalName || null
      accountName = profile.displayName || null
    } else {
      console.warn('Failed to fetch Microsoft Graph profile:', profileResponse.status)
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + expires_in * 1000)

    // Ensure Profile record exists for this user
    await prisma.profile.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email,
        displayName:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          null,
      },
    })

    // Upsert the MicrosoftAccount record
    await prisma.microsoftAccount.upsert({
      where: { userId: user.id },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountEmail,
        accountName,
        scope: scope || null,
      },
      create: {
        userId: user.id,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountEmail,
        accountName,
        scope: scope || null,
        connectedAt: now,
      },
    })

    settingsUrl.searchParams.set('success', 'Microsoft account connected')
    return NextResponse.redirect(settingsUrl)
  } catch (err) {
    console.error('Microsoft OAuth callback error:', err)
    settingsUrl.searchParams.set(
      'error',
      'An unexpected error occurred while connecting your Microsoft account'
    )
    return NextResponse.redirect(settingsUrl)
  }
}
