/**
 * Meeting Prep Generator — incremental model
 *
 * Runs as part of the daily refresh pipeline. For every meeting in the
 * next 3 weeks it:
 *   1. Checks if prep already exists
 *   2. If yes — checks whether new related emails have arrived since
 *      the last generation. If so, regenerates.
 *   3. If no — generates fresh prep.
 *
 * This way prep builds up over time: an email arriving today about a
 * meeting in two weeks is captured immediately and ready when the
 * meeting comes.
 */

import { prisma } from '@/lib/prisma'
import { createMessageWithRetry } from './anthropic'

export interface MeetingPrepResult {
  generated: number
  updated: number
  skipped: number
}

export async function generateMeetingPreps(
  userId: string
): Promise<MeetingPrepResult> {
  const result: MeetingPrepResult = { generated: 0, updated: 0, skipped: 0 }

  const now = new Date()
  const horizon = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000)

  // All upcoming meetings in the next 3 weeks
  const meetings = await prisma.meeting.findMany({
    where: {
      userId,
      startsAt: { gte: now, lte: horizon },
      status: { not: 'cancelled' },
    },
    include: {
      project: {
        select: { id: true, name: true, shortCode: true },
      },
      meetingPreps: {
        where: { userId },
        select: {
          id: true,
          relatedEmailIds: true,
          generatedAt: true,
        },
      },
    },
  })

  for (const meeting of meetings) {
    // Collect attendee emails for matching
    const attendeeEmails = Array.isArray(meeting.attendees)
      ? (meeting.attendees as any[])
          .map((a: any) => a.email)
          .filter(Boolean)
      : []

    // Find related emails — look back 30 days to capture older context
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const orConditions = [
      ...(meeting.projectId
        ? [{ projectId: meeting.projectId }]
        : []),
      ...(attendeeEmails.length > 0
        ? [{ senderEmail: { in: attendeeEmails } }]
        : []),
      ...(meeting.organizerEmail
        ? [{ senderEmail: meeting.organizerEmail }]
        : []),
    ].filter((c) => Object.keys(c).length > 0)

    // If no conditions to match on, skip (no project, no attendees)
    if (orConditions.length === 0) {
      result.skipped++
      continue
    }

    const relatedEmails = await prisma.email.findMany({
      where: {
        userId,
        receivedAt: { gte: thirtyDaysAgo },
        noiseScore: { lt: 40 },
        OR: orConditions,
      },
      orderBy: { receivedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        subject: true,
        senderName: true,
        bodyPreview: true,
        receivedAt: true,
        aiSummary: true,
      },
    })

    const currentEmailIds = relatedEmails.map((e) => e.id).sort()
    const existingPrep = meeting.meetingPreps[0]

    if (existingPrep) {
      // Check if email set has changed since last generation
      const previousIds = [...(existingPrep.relatedEmailIds || [])].sort()
      const sameEmails =
        currentEmailIds.length === previousIds.length &&
        currentEmailIds.every((id, i) => id === previousIds[i])

      if (sameEmails) {
        result.skipped++
        continue
      }
      // New emails found — will regenerate below
    }

    // Find related tasks
    const relatedTasks = meeting.projectId
      ? await prisma.task.findMany({
          where: {
            projectId: meeting.projectId,
            status: { notIn: ['lukket'] },
          },
          orderBy: { priority: 'asc' },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            assignee: true,
          },
        })
      : []

    // Build prompt
    const emailContext = relatedEmails
      .map(
        (e) =>
          `- "${e.subject}" fra ${e.senderName} (${e.receivedAt?.toLocaleDateString('nb-NO')}): ${e.aiSummary || e.bodyPreview?.slice(0, 200)}`
      )
      .join('\n')

    const taskContext = relatedTasks
      .map(
        (t) =>
          `- ${t.title} (${t.status}, ${t.priority}${t.dueDate ? `, frist: ${t.dueDate.toLocaleDateString('nb-NO')}` : ''}${t.assignee ? `, ansvarlig: ${t.assignee}` : ''})`
      )
      .join('\n')

    const attendeeList = attendeeEmails.join(', ')

    const daysUntilMeeting = Math.ceil(
      (meeting.startsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    )

    const prompt = `Du forbereder en byggeprosjektleder til et møte som er om ${daysUntilMeeting} dag${daysUntilMeeting > 1 ? 'er' : ''}. Skriv korte, handlingsorienterte forberedelsesnotater på norsk.

MØTE:
Tittel: ${meeting.subject || 'Uten tittel'}
Dato: ${meeting.startsAt.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}
Tid: ${meeting.startsAt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })} - ${meeting.endsAt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
Sted: ${meeting.isOnline ? 'Teams (online)' : meeting.location || 'ukjent'}
Arrangør: ${meeting.organizerName || 'ukjent'}
Deltakere: ${attendeeList || 'ukjent'}
${meeting.project ? `Prosjekt: ${meeting.project.shortCode || meeting.project.name}` : ''}

RELATERTE E-POSTER (siste 30 dager):
${emailContext || 'Ingen relevante e-poster funnet'}

RELATERTE OPPGAVER:
${taskContext || 'Ingen relaterte oppgaver'}

Svar med BARE JSON:
{
  "agendaSummary": "Kort oppsummering av hva møtet handler om (basert på e-poster og kontekst)",
  "emailSummary": "Oppsummering av relevant e-postkorrespondanse — nevn spesifikke navn, beløp og datoer",
  "keyTopics": ["Tema 1 å ta opp", "Tema 2", "Tema 3"],
  "openQuestions": ["Spørsmål å stille", "Avklaring som trengs"]
}`

    try {
      const response = await createMessageWithRetry({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      })

      const rawText =
        response.content[0].type === 'text' ? response.content[0].text : '{}'
      const jsonStr = rawText
        .replace(/^```json?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim()

      let parsed: any = {}
      try {
        parsed = JSON.parse(jsonStr)
      } catch {
        parsed = { agendaSummary: rawText.slice(0, 500) }
      }

      const prepData = {
        agendaSummary: parsed.agendaSummary || null,
        emailSummary: parsed.emailSummary || null,
        keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : null,
        openQuestions: Array.isArray(parsed.openQuestions)
          ? parsed.openQuestions
          : null,
        relatedEmailIds: currentEmailIds,
        relatedTaskIds: relatedTasks.map((t) => t.id),
        generatedAt: new Date(),
      }

      if (existingPrep) {
        await prisma.meetingPrep.update({
          where: { id: existingPrep.id },
          data: prepData,
        })
        result.updated++
      } else {
        await prisma.meetingPrep.create({
          data: {
            meetingId: meeting.id,
            userId,
            ...prepData,
          },
        })
        result.generated++
      }
    } catch (err) {
      console.error(`Meeting prep failed for ${meeting.id}:`, err)
    }
  }

  return result
}
