/**
 * Generate or update a daily briefing from synced emails, tasks, and meetings.
 *
 * First call of the day: generates a full morning briefing.
 * Subsequent calls: generates a delta-update that compares current state
 * against the existing briefing, highlighting what changed.
 */

import { prisma } from '@/lib/prisma'
import { createMessageWithRetry } from '@/lib/ai/anthropic'
import { logAiCall } from '@/lib/ai/log'

export interface BriefingResult {
  briefingId: string
  summary: string
  meetingsToday: number
  overdueTasks: number
  unansweredEmails: number
  emailsReceived24h: number
  isUpdate: boolean
  briefingsUsed: number
  briefingsLimit: number
}

// ---------------------------------------------------------------------------
// Shared: fetch current state
// ---------------------------------------------------------------------------

async function fetchCurrentState(userId: string) {
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  // 7 days back to capture weekly context (like the Cowork assistant)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twoDaysAhead = new Date(today)
  twoDaysAhead.setDate(twoDaysAhead.getDate() + 2)

  const [
    recentEmails,
    todayMeetings,
    openTasks,
    overdueTasks,
    unansweredEmails,
    upcomingDeadlines,
    projects,
    activeReminders,
  ] = await Promise.all([
    // Last 7 days of emails (non-noise) — more context for Opus
    prisma.email.findMany({
      where: {
        userId,
        receivedAt: { gte: weekAgo },
        noiseScore: { lt: 40 },
      },
      orderBy: { receivedAt: 'desc' },
      take: 80,
      select: {
        subject: true,
        senderName: true,
        senderEmail: true,
        bodyPreview: true,
        bodyText: true,
        direction: true,
        importance: true,
        hasAttachments: true,
        receivedAt: true,
        replyStatus: true,
        aiSummary: true,
        aiActionNeeded: true,
        aiActionDesc: true,
        project: { select: { name: true, shortCode: true, byggherre: true } },
      },
    }),
    prisma.meeting.findMany({
      where: {
        userId,
        startsAt: { gte: today, lt: tomorrow },
        status: { not: 'cancelled' },
      },
      orderBy: { startsAt: 'asc' },
      select: {
        subject: true,
        startsAt: true,
        endsAt: true,
        location: true,
        isOnline: true,
        organizerName: true,
        project: { select: { name: true, shortCode: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        project: { members: { some: { userId } } },
        status: { in: ['apen', 'sendt', 'mottatt'] },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      take: 30,
      select: {
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        assignee: true,
        completedAt: true,
        project: { select: { name: true, shortCode: true } },
      },
    }),
    prisma.task.count({
      where: {
        project: { members: { some: { userId } } },
        status: { notIn: ['utfort', 'lukket'] },
        dueDate: { lt: now },
      },
    }),
    prisma.email.count({
      where: {
        userId,
        direction: 'inbound',
        noiseScore: { lt: 40 },
        replyStatus: { in: ['needs_reply', 'awaiting_reply'] },
      },
    }),
    // Tasks with deadlines in next 2 days
    prisma.task.findMany({
      where: {
        project: { members: { some: { userId } } },
        status: { notIn: ['utfort', 'lukket'] },
        dueDate: { gte: today, lt: twoDaysAhead },
      },
      select: {
        title: true,
        dueDate: true,
        priority: true,
        assignee: true,
        project: { select: { name: true, shortCode: true } },
      },
    }),
    // All user projects with key info
    prisma.project.findMany({
      where: { members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        shortCode: true,
        byggherre: true,
        emailMonitors: { select: { emailAddress: true, displayName: true } },
      },
    }),
    // Active reminders (today and overdue)
    prisma.reminder.findMany({
      where: {
        userId,
        completed: false,
        remindAt: { lte: tomorrow },
      },
      orderBy: { remindAt: 'asc' },
    }),
  ])

  return {
    now,
    today,
    recentEmails,
    todayMeetings,
    openTasks,
    overdueTasks,
    unansweredEmails,
    upcomingDeadlines,
    projects,
    activeReminders,
  }
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatEmails(emails: any[]): string {
  return emails
    .map((e) => {
      const proj = e.project
        ? ` [${e.project.shortCode || e.project.name}]`
        : ''
      const att = e.hasAttachments ? ' (vedlegg)' : ''
      return `- ${e.direction === 'outbound' ? 'SENDT' : 'MOTTATT'}: "${e.subject}" fra ${e.senderName || e.senderEmail}${proj}${att} — ${e.bodyPreview?.slice(0, 120)}`
    })
    .join('\n')
}

function formatMeetings(meetings: any[]): string {
  return meetings
    .map((m) => {
      const time = m.startsAt.toLocaleTimeString('nb-NO', {
        hour: '2-digit',
        minute: '2-digit',
      })
      const endTime = m.endsAt.toLocaleTimeString('nb-NO', {
        hour: '2-digit',
        minute: '2-digit',
      })
      const loc = m.isOnline ? 'Teams' : m.location || 'ukjent sted'
      const proj = m.project
        ? ` [${m.project.shortCode || m.project.name}]`
        : ''
      return `- ${time}-${endTime}: ${m.subject || 'Uten tittel'} (${loc})${proj} — Arrangør: ${m.organizerName || 'ukjent'}`
    })
    .join('\n')
}

function formatTasks(tasks: any[]): string {
  return tasks
    .map((t) => {
      const due = t.dueDate
        ? ` (frist: ${t.dueDate.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })})`
        : ''
      const proj = t.project
        ? ` [${t.project.shortCode || t.project.name}]`
        : ''
      return `- ${t.title}${proj} — ${t.status}, ${t.priority}${due}`
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// Generate: first briefing of the day
// ---------------------------------------------------------------------------

function buildInitialPrompt(state: Awaited<ReturnType<typeof fetchCurrentState>>): string {
  const { now, recentEmails, todayMeetings, openTasks, overdueTasks, unansweredEmails, upcomingDeadlines, projects, activeReminders } = state

  // Build project context
  const projectContext = projects
    .filter((p) => p.shortCode !== 'GEN' && p.shortCode !== 'PRIVAT')
    .map((p) => {
      const contacts = p.emailMonitors.map((m) => m.displayName || m.emailAddress).join(', ')
      return `- ${p.shortCode || p.name}: ${p.name}${p.byggherre ? ` (Byggherre: ${p.byggherre})` : ''}${contacts ? ` — Kontakter: ${contacts}` : ''}`
    })
    .join('\n')

  // Group emails by project with FULL content
  const emailsByProject = new Map<string, typeof recentEmails>()
  for (const e of recentEmails) {
    const proj = e.project?.shortCode || e.project?.name || 'Ukategorisert'
    if (!emailsByProject.has(proj)) emailsByProject.set(proj, [])
    emailsByProject.get(proj)!.push(e)
  }

  const projectSections = Array.from(emailsByProject.entries())
    .map(([proj, emails]) => {
      const byggherre = emails[0]?.project?.byggherre
      const header = byggherre ? `[${proj}] (${byggherre})` : `[${proj}]`
      const emailList = emails
        .map((e) => {
          const dir = e.direction === 'outbound' ? 'SENDT' : 'MOTTATT'
          const att = e.hasAttachments ? ' 📎' : ''
          const reply = e.replyStatus === 'needs_reply' ? ' ⚠TRENGER_SVAR' : e.replyStatus === 'awaiting_reply' ? ' ⏳VENTER_SVAR' : ''
          const date = e.receivedAt ? e.receivedAt.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : ''
          const body = (e.bodyText || e.bodyPreview || '').slice(0, 500)
          const aiNote = e.aiSummary ? `\n    AI-oppsummering: ${e.aiSummary}` : ''
          const actionNote = e.aiActionNeeded && e.aiActionDesc ? `\n    Handling: ${e.aiActionDesc}` : ''
          return `  ${dir} ${date}: "${e.subject}" — ${e.senderName || e.senderEmail}${att}${reply}\n    ${body}${aiNote}${actionNote}`
        })
        .join('\n\n')
      return `${header} — ${emails.length} e-poster siste uke\n${emailList}`
    })
    .join('\n\n---\n\n')

  // Group tasks by project
  const tasksByProject = new Map<string, typeof openTasks>()
  for (const t of openTasks) {
    const proj = t.project?.shortCode || t.project?.name || 'Ukategorisert'
    if (!tasksByProject.has(proj)) tasksByProject.set(proj, [])
    tasksByProject.get(proj)!.push(t)
  }

  const taskSections = Array.from(tasksByProject.entries())
    .map(([proj, tasks]) => {
      const taskList = tasks
        .map((t) => {
          const due = t.dueDate ? ` (frist: ${t.dueDate.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })})` : ''
          return `  - ${t.title} — ${t.status}, ${t.priority}${due}${t.assignee ? `, tildelt: ${t.assignee}` : ''}`
        })
        .join('\n')
      return `[${proj}]\n${taskList}`
    })
    .join('\n\n')

  // Format upcoming deadlines
  const deadlineList = upcomingDeadlines
    .map((t) => {
      const date = t.dueDate?.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
      const proj = t.project?.shortCode || t.project?.name || ''
      return `  - [${proj}] ${t.title} — frist: ${date} (${t.priority})`
    })
    .join('\n')

  return `Du er prosjektgjennomgangs-AI for en byggeprosjektleder i Norge. Generer en DETALJERT daglig prosjektgjennomgang på norsk (bokmål).

DATO: ${now.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

BRUKERENS PROSJEKTER:
${projectContext || 'Ingen prosjekter definert'}

STATISTIKK:
- E-poster siste uke: ${recentEmails.length}
- Møter i dag: ${todayMeetings.length}
- Åpne oppgaver: ${openTasks.length}
- Forfalte oppgaver: ${overdueTasks}
- Ubesvarte e-poster: ${unansweredEmails}
- Frister neste 2 dager: ${upcomingDeadlines.length}

===== E-POSTER PER PROSJEKT (siste 7 dager) =====
${projectSections || 'Ingen e-poster'}

===== DAGENS MØTER =====
${formatMeetings(todayMeetings) || 'Ingen møter planlagt i dag.'}

===== ÅPNE OPPGAVER PER PROSJEKT =====
${taskSections || 'Ingen åpne oppgaver'}

===== KOMMENDE FRISTER (neste 2 dager) =====
${deadlineList || 'Ingen frister de neste 2 dagene'}

===== PÅMINNELSER I DAG =====
${activeReminders.length > 0
  ? activeReminders.map((r) => {
      const time = r.remindAt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
      const rec = r.recurring ? ` (${r.recurring})` : ''
      return `- ${time}: ${r.title}${r.description ? ' — ' + r.description : ''}${rec}`
    }).join('\n')
  : 'Ingen påminnelser i dag'}

Svar med BARE JSON (ingen annen tekst):
{
  "summary": "Se format nedenfor",
  "actionItems": [
    { "key": "unik-nøkkel", "text": "Kort handlingspunkt med prosjektreferanse" }
  ],
  "taskSuggestions": [
    {
      "title": "Kort, handlingsbar oppgavetittel",
      "projectCode": "Prosjektkode fra listen (f.eks. KEA, WA, S)",
      "priority": "urgent|high|normal|low",
      "dueDate": "YYYY-MM-DD eller null",
      "description": "Kontekst: hvem, hva, hvorfor",
      "sourceEmailSubject": "Emnet på e-posten som utløste dette"
    }
  ]
}

KRAV TIL summary-FELTET — bruk dette formatet:

Start med BARE dato som overskrift, uten emojis eller ekstra titler:
# ${now.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

Deretter en kort oppsummering (2-3 setninger om dagens status). INGEN emojis i hele teksten.

Deretter EN SEKSJON PER PROSJEKT (sorter etter aktivitetsnivå, mest aktivt først):

**Prosjektnavn (Byggherre / Referanse)**
Skriv en sammenhengende analyse som dekker:
- Hva som har skjedd denne uken (spesifikke hendelser, ikke generelt)
- Hvem som er involvert (bruk navn og firma, f.eks. "Daniel Prince fra VA-visjon", "Tim Røssel bekrefter...")
- Hva som ventes / pågår (venter svar fra X, dokument under gjennomgang, etc.)
- Konkrete beløp, datoer, filnavn, stedsnavn fra e-postene
- Aksjonspunkter spesifikt for dette prosjektet
Skriv dette som sammenhengende tekst med punktlister for aksjonspunkter. IKKE bare list opp e-poster — ANALYSER og SYNTETISER informasjonen.

Etter alle prosjektseksjoner:

**Øvrig / Ukategorisert**
E-poster som ikke passer til definerte prosjekter. Kort om hva de gjelder og evt. om de bør kobles til et prosjekt.

**Påminnelser**
Brukerens egne påminnelser for i dag (hvis noen finnes). Inkluder tidspunkt og tittel.

**Huskeliste — frister neste 2 dager**
Konkrete frister med dato og hva som må gjøres.

actionItems: 8-15 konkrete, prioriterte handlingspunkter med prosjektkode. Format: "[KODE] Handlingspunkt". Prioriter etter hastegrad. Eksempler: "[SANDER] Gjennomgå Haavind-dokumenter og kontraktsanmerkninger", "[KLEVEN] Følge opp sprinkler/sanitær med Thomas Storm".

taskSuggestions: Oppgaver som bør opprettes i systemet. Opprett en for hvert konkret handlingspunkt som krever oppfølging. Bruk prosjektkoden fra BRUKERENS PROSJEKTER-listen. Ikke lag oppgaver for ting som allerede er i ÅPNE OPPGAVER-listen. Prioriter: "urgent" = haster denne uken, "high" = viktig neste uke, "normal" = bør gjøres, "low" = kan vente. Sett "dueDate" basert på frister nevnt i e-poster, ellers null.

VIKTIG:
- Bruk NAVN på personer, ikke bare "avsender"
- Inkluder spesifikke detaljer (beløp, datoer, stedsnavn, dokumentnavn)
- Analyser sammenhenger mellom e-poster i samme prosjekt
- Skriv som en erfaren prosjektleder som briefer en kollega
- Minimum 100 ord per prosjektseksjon som har aktivitet`
}

// ---------------------------------------------------------------------------
// Update: delta against existing briefing
// ---------------------------------------------------------------------------

function buildUpdatePrompt(
  existingBriefing: string,
  generatedAt: Date,
  state: Awaited<ReturnType<typeof fetchCurrentState>>
): string {
  const { now, recentEmails, todayMeetings, openTasks, overdueTasks, unansweredEmails } = state

  // Only emails received after the briefing was generated
  const newEmails = recentEmails.filter(
    (e) => e.receivedAt && new Date(e.receivedAt) > generatedAt
  )

  // Group new emails by project
  const newEmailsByProject = new Map<string, typeof newEmails>()
  for (const e of newEmails) {
    const proj = e.project?.shortCode || e.project?.name || 'Ukategorisert'
    if (!newEmailsByProject.has(proj)) newEmailsByProject.set(proj, [])
    newEmailsByProject.get(proj)!.push(e)
  }

  const newEmailSections = Array.from(newEmailsByProject.entries())
    .map(([proj, emails]) => {
      const emailList = emails
        .map((e) => {
          const dir = e.direction === 'outbound' ? 'SENDT' : 'MOTTATT'
          const att = e.hasAttachments ? ' 📎' : ''
          const reply = e.replyStatus === 'needs_reply' ? ' ⚠TRENGER_SVAR' : e.replyStatus === 'awaiting_reply' ? ' ⏳VENTER_SVAR' : ''
          const body = (e.bodyText || e.bodyPreview || '').slice(0, 400)
          return `  ${dir}: "${e.subject}" — ${e.senderName || e.senderEmail}${att}${reply}\n    ${body}`
        })
        .join('\n\n')
      return `[${proj}] (${emails.length} nye)\n${emailList}`
    })
    .join('\n\n')

  // Group tasks by project
  const tasksByProject = new Map<string, typeof openTasks>()
  for (const t of openTasks) {
    const proj = t.project?.shortCode || t.project?.name || 'Ukategorisert'
    if (!tasksByProject.has(proj)) tasksByProject.set(proj, [])
    tasksByProject.get(proj)!.push(t)
  }

  const taskSections = Array.from(tasksByProject.entries())
    .map(([proj, tasks]) => {
      const taskList = tasks
        .map((t) => {
          const due = t.dueDate ? ` (frist: ${t.dueDate.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })})` : ''
          return `  - ${t.title} — ${t.status}, ${t.priority}${due}`
        })
        .join('\n')
      return `[${proj}]\n${taskList}`
    })
    .join('\n\n')

  return `Du er en AI-assistent for en byggeprosjektleder i Norge. Du har allerede generert en daglig briefing tidligere i dag. Nå skal du oppdatere den basert på hva som har skjedd siden da.

TIDSPUNKT NÅ: ${now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
BRIEFING GENERERT: ${generatedAt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}

=== EKSISTERENDE BRIEFING ===
${existingBriefing}
=== SLUTT EKSISTERENDE BRIEFING ===

NYE E-POSTER SIDEN FORRIGE BRIEFING (${newEmails.length} stk), GRUPPERT PER PROSJEKT:
${newEmailSections || 'Ingen nye e-poster'}

OPPDATERT STATUS:
- Åpne oppgaver nå: ${openTasks.length}
- Forfalte oppgaver nå: ${overdueTasks}
- Ubesvarte e-poster nå: ${unansweredEmails}
- Møter igjen i dag: ${todayMeetings.filter((m) => m.startsAt > now).length}

OPPGAVER PER PROSJEKT (oppdatert):
${taskSections || 'Ingen åpne oppgaver'}

Svar med BARE JSON (ingen annen tekst) i dette formatet:
{
  "summary": "Oppdatert briefing-tekst. Behold den opprinnelige morgenbriefingen men FJERN alle tidligere 'Oppdatering kl.'-seksjoner. Legg til én ny '---\\n\\n**Oppdatering kl. ${now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}**' seksjon nederst, organisert per prosjekt med nye e-poster, statusendringer, gjennomførte møter. Marker utførte ting med ✓. Kun ÉN oppdateringsseksjon totalt.",
  "actionItems": [
    { "key": "unik-nøkkel", "text": "Kort handlingspunkt med prosjektreferanse" }
  ],
  "taskSuggestions": [
    {
      "title": "Kort, handlingsbar oppgavetittel",
      "projectCode": "Prosjektkode fra listen",
      "priority": "urgent|high|normal|low",
      "dueDate": "YYYY-MM-DD eller null",
      "description": "Kontekst: hvem, hva, hvorfor",
      "sourceEmailSubject": "Emnet på e-posten som utløste dette"
    }
  ]
}

actionItems: 3-8 OPPDATERTE handlingspunkter basert på nåværende situasjon. Inkluder prosjektkode. Fjern ting som er gjort, legg til nye fra nye e-poster. Bare ting som gjenstår.

taskSuggestions: OPPDATERTE oppgaveforslag. Fjern oppgaver som allerede er opprettet/utført, legg til nye fra nye e-poster. Ikke dupliser oppgaver som allerede finnes i OPPGAVER PER PROSJEKT-listen.

Vær konsis. Bare inkluder oppdateringsseksjonen i summary hvis det faktisk har skjedd noe nytt.`
}

// ---------------------------------------------------------------------------
// Pass 1: Sonnet analyses all emails thoroughly
// ---------------------------------------------------------------------------

function buildAnalysisPrompt(state: Awaited<ReturnType<typeof fetchCurrentState>>): string {
  const { now, recentEmails, projects } = state

  const projectContext = projects
    .filter((p) => p.shortCode !== 'GEN' && p.shortCode !== 'PRIVAT')
    .map((p) => `- ${p.shortCode}: ${p.name}${p.byggherre ? ` (${p.byggherre})` : ''}`)
    .join('\n')

  // Full email content grouped by project
  const emailsByProject = new Map<string, typeof recentEmails>()
  for (const e of recentEmails) {
    const proj = e.project?.shortCode || e.project?.name || 'Ukategorisert'
    if (!emailsByProject.has(proj)) emailsByProject.set(proj, [])
    emailsByProject.get(proj)!.push(e)
  }

  const emailSections = Array.from(emailsByProject.entries())
    .map(([proj, emails]) => {
      const emailList = emails
        .map((e) => {
          const dir = e.direction === 'outbound' ? 'SENDT' : 'MOTTATT'
          const date = e.receivedAt?.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) || ''
          const att = e.hasAttachments ? ' [VEDLEGG]' : ''
          const reply = e.replyStatus === 'needs_reply' ? ' [TRENGER SVAR]' : e.replyStatus === 'awaiting_reply' ? ' [VENTER SVAR]' : ''
          const body = (e.bodyText || e.bodyPreview || '').slice(0, 600)
          return `${dir} ${date}: "${e.subject}" — ${e.senderName || e.senderEmail}${att}${reply}\n${body}`
        })
        .join('\n---\n')
      return `[${proj}] (${emails.length} e-poster)\n${emailList}`
    })
    .join('\n\n=====\n\n')

  return `Du er en erfaren analytiker for en byggeprosjektleder i Norge. Les GRUNDIG gjennom alle e-postene nedenfor og skriv en DETALJERT analyse per prosjekt.

DATO: ${now.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

PROSJEKTER:
${projectContext}

E-POSTER SISTE 7 DAGER:
${emailSections}

INSTRUKSJONER — les hver e-post nøye og ekstraher:
1. HENDELSER: Hva har faktisk skjedd? Vær spesifikk — datoer, beløp, dokumentnavn, stedsnavn.
2. PERSONER: Hvem er involvert? Bruk fulle navn og firma (f.eks. "Ludvig Normann Hansen fra KEA", "Kjersti fra Griff Arkitektur").
3. STATUS: Hva venter på svar? Hva pågår? Hva er avklart?
4. HANDLINGSPUNKTER: Hva MÅ prosjektlederen gjøre? Prioriter: haster / viktig / kan vente.
5. SAMMENHENGER: Koble relaterte e-poster — f.eks. en forespørsel og et svar i samme tråd.
6. RISIKO: Er det noe som kan gå galt? Frister som nærmer seg? Ubesvarte henvendelser?

Svar med JSON — en analyse per prosjekt:
{
  "projects": [
    {
      "code": "Prosjektkode",
      "name": "Prosjektnavn",
      "emailCount": 5,
      "summary": "3-5 setningers oppsummering av status",
      "keyEvents": ["Hendelse 1 med detaljer", "Hendelse 2"],
      "people": ["Navn — rolle/firma — hva de gjør"],
      "pendingActions": ["Handling som krever respons — kontekst"],
      "risks": ["Risiko eller frist som nærmer seg"],
      "openThreads": ["E-posttråd som venter på svar — fra hvem"]
    }
  ],
  "uncategorized": "Kort om e-poster som ikke passer prosjekter"
}

VIKTIG: Ikke hopp over detaljer. Beløp, datoer, adresser, dokumentnavn, kontaktinfo — alt er relevant for prosjektlederen. Skriv på norsk.`
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const ANALYSIS_MODEL = 'claude-sonnet-4-6'   // Pass 1: reads all emails, fast
const BRIEFING_MODEL = 'claude-opus-4-6'      // Pass 2: writes briefing from summaries
const BRIEFING_MONTHLY_LIMIT = 30

export async function generateBriefing(userId: string): Promise<BriefingResult> {
  const state = await fetchCurrentState(userId)
  const { now, today, todayMeetings, overdueTasks, unansweredEmails, recentEmails, projects } = state

  // Check monthly usage limit
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const briefingCallsThisMonth = await prisma.aiCallLog.count({
    where: {
      userId,
      purpose: { in: ['daily_briefing', 'briefing_update'] },
      model: { in: [BRIEFING_MODEL, ANALYSIS_MODEL] },
      createdAt: { gte: monthStart, lt: monthEnd },
    },
  })

  if (briefingCallsThisMonth >= BRIEFING_MONTHLY_LIMIT) {
    throw new Error(`Månedlig grense nådd (${BRIEFING_MONTHLY_LIMIT} briefinger). Nullstilles ${monthEnd.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })}.`)
  }

  // Check if a briefing already exists for today
  const existingBriefing = await prisma.dailyBriefing.findUnique({
    where: {
      userId_briefingDate: { userId, briefingDate: today },
    },
  })

  const isUpdate = !!(existingBriefing?.summary && existingBriefing?.generatedAt)

  let response: Awaited<ReturnType<typeof createMessageWithRetry>>

  if (isUpdate) {
    // Updates go straight to Opus (smaller prompt — only new emails)
    const prompt = buildUpdatePrompt(
      existingBriefing!.summary!,
      existingBriefing!.generatedAt!,
      state
    )
    response = await createMessageWithRetry(
      { model: BRIEFING_MODEL, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] },
      { timeoutMs: 120_000 }
    )
  } else {
    // --- Pass 1: Sonnet reads ALL emails and extracts structured analysis ---
    console.log(`Briefing pass 1: Sonnet analyserer ${recentEmails.length} e-poster...`)
    const analysisPrompt = buildAnalysisPrompt(state)
    const analysisResponse = await createMessageWithRetry(
      { model: ANALYSIS_MODEL, max_tokens: 4000, messages: [{ role: 'user', content: analysisPrompt }] },
      { timeoutMs: 60_000 }
    )
    const analysisText = analysisResponse.content[0].type === 'text'
      ? analysisResponse.content[0].text : '{}'

    // Log the analysis call
    await logAiCall({
      userId,
      purpose: 'briefing_analysis',
      model: ANALYSIS_MODEL,
      promptTokens: analysisResponse.usage.input_tokens,
      completionTokens: analysisResponse.usage.output_tokens,
      totalTokens: analysisResponse.usage.input_tokens + analysisResponse.usage.output_tokens,
      durationMs: 0,
      status: 'success',
    })

    // --- Pass 2: Opus writes the briefing from Sonnet's analysis ---
    console.log('Briefing pass 2: Opus skriver briefing fra analyse...')
    const briefingPrompt = buildInitialPrompt(state).replace(
      /===== E-POSTER PER PROSJEKT \(siste 7 dager\) =====\n[\s\S]*?(?=\n===== DAGENS MØTER =====)/,
      `===== SONNET-ANALYSE AV E-POSTER (siste 7 dager) =====\n${analysisText}\n\n`
    )

    response = await createMessageWithRetry(
      { model: BRIEFING_MODEL, max_tokens: 8000, messages: [{ role: 'user', content: briefingPrompt }] },
      { timeoutMs: 120_000 }
    )
  }

  const rawText =
    response.content[0].type === 'text'
      ? response.content[0].text
      : '{}'

  // Parse structured JSON response
  let summary = 'Kunne ikke generere briefing'
  let actionItems: { key: string; text: string }[] = []
  let taskSuggestions: {
    title: string
    projectCode: string | null
    priority: string
    dueDate: string | null
    description: string | null
    sourceEmailSubject: string | null
  }[] = []

  try {
    // Strip markdown code fences if present
    const jsonStr = rawText.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    const parsed = JSON.parse(jsonStr)
    summary = parsed.summary || summary
    actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : []
    taskSuggestions = Array.isArray(parsed.taskSuggestions) ? parsed.taskSuggestions : []
  } catch {
    // If JSON parsing fails, use raw text as summary
    summary = rawText
    console.warn('Briefing AI response was not valid JSON, using raw text')
  }

  // Sync action items to briefing_priorities table
  // Delete old ones for today, then insert fresh
  await prisma.briefingPriority.deleteMany({
    where: { userId, briefingDate: today },
  })

  if (actionItems.length > 0) {
    await prisma.briefingPriority.createMany({
      data: actionItems.map((item) => ({
        userId,
        briefingDate: today,
        itemKey: item.key || item.text.slice(0, 40),
        itemText: item.text,
        status: 'open',
      })),
    })
  }

  // Create task suggestions from Opus analysis
  if (taskSuggestions.length > 0) {
    // Find fallback project (Generelt)
    const generalProject = projects.find(
      (p) => p.shortCode === 'GEN' || p.name === 'Generelt'
    )

    // Delete previous briefing-sourced suggestions (pending only) to avoid duplicates
    if (generalProject) {
      await prisma.aiSuggestion.deleteMany({
        where: {
          status: 'pending',
          suggestionType: 'new_task',
          details: { path: ['source'], equals: 'briefing' },
        },
      })
    }

    for (const suggestion of taskSuggestions) {
      if (!suggestion.title) continue

      // Match projectCode to actual project
      let targetProjectId: string | null = null
      if (suggestion.projectCode) {
        const match = projects.find(
          (p) =>
            p.shortCode?.toLowerCase() === suggestion.projectCode?.toLowerCase() ||
            p.name.toLowerCase().includes(suggestion.projectCode!.toLowerCase())
        )
        if (match) targetProjectId = match.id
      }

      // Fallback to Generelt
      if (!targetProjectId && generalProject) {
        targetProjectId = generalProject.id
      }

      if (!targetProjectId) continue

      // Check for existing suggestion with same title to avoid duplicates
      const existing = await prisma.aiSuggestion.findFirst({
        where: {
          projectId: targetProjectId,
          title: suggestion.title,
          status: 'pending',
        },
      })
      if (existing) continue

      await prisma.aiSuggestion.create({
        data: {
          projectId: targetProjectId,
          suggestionType: 'new_task',
          title: suggestion.title,
          details: {
            description: suggestion.description,
            priority: suggestion.priority || 'normal',
            dueDate: suggestion.dueDate,
            source: 'briefing',
            emailSubject: suggestion.sourceEmailSubject,
          },
          sourceEmailSubject: suggestion.sourceEmailSubject,
          status: 'pending',
        },
      })
    }
  }

  // Upsert the daily briefing
  const briefing = await prisma.dailyBriefing.upsert({
    where: {
      userId_briefingDate: { userId, briefingDate: today },
    },
    update: {
      summary,
      meetingsToday: todayMeetings.length,
      overdueTasks,
      unansweredEmails,
      emailsReceived24h: recentEmails.length,
      meetingsList: todayMeetings.map((m) => ({
        subject: m.subject,
        startsAt: m.startsAt,
        location: m.location,
      })),
      // Only update generatedAt on first creation — keep original timestamp
      // so delta updates know what's "new"
      ...(isUpdate ? {} : { generatedAt: now }),
    },
    create: {
      userId,
      briefingDate: today,
      summary,
      meetingsToday: todayMeetings.length,
      overdueTasks,
      unansweredEmails,
      emailsReceived24h: recentEmails.length,
      meetingsList: todayMeetings.map((m) => ({
        subject: m.subject,
        startsAt: m.startsAt,
        location: m.location,
      })),
      generatedAt: now,
    },
  })

  // Log the AI call (with cost calculation + monthly usage update)
  await logAiCall({
    userId,
    purpose: isUpdate ? 'briefing_update' : 'daily_briefing',
    model: BRIEFING_MODEL,
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
    totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    durationMs: 0,
    status: 'success',
  })

  return {
    briefingId: briefing.id,
    summary,
    meetingsToday: todayMeetings.length,
    overdueTasks,
    unansweredEmails,
    emailsReceived24h: recentEmails.length,
    isUpdate,
    briefingsUsed: briefingCallsThisMonth + 1,
    briefingsLimit: BRIEFING_MONTHLY_LIMIT,
  }
}
