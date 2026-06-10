/**
 * AI Email Classifier
 *
 * Analyzes unprocessed emails and:
 * 1. Classifies them (action needed, FYI, noise)
 * 2. Matches them to projects
 * 3. Detects reply status
 * 4. Suggests new projects when unmatched
 *
 * Task suggestions are handled by the briefing generator (Opus),
 * which sees all emails holistically for better quality suggestions.
 */

import { prisma } from '@/lib/prisma'
import { createMessageWithRetry } from './anthropic'
import { logAiCall } from './log'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClassificationResult {
  actionNeeded: boolean
  actionDescription: string | null
  summary: string
  replyStatus: 'needs_reply' | 'no_reply_needed' | 'awaiting_reply'
  suggestedProjectCode: string | null
  suggestedNewProject: string | null
  suggestedSearchTerms: string[] | null
  suggestedContacts: string[] | null
  isPrivate: boolean
  confidence: number
}

// ---------------------------------------------------------------------------
// Classify a batch of emails
// ---------------------------------------------------------------------------

export async function classifyEmails(userId: string): Promise<{
  processed: number
  suggestionsCreated: number
}> {
  const result = { processed: 0, suggestionsCreated: 0 }

  // Get user's projects for matching
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      shortCode: true,
      searchTerms: true,
      byggherre: true,
      emailMonitors: { select: { emailAddress: true } },
    },
  })

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const emails = await prisma.email.findMany({
    where: {
      userId,
      aiProcessedAt: null,
      noiseScore: { lt: 40 },
      receivedAt: { gte: sevenDaysAgo },
    },
    orderBy: { receivedAt: 'desc' },
    take: 20,
  })

  if (emails.length === 0) return result

  // Ensure "Generelt" and "Privat" fallback projects exist
  const projectSelect = {
    id: true,
    name: true,
    shortCode: true,
    searchTerms: true,
    byggherre: true,
    emailMonitors: { select: { emailAddress: true } as const },
  }

  let generalProject = projects.find(
    (p) => p.shortCode === 'GEN' || p.name === 'Generelt'
  )
  if (!generalProject) {
    const created = await prisma.project.create({
      data: {
        name: 'Generelt',
        shortCode: 'GEN',
        searchTerms: [],
        excludeTerms: [],
        creator: { connect: { id: userId } },
        members: { create: { userId, role: 'owner' } },
      },
      select: projectSelect,
    })
    generalProject = created
    projects.push(created)
  }

  let privatProject = projects.find(
    (p) => p.shortCode === 'PRIVAT' || p.name === 'Privat'
  )
  if (!privatProject) {
    const created = await prisma.project.create({
      data: {
        name: 'Privat',
        shortCode: 'PRIVAT',
        searchTerms: [],
        excludeTerms: [],
        creator: { connect: { id: userId } },
        members: { create: { userId, role: 'owner' } },
      },
      select: projectSelect,
    })
    privatProject = created
    projects.push(created)
  }

  // Build project context for AI
  const projectContext = projects
    .map((p) => {
      const monitors = p.emailMonitors.map((m) => m.emailAddress).join(', ')
      const terms = p.searchTerms.join(', ')
      return `- ${p.shortCode || p.name} (ID: ${p.id}): ${p.name}${p.byggherre ? `, byggherre: ${p.byggherre}` : ''}${terms ? `, søkeord: ${terms}` : ''}${monitors ? `, kontakter: ${monitors}` : ''}`
    })
    .join('\n')

  // ---------------------------------------------------------------------------
  // Helper: score-match an email against projects (no DB calls)
  // ---------------------------------------------------------------------------
  function scoreMatchProject(email: { subject: string | null; bodyPreview: string | null; senderEmail: string | null }) {
    const subjectLower = (email.subject || '').toLowerCase()
    const bodyLower = (email.bodyPreview || '').toLowerCase()
    const senderLower = (email.senderEmail || '').toLowerCase()

    let bestScore = 0
    let bestProjectId: string | null = null

    for (const p of projects) {
      if (p.shortCode === 'GEN' || p.shortCode === 'PRIVAT') continue
      let score = 0
      if (subjectLower.includes(p.name.toLowerCase())) score += 0.8
      if (p.emailMonitors.some((m) => m.emailAddress.toLowerCase() === senderLower)) score += 0.6
      if (p.byggherre && (subjectLower.includes(p.byggherre.toLowerCase()) || bodyLower.includes(p.byggherre.toLowerCase()))) score += 0.5
      for (const term of p.searchTerms) {
        const termLower = term.toLowerCase()
        if (subjectLower.includes(termLower)) score += 0.6
        else if (bodyLower.includes(termLower)) score += 0.3
      }
      if (score > bestScore) { bestScore = score; bestProjectId = p.id }
    }
    return bestScore >= 0.5 && bestProjectId ? { id: bestProjectId, score: bestScore } : null
  }

  // ---------------------------------------------------------------------------
  // Process emails sequentially with rate-limit handling
  // ---------------------------------------------------------------------------
  const suggestedNewProjects = new Set<string>()
  let totalInputTokens = 0
  let totalOutputTokens = 0

  // Helper: wait ms
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  async function processEmail(email: typeof emails[0]) {
    // ConversationId arv
    let matchedProjectId: string | null = null

    if (email.conversationId) {
      const threadMatch = await prisma.email.findFirst({
        where: { userId, conversationId: email.conversationId, projectId: { not: null }, id: { not: email.id } },
        select: { projectId: true },
        orderBy: { receivedAt: 'desc' },
      })
      if (threadMatch?.projectId) matchedProjectId = threadMatch.projectId
    }

    // Scoring-basert matching
    if (!matchedProjectId) {
      const scoreMatch = scoreMatchProject(email)
      if (scoreMatch) matchedProjectId = scoreMatch.id
    }

    // AI-klassifisering
    const classification = await classifySingleEmail(email, projectContext)
    if (classification._usage) {
      totalInputTokens += classification._usage.input
      totalOutputTokens += classification._usage.output
    }

    // Foreslå nytt prosjekt FØRST (før AI-kode-matching som kan matche GEN/PRIVAT)
    if (!matchedProjectId && classification.suggestedNewProject && !classification.isPrivate) {
      const projName = classification.suggestedNewProject
      if (!suggestedNewProjects.has(projName.toLowerCase())) {
        suggestedNewProjects.add(projName.toLowerCase())
        const existing = await prisma.aiSuggestion.findFirst({
          where: { suggestionType: 'new_project', title: projName, status: 'pending' },
        })
        if (!existing) {
          await prisma.aiSuggestion.create({
            data: {
              projectId: generalProject!.id,
              suggestionType: 'new_project',
              title: projName,
              details: {
                reason: `Detektert fra e-post: "${email.subject}"`,
                sender: email.senderName || email.senderEmail,
                suggestedSearchTerms: classification.suggestedSearchTerms || [projName],
                suggestedContacts: classification.suggestedContacts || [],
              },
              sourceEmailId: email.id,
              sourceEmailSubject: email.subject,
              status: 'pending',
            },
          })
          result.suggestionsCreated++
        }
      }
    }

    // AI-forslag som fallback for prosjektmatching (skip GEN/PRIVAT)
    if (!matchedProjectId && classification.suggestedProjectCode) {
      const match = projects.find(
        (p) =>
          p.shortCode !== 'GEN' &&
          p.shortCode !== 'PRIVAT' &&
          (p.shortCode?.toLowerCase() === classification.suggestedProjectCode?.toLowerCase() ||
           p.name.toLowerCase().includes(classification.suggestedProjectCode!.toLowerCase()))
      )
      if (match) matchedProjectId = match.id
    }

    // Update email
    await prisma.email.update({
      where: { id: email.id },
      data: {
        projectId: matchedProjectId,
        aiSummary: classification.summary,
        aiActionNeeded: classification.actionNeeded,
        aiActionDesc: classification.actionDescription,
        replyStatus: classification.replyStatus,
        projectMatchScore: matchedProjectId ? classification.confidence : null,
        aiProcessedAt: new Date(),
      },
    })

    // Task suggestions are now handled by the briefing generator (Opus),
    // which sees all emails holistically and creates deduplicated, prioritized suggestions.

    result.processed++
  }

  // Process with bounded concurrency + per-email rate-limit retry.
  // Sequential was safe but slow (one Sonnet call at a time); a small pool
  // cuts wall-clock time ~CONCURRENCY-fold while still backing off on 429.
  const CONCURRENCY = 4

  async function processWithRetry(email: typeof emails[0]) {
    try {
      await processEmail(email)
    } catch (err: any) {
      if (err?.status === 429) {
        // Rate limited — wait 15s and retry once
        console.log('Rate limited, waiting 15s...')
        await wait(15000)
        try {
          await processEmail(email)
        } catch (retryErr) {
          console.error('Failed after retry:', retryErr)
        }
      } else {
        console.error(`Failed to classify email ${email.id}:`, err)
      }
    }
  }

  // Worker pool: each worker pulls the next email off a shared cursor.
  // The cursor read-and-increment is synchronous (no await between), so it is
  // race-safe in single-threaded Node.
  let cursor = 0
  async function worker() {
    while (cursor < emails.length) {
      const email = emails[cursor++]
      await processWithRetry(email)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, emails.length) }, worker)
  )

  // Log the batch (with cost calculation + monthly usage update)
  if (totalInputTokens > 0 || totalOutputTokens > 0) {
    await logAiCall({
      userId,
      purpose: 'email_classification',
      model: 'claude-sonnet-4-6',
      promptTokens: totalInputTokens,
      completionTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      durationMs: 0,
      status: 'success',
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Classify a single email via AI
// ---------------------------------------------------------------------------

async function classifySingleEmail(
  email: {
    subject: string | null
    bodyPreview: string | null
    bodyText: string | null
    senderEmail: string | null
    senderName: string | null
    direction: string | null
    hasAttachments: boolean
    importance: string | null
  },
  projectContext: string
): Promise<ClassificationResult & { _usage?: { input: number; output: number } }> {
  const prompt = `Analyser denne e-posten for en byggeprosjektleder. Svar med BARE JSON.

E-POST:
Fra: ${email.senderName || 'ukjent'} <${email.senderEmail || 'ukjent'}>
Emne: ${email.subject || '(ingen)'}
Retning: ${email.direction === 'outbound' ? 'SENDT av bruker' : 'MOTTATT'}
Vedlegg: ${email.hasAttachments ? 'Ja' : 'Nei'}
Viktighet: ${email.importance || 'normal'}
Innhold: ${(email.bodyText || email.bodyPreview || '').slice(0, 2000)}

BRUKERENS PROSJEKTER:
${projectContext || 'Ingen prosjekter registrert'}

Svar med JSON:
{
  "actionNeeded": true/false,
  "actionDescription": "Hva må gjøres (eller null)",
  "summary": "1-2 setninger oppsummering",
  "replyStatus": "needs_reply" | "no_reply_needed" | "awaiting_reply",
  "suggestedProjectCode": "prosjektkode fra listen, eller null",
  "suggestedNewProject": "Foreslått prosjektnavn, eller null",
  "suggestedSearchTerms": ["søkeord1", "søkeord2"] eller null,
  "suggestedContacts": ["Navn <epost>", "Navn <epost>"] eller null,
  "isPrivate": true/false,
  "confidence": 0.0-1.0
}

Regler:
- UTGÅENDE e-poster (SENDT av bruker): "actionNeeded" skal ALLTID være false — brukeren har allerede handlet. Sett "replyStatus" til "awaiting_reply" hvis det ventes svar, ellers "no_reply_needed".
- "needs_reply": e-posten stiller spørsmål eller ber om noe
- "awaiting_reply": bruker har sendt noe og venter på svar
- "no_reply_needed": informasjon, bekreftelse, eller allerede besvart
- Kun "actionNeeded" for MOTTATTE e-poster som krever konkret handling (ikke bare lesing)
- "suggestedProjectCode": Forsøk å matche til et EKSISTERENDE prosjekt fra listen. Bruk prosjektkoden. Bruk "GEN" eller "PRIVAT" KUN for e-poster som ikke tilhører et spesifikt prosjekt.
- "suggestedNewProject": Hvis e-posten tydelig handler om et byggeprosjekt, eiendom, eller spesifikt oppdrag som IKKE finnes i prosjektlisten — foreslå et nytt prosjektnavn. Bruk stedsnavn, adresse eller prosjektnavn fra e-posten. Sett suggestedProjectCode til null i dette tilfellet.
- "suggestedSearchTerms": Når du foreslår nytt prosjekt — inkluder 3-6 søkeord som vil matche fremtidige e-poster for dette prosjektet. Bruk stedsnavn, adresser, firmanavn, prosjektnummer, aktørnavn etc. fra e-posten.
- "suggestedContacts": Når du foreslår nytt prosjekt — list alle relevante kontaktpersoner nevnt i e-posten som "Fullt Navn <epost@adresse>". Inkluder avsender og eventuelle personer nevnt i innholdet.
- Match prosjekt basert på innhold, avsender, emne, og prosjektenes søkeord/kontakter
- "isPrivate": true hvis e-posten er tydelig privat (familie, helse, personlig økonomi, fritid etc.), false for jobb-relatert`

  const response = await createMessageWithRetry({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '{}'

  const _usage = {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0,
  }

  try {
    const jsonStr = rawText
      .replace(/^```json?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()
    return { ...JSON.parse(jsonStr), _usage }
  } catch {
    return {
      actionNeeded: false,
      actionDescription: null,
      summary: rawText.slice(0, 200),
      replyStatus: 'no_reply_needed',
      suggestedProjectCode: null,
      suggestedNewProject: null,
      suggestedSearchTerms: null,
      suggestedContacts: null,
      isPrivate: false,
      confidence: 0,
      _usage,
    }
  }
}
