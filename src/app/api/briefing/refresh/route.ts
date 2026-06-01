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

  // 3. Classify new emails
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    if (forceReset) {
      // Delete pending suggestions and reset all emails for reclassification
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
      // Check if we need a full reclassification (no suggestions exist yet)
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

    pipeline.classification = await classifyEmails(userId)
  } catch (err: any) {
    console.error('Classification failed:', err.message, err.stack)
    pipeline.classification = { error: err.message }
  }

  // 4. Auto-close tasks
  try {
    pipeline.autoClose = await autoCloseTasks(userId)
  } catch (err: any) {
    console.error('Auto-close failed:', err.message)
    pipeline.autoClose = { error: err.message }
  }

  // 5. Meeting prep (incremental — all meetings next 3 weeks)
  try {
    pipeline.meetingPrep = await generateMeetingPreps(userId)
  } catch (err: any) {
    console.error('Meeting prep failed:', err.message)
    pipeline.meetingPrep = { error: err.message }
  }

  // 6. Generate briefing
  try {
    pipeline.briefing = await generateBriefing(userId)
  } catch (err: any) {
    console.error('Briefing generation failed:', err)
    pipeline.briefing = { error: err.message || 'Briefing generation failed' }
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
