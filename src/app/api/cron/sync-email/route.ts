/**
 * Cron endpoint: sync emails for all connected users.
 *
 * Called periodically by Vercel Cron or an external scheduler.
 * Protected by CRON_SECRET header.
 *
 * Can also be triggered manually for a single user via query param:
 *   GET /api/cron/sync-email?userId=<uuid>
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncEmails, type SyncResult } from '@/lib/microsoft/email-sync'

export const maxDuration = 60 // allow up to 60s on Vercel
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Auth: check cron secret or that this is a logged-in user doing manual sync
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  const isCronAuth =
    cronSecret && authHeader === `Bearer ${cronSecret}`

  // Also allow manual trigger from the app (with userId param)
  const singleUserId = request.nextUrl.searchParams.get('userId')

  if (!isCronAuth && !singleUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, SyncResult> = {}

  if (singleUserId) {
    // Single user sync
    results[singleUserId] = await syncEmails(singleUserId)
  } else {
    // Batch: all users with active Microsoft accounts and sync enabled
    const accounts = await prisma.microsoftAccount.findMany({
      where: {
        refreshToken: { not: null },
      },
      select: { userId: true },
    })

    // Check which users have sync enabled
    for (const { userId } of accounts) {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { syncEnabled: true },
      })

      // Default to enabled if no settings exist
      if (settings && !settings.syncEnabled) continue

      try {
        results[userId] = await syncEmails(userId)
      } catch (err: any) {
        results[userId] = {
          synced: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          error: err.message || String(err),
        }
      }
    }
  }

  return NextResponse.json({ ok: true, results })
}
