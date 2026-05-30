/**
 * Reply Suggestion Generator
 *
 * For emails that need replies, generates AI-drafted response suggestions
 * tailored to the construction project context.
 */

import { prisma } from '@/lib/prisma'
import { getAnthropicClient } from './anthropic'

export interface ReplySuggestionResult {
  generated: number
  skipped: number
}

export async function generateReplySuggestions(
  userId: string
): Promise<ReplySuggestionResult> {
  const result: ReplySuggestionResult = { generated: 0, skipped: 0 }

  // Find emails that need replies and don't have suggestions yet
  const emails = await prisma.email.findMany({
    where: {
      userId,
      replyStatus: 'needs_reply',
      direction: 'inbound',
      noiseScore: { lt: 30 },
      aiProcessedAt: { not: null },
      replySuggestions: { none: {} }, // No existing suggestions
    },
    orderBy: { receivedAt: 'desc' },
    take: 5, // Max 5 per run to control costs
    include: {
      project: {
        select: { id: true, name: true, shortCode: true },
      },
    },
  })

  if (emails.length === 0) return result

  const anthropic = getAnthropicClient()

  for (const email of emails) {
    // Get conversation history for context
    const conversationEmails = email.conversationId
      ? await prisma.email.findMany({
          where: {
            userId,
            conversationId: email.conversationId,
          },
          orderBy: { receivedAt: 'asc' },
          take: 5,
          select: {
            subject: true,
            senderName: true,
            senderEmail: true,
            bodyPreview: true,
            direction: true,
            receivedAt: true,
          },
        })
      : []

    // Get related tasks for context
    const relatedTasks = email.projectId
      ? await prisma.task.findMany({
          where: {
            projectId: email.projectId,
            status: { notIn: ['lukket'] },
          },
          take: 5,
          select: { title: true, status: true, priority: true },
        })
      : []

    const threadContext = conversationEmails
      .map(
        (e) =>
          `[${e.direction === 'outbound' ? 'DU' : e.senderName || e.senderEmail}]: ${e.bodyPreview?.slice(0, 200)}`
      )
      .join('\n\n')

    const taskContext = relatedTasks
      .map((t) => `- ${t.title} (${t.status})`)
      .join('\n')

    const prompt = `Du er en AI-assistent som hjelper en byggeprosjektleder med å svare på e-poster. Skriv et profesjonelt svarutkast på norsk (bokmål).

E-POST SOM SKAL BESVARES:
Fra: ${email.senderName || 'ukjent'} <${email.senderEmail}>
Emne: ${email.subject}
${email.project ? `Prosjekt: ${email.project.shortCode || email.project.name}` : ''}
Innhold: ${(email.bodyText || email.bodyPreview || '').slice(0, 2000)}

${threadContext ? `TRÅD-HISTORIKK:\n${threadContext}` : ''}
${taskContext ? `RELATERTE OPPGAVER:\n${taskContext}` : ''}

Svar med BARE JSON:
{
  "draftSubject": "Re: opprinnelig emne",
  "draftBody": "Selve svarteksten. Profesjonell men vennlig tone. Bruk 'Hei [navn]' som hilsen. Signer med 'Med vennlig hilsen'. Vær konkret og handlingsorientert.",
  "tone": "professional|friendly|formal",
  "confidence": 0.0-1.0
}

Regler:
- Svar direkte på spørsmål i e-posten
- Hvis det refereres til vedlegg, nevn at du har mottatt dem
- Hvis det trengs avklaring, still konkrete spørsmål
- Bruk byggfaglige uttrykk der relevant
- Hold svaret kort og profesjonelt (max 150 ord)`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
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
        result.skipped++
        continue
      }

      await prisma.replySuggestion.create({
        data: {
          emailId: email.id,
          userId,
          projectId: email.projectId,
          draftSubject: parsed.draftSubject || `Re: ${email.subject}`,
          draftBody: parsed.draftBody || null,
          tone: parsed.tone || 'professional',
          confidence: parsed.confidence || 0.5,
          status: 'suggested',
        },
      })

      result.generated++
    } catch (err) {
      console.error(`Reply suggestion failed for ${email.id}:`, err)
      result.skipped++
    }
  }

  return result
}
