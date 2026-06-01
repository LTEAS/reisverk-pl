/**
 * POST /api/briefing/refresh
 *
 * Full refresh triggered by dashboard button:
 *   1. Sync email
 *   2. Sync calendar (3 weeks ahead)
 *   3. Classify new emails (AI)
 *   4. Auto-close tasks (reply detection)
 *   5. Meeting prep (incremental, 3 weeks ahead)
 *   6. Generate/update briefing
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncEmails } from '@/lib/microsoft/email-sync'
import { syncCalendar } from '@/lib/microsoft/calendar-sync'
import { classifyEmails } from '@/lib/ai/email-classifier'
import { autoCloseTasks } from '@/lib/ai/task-auto-close'
import { generateMeetingPreps } from '@/lib/ai/meeting-prep'
import { generateBriefing } from '@/lib/briefing/generate'
import { prisma } from '@/lib/prisma'

export const maxDuration = 600 // 10 min — Pro plan supports up to 800s

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id
  const pipeline: Record<string, any> = {}
  const url = new URL(request.url)
  const forceReset = url.searchParams.get('reset') === 'true'

  // 1+2. Email & calendar sync
  const msAccount = await prisma.microsoftAccount.findUnique({
    where: { userId },
    select: { refreshToken: true },
  })

  if (msAccount?.refreshToken) {
    try {
      pipeline.sync = await syncEmails(userId)
    } catch (err: any) {
      console.error('Email sync failed:', err.message)
      pipeline.sync = { error: err.message }
    }

    // Calendar sync
    try {
      pipeline.calendar = await syncCalendar(userId)
    } catch (err: any) {
      console.error('Calendar sync failed:', err.message)
      pipeline.calendar = { error: err.message }
    }
  }

  // 3-5. Run classification, auto-close, and meeting prep in PARALLEL
  // This cuts total time significantly since each makes independent AI calls
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Prepare classification reset if needed (quick DB ops, run before parallel)
  if (forceReset) {
    const deleted = await prisma.aiSuggestion.deleteMany({
      where: { status: 'pending' },
    })
    const resetResult = await prisma.email.updateMany({
      where: {
        userId,
        aiProcessedAt: { not: null },
        receivedAt: { gte: sevenDaysAgo },
      },
      data: { aiProcessedAt: null },
    })
    pipeline.reclassifyReset = resetResult.count
    pipeline.suggestionsDeleted = deleted.count
  } else {
    const existingSuggestions = await prisma.aiSuggestion.count()
    const existingAiTasks = await prisma.task.count({
      where: { createdBy: userId, source: 'ai_email' },
    })
    if (existingSuggestions === 0 && existingAiTasks === 0) {
      const resetResult = await prisma.email.updateMany({
        where: {
          userId,
          aiProcessedAt: { not: null },
          receivedAt: { gte: sevenDaysAgo },
        },
        data: { aiProcessedAt: null },
      })
      pipeline.reclassifyReset = resetResult.count
    }
  }

  // Run all three in parallel
  const [classificationResult, autoCloseResult, meetingPrepResult] =
    await Promise.allSettled([
      classifyEmails(userId),
      autoCloseTasks(userId),
      generateMeetingPreps(userId),
    ])

  pipeline.classification =
    classificationResult.status === 'fulfilled'
      ? classificationResult.value
      : { error: (classificationResult as PromiseRejectedResult).reason?.message }
  pipeline.autoClose =
    autoCloseResult.status === 'fulfilled'
      ? autoCloseResult.value
      : { error: (autoCloseResult as PromiseRejectedResult).reason?.message }
  pipeline.meetingPrep =
    meetingPrepResult.status === 'fulfilled'
      ? meetingPrepResult.value
      : { error: (meetingPrepResult as PromiseRejectedResult).reason?.message }

  // Check if AI is reachable based on classification result
  const aiAvailable = classificationResult.status === 'fulfilled' ||
    !((classificationResult as PromiseRejectedResult).reason?.message?.includes('Connection error'))

  // 6. Generate briefing (AI) — skip if AI is down
  if (aiAvailable) {
    try {
      pipeline.briefing = await generateBriefing(userId)
    } catch (err: any) {
      console.error('Briefing generation failed:', err)
      pipeline.briefing = { error: err.message || 'Briefing generation failed' }
    }
  } else {
    pipeline.briefing = { skipped: true, reason: 'AI utilgjengelig' }
  }

  // Return 200 with whatever succeeded — don't fail the whole pipeline
  // just because one step (e.g. briefing AI) had a connection error
  const hasAnyError = Object.values(pipeline).some(
    (v: any) => v && typeof v === 'object' && 'error' in v
  )
  return NextResponse.json({
    ok: !hasAnyError,
    ...(hasAnyError ? { warning: 'Noen steg feilet — se detaljer per steg' } : {}),
    ...pipeline,
  })
}
