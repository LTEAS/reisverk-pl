/**
 * POST /api/briefing/refresh
 *
 * Sync + classify only. Returns fast.
 * Frontend then calls /api/briefing/generate separately for briefing.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncEmails } from '@/lib/microsoft/email-sync'
import { syncCalendar } from '@/lib/microsoft/calendar-sync'
import { classifyEmails } from '@/lib/ai/email-classifier'
import { autoCloseTasks } from '@/lib/ai/task-auto-close'
import { generateMeetingPreps } from '@/lib/ai/meeting-prep'
import { prisma } from '@/lib/prisma'

export const maxDuration = 300

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

  // 1+2. Email & calendar sync (fast — no AI)
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

    try {
      pipeline.calendar = await syncCalendar(userId)
    } catch (err: any) {
      console.error('Calendar sync failed:', err.message)
      pipeline.calendar = { error: err.message }
    }
  }

  // 3-5. Classification, auto-close, meeting prep in parallel
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  if (forceReset) {
    const deleted = await prisma.aiSuggestion.deleteMany({ where: { status: 'pending' } })
    const resetResult = await prisma.email.updateMany({
      where: { userId, aiProcessedAt: { not: null }, receivedAt: { gte: sevenDaysAgo } },
      data: { aiProcessedAt: null },
    })
    pipeline.reclassifyReset = resetResult.count
    pipeline.suggestionsDeleted = deleted.count
  } else {
    const existingSuggestions = await prisma.aiSuggestion.count()
    const existingAiTasks = await prisma.task.count({ where: { createdBy: userId, source: 'ai_email' } })
    if (existingSuggestions === 0 && existingAiTasks === 0) {
      const resetResult = await prisma.email.updateMany({
        where: { userId, aiProcessedAt: { not: null }, receivedAt: { gte: sevenDaysAgo } },
        data: { aiProcessedAt: null },
      })
      pipeline.reclassifyReset = resetResult.count
    }
  }

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

  // Return sync results — frontend calls /api/briefing/generate separately
  const hasAnyError = Object.values(pipeline).some(
    (v: any) => v && typeof v === 'object' && 'error' in v
  )
  return NextResponse.json({
    ok: !hasAnyError,
    ...(hasAnyError ? { warning: 'Noen steg feilet — se detaljer per steg' } : {}),
    ...pipeline,
  })
}
