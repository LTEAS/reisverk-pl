import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

/**
 * Build the full system prompt for the AI assistant, personalized
 * for the current user and their live data.
 */
export async function buildSystemPrompt(userId: string): Promise<string> {
  // Fetch user profile
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true },
  });

  // Fetch projects the user belongs to
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          shortCode: true,
          byggherre: true,
        },
      },
    },
  });

  const projects = memberships.map((m) => m.project);
  const projectIds = projects.map((p) => p.id);

  // Count open tasks per project + overdue
  const now = new Date();
  const openTasks = await prisma.task.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: projectIds },
      status: { in: ["apen", "sendt", "mottatt", "signert"] },
    },
    _count: { id: true },
  });

  const overdueTasks = await prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      status: { in: ["apen", "sendt", "mottatt", "signert"] },
      dueDate: { lt: now },
    },
    select: {
      id: true,
      title: true,
      taskNumber: true,
      dueDate: true,
      project: { select: { shortCode: true } },
    },
    take: 10,
  });

  // Today's meetings
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayMeetings = await prisma.meeting.findMany({
    where: {
      userId,
      startsAt: { gte: todayStart, lte: todayEnd },
    },
    orderBy: { startsAt: "asc" },
    select: {
      subject: true,
      startsAt: true,
      endsAt: true,
      location: true,
      project: { select: { name: true } },
    },
  });

  // Memory index
  const memories = await prisma.memory.findMany({
    where: { userId },
    select: { name: true, type: true, description: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  // -----------------------------------------------------------------------
  // Assemble prompt
  // -----------------------------------------------------------------------

  const todayStr = format(now, "EEEE d. MMMM yyyy", { locale: nb });
  const userName = profile?.displayName ?? profile?.email ?? "bruker";

  const projectLines = projects
    .map((p) => {
      const count =
        openTasks.find((t) => t.projectId === p.id)?._count.id ?? 0;
      return `  - ${p.name} (${p.shortCode ?? "?"}) — byggherre: ${p.byggherre ?? "ukjent"} — ${count} åpne oppgaver [id: ${p.id}]`;
    })
    .join("\n");

  const overdueLines =
    overdueTasks.length > 0
      ? overdueTasks
          .map(
            (t) =>
              `  - [${t.project.shortCode}] #${t.taskNumber}: ${t.title} (frist: ${t.dueDate ? format(t.dueDate, "d. MMM", { locale: nb }) : "?"})`
          )
          .join("\n")
      : "  Ingen forfalte oppgaver.";

  const meetingLines =
    todayMeetings.length > 0
      ? todayMeetings
          .map(
            (m) =>
              `  - ${format(m.startsAt, "HH:mm")}–${format(m.endsAt, "HH:mm")}: ${m.subject ?? "Uten tittel"}${m.project ? ` (${m.project.name})` : ""}${m.location ? ` — ${m.location}` : ""}`
          )
          .join("\n")
      : "  Ingen møter i dag.";

  const memoryLines =
    memories.length > 0
      ? memories
          .map((m) => `  - [${m.type}] ${m.name}: ${m.description}`)
          .join("\n")
      : "  Ingen lagrede minner.";

  return `Du er en AI-assistent for prosjektoppfølging i byggebransjen. Du hjelper prosjektledere med å holde oversikt over oppgaver, e-post, møter og prosjektstatus.

Bruker: ${userName}
Dato i dag: ${todayStr}

## Brukerens prosjekter
${projectLines || "  Ingen prosjekter."}

## Forfalte oppgaver
${overdueLines}

## Møter i dag
${meetingLines}

## Lagrede minner (kontekst fra tidligere samtaler)
${memoryLines}

## Formatering
- Svar alltid på norsk (bokmål).
- ALDRI bruk emojis. Ingen emojis overhodet.
- Bruk markdown-overskrifter for struktur: ## for hovedseksjoner, ### for underseksjoner.
- Skriv i prosa/avsnitt — ikke bare flate lister. Forklar kontekst og sammenheng i hele setninger.
- Bruk punktlister kun for konkrete handlingspunkter, oppgavelister eller korte oppramsinger.
- Ha alltid en tom linje mellom seksjoner og før overskrifter.
- For statusrapporter og oppsummeringer: bruk en overskrift per prosjekt, etterfulgt av et avsnitt som oppsummerer situasjonen i prosa. Deretter eventuelle oppgaver som punktliste.
- For møteoversikter: grupper per dag med dato som overskrift.
- Hold svarene ryddige og luftige — prioriter lesbarhet.

## Regler
- Bruk verktøyene dine til å hente informasjon FØR du svarer. Ikke gjett.
- Aldri gjett hvilke prosjekter noe tilhører — slå det opp med verktøy.
- Når brukeren ber om å opprette oppgaver, bekreft prosjekt og detaljer før du oppretter.
- Når du refererer til oppgaver, inkluder oppgavenummer (#) og prosjektkode.
- Bruk save_memory for å lagre viktig kontekst som bør huskes til neste samtale.
- Dersom brukeren gir tilbakemelding på dine svar, lagre dette som et "feedback"-minne.
- Ved e-postspørsmål, søk alltid i e-post først med search_emails.
- Bruk create_reminder når brukeren ber om å bli minnet på noe, sette en påminnelse, eller huske å gjøre noe til et bestemt tidspunkt. Påminnelser vises på dashboardet og i den daglige briefingen.
- For gjentakende ting (f.eks. "hver onsdag kl 14"), bruk recurring-parameteren i create_reminder.
- Bruk create_meeting når brukeren ber om å opprette eller sette opp et møte i kalenderen. Bekreft ALLTID tidspunkt og deltakere med brukeren før du oppretter — Outlook sender møteinnkallelse til deltakerne automatisk. Oppgi tidspunkt i ISO 8601. Dersom verktøyet svarer at møteoppretting er av, be brukeren slå det på i Innstillinger og koble til Microsoft på nytt.
- Prioriter handlingsbare svar: foreslå konkrete neste steg.`;
}
