/**
 * Unified cron pipeline: runs the full automation sequence.
 *
 * Order:
 *   1. Email sync (fetch from Outlook)
 *   2. AI email classification (classify + create tasks/suggestions)
 *   3. Referat processing (detect meeting minutes, extract action items)
 *   4. Auto-close tasks (detect replies, update statuses)
 *   5. Calendar sync (fetch from Outlook calendar)
 *   6. Meeting prep (generate prep notes for upcoming meetings)
 *   7. Reply suggestions (draft replies for emails needing response)
 *   8. Daily briefing (generate from the freshly synced + classified data)
 *
 * Triggered by Vercel Cron or external scheduler.
 * Protected by CRON_SECRET. Manual trigger: GET ?userId=<uuid>
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { syncEmails } from '@/lib/microsoft/email-sync'
import { classifyEmails } from '@/lib/ai/email-classifier'
import { processReferater } from '@/lib/ai/referat-processor'
import { autoCloseTasks } from '@/lib/ai/task-auto-close'
import { syncCalendar } from '@/lib/microsoft/calendar-sync'
import { generateMeetingPreps } from '@/lib/ai/meeting-prep'
import { generateReplySuggestions } from '@/lib/ai/reply-suggestions'
import { generateBriefing } from '@/lib/briefing/generate'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

interface PipelineResult {
  emailSync?: any
  classification?: any
  referatProcessing?: any
  autoClose?: any
  calendarSync?: any
  meetingPrep?: any
  replySuggestions?: any
  briefing?: any
  errors: string[]
  durationMs: number
}

async function runPipeline(userId: string): Promise<PipelineResult> {
  const start = Date.now()
  const result: PipelineResult = { errors: [], durationMs: 0 }

  // 1. Email sync
  try {
    result.emailSync = await syncEmails(userId)
  } catch (err: any) {
    result.errors.push(`emailSync: ${err.message}`)
  }

  // 2. AI classification
  try {
    result.classification = await classifyEmails(userId)
  } catch (err: any) {
    result.errors.push(`classification: ${err.message}`)
  }

  // 3. Referat processing
  try {
    result.referatProcessing = await processReferater(userId)
  } catch (err: any) {
    result.errors.push(`referatProcessing: ${err.message}`)
  }

  // 4. Auto-close tasks
  try {
    result.autoClose = await autoCloseTasks(userId)
  } catch (err: any) {
    result.errors.push(`autoClose: ${err.message}`)
  }

  // 5. Calendar sync
  try {
    result.calendarSync = await syncCalendar(userId)
  } catch (err: any) {
    result.errors.push(`calendarSync: ${err.message}`)
  }

  // 6. Meeting prep
  try {
    result.meetingPrep = await generateMeetingPreps(userId)
  } catch (err: any) {
    result.errors.push(`meetingPrep: ${err.message}`)
  }

  // 7. Reply suggestions
  try {
    result.replySuggestions = await generateReplySuggestions(userId)
  } catch (err: any) {
    result.errors.push(`replySuggestions: ${err.message}`)
  }

  // 8. Daily briefing — generated last, from freshly synced + classified data.
  // generateBriefing reads from the DB (no extra sync) and enforces its own
  // monthly limit; a throw here is caught so the rest of the pipeline still logs.
  try {
    result.briefing = await generateBriefing(userId)
  } catch (err: any) {
    result.errors.push(`briefing: ${err.message}`)
  }

  result.durationMs = Date.now() - start

  // Log pipeline run
  await prisma.syncLog.create({
    data: {
      userId,
      syncType: 'pipeline',
      status: result.errors.length > 0 ? 'partial' : 'completed',
      startedAt: new Date(start),
      completedAt: new Date(),
      itemsSynced: (result.emailSync?.synced || 0) + (result.calendarSync?.synced || 0),
      itemsCreated:
        (result.emailSync?.created || 0) +
        (result.calendarSync?.created || 0) +
        (result.classification?.suggestionsCreated || 0) +
        (result.referatProcessing?.suggestionsCreated || 0) +
        (result.meetingPrep?.generated || 0) +
        (result.replySuggestions?.generated || 0),
      errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
    },
  }).catch(() => {}) // Don't fail pipeline if logging fails

  return result
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`
  const requestedUserId = request.nextUrl.searchParams.get('userId')

  // Manual trigger: an authenticated user may only run the pipeline for
  // themselves. The userId query param is honored only with cron auth.
  let singleUserId: string | null = null
  if (isCronAuth) {
    singleUserId = requestedUserId
  } else {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    singleUserId = user.id
  }

  const results: Record<string, PipelineResult> = {}

  if (singleUserId) {
    results[singleUserId] = await runPipeline(singleUserId)
  } else {
    // All users with active Microsoft accounts
    const accounts = await prisma.microsoftAccount.findMany({
      where: { refreshToken: { not: null } },
      select: { userId: true },
    })

    for (const { userId } of accounts) {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { syncEnabled: true },
      })
      if (settings && !settings.syncEnabled) continue

      try {
        results[userId] = await runPipeline(userId)
      } catch (err: any) {
        results[userId] = {
          errors: [`pipeline: ${err.message}`],
          durationMs: 0,
        }
      }
    }
  }

  return NextResponse.json({ ok: true, results })
}
