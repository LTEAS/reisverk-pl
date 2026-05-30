import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  TaskStatus,
  PriorityLevel,
  TaskSource,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type Input = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

// ---------------------------------------------------------------------------
// Validate that a user is member of a project — returns project or throws
// ---------------------------------------------------------------------------

async function requireProjectMembership(userId: string, projectId: string) {
  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: { projectId, userId },
    },
    include: { project: true },
  });

  if (!membership) {
    throw new Error(
      `Brukeren er ikke medlem av prosjekt ${projectId}`
    );
  }
  return membership;
}

// ---------------------------------------------------------------------------
// Get next task number for a project
// ---------------------------------------------------------------------------

async function getNextTaskNumber(projectId: string): Promise<number> {
  const last = await prisma.task.findFirst({
    where: { projectId },
    orderBy: { taskNumber: "desc" },
    select: { taskNumber: true },
  });
  return (last?.taskNumber ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function searchEmails(input: Input, userId: string): Promise<string> {
  const query = str(input.query);
  const projectId = str(input.project_id) || undefined;
  const limit = num(input.limit, 10);
  const sinceDays = num(input.since_days, 30);

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);

  const emails = await prisma.email.findMany({
    where: {
      userId,
      ...(projectId ? { projectId } : {}),
      receivedAt: { gte: sinceDate },
      OR: [
        { subject: { contains: query, mode: "insensitive" } },
        { bodyPreview: { contains: query, mode: "insensitive" } },
        { bodyText: { contains: query, mode: "insensitive" } },
        { senderName: { contains: query, mode: "insensitive" } },
        { senderEmail: { contains: query, mode: "insensitive" } },
        { aiSummary: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: {
      id: true,
      subject: true,
      senderName: true,
      senderEmail: true,
      receivedAt: true,
      aiSummary: true,
      projectId: true,
      bodyPreview: true,
      hasAttachments: true,
      replyStatus: true,
    },
  });

  if (emails.length === 0) {
    return JSON.stringify({
      message: `Ingen e-poster funnet for søk "${query}" de siste ${sinceDays} dagene.`,
      results: [],
    });
  }

  return JSON.stringify({
    message: `Fant ${emails.length} e-post(er) for søk "${query}".`,
    results: emails,
  });
}

async function listTasks(input: Input, userId: string): Promise<string> {
  const projectId = str(input.project_id) || undefined;
  const status = str(input.status) || undefined;
  const includeCompleted = bool(input.include_completed, false);

  // Get projects user is member of
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const memberProjectIds = memberships.map((m) => m.projectId);

  if (memberProjectIds.length === 0) {
    return JSON.stringify({ message: "Brukeren er ikke medlem av noe prosjekt.", results: [] });
  }

  const statusFilter: TaskStatus[] | undefined = status
    ? [status as TaskStatus]
    : includeCompleted
      ? undefined
      : ["apen", "sendt", "mottatt", "signert"];

  const tasks = await prisma.task.findMany({
    where: {
      projectId: projectId
        ? { equals: projectId }
        : { in: memberProjectIds },
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: {
      project: { select: { name: true, shortCode: true } },
    },
  });

  return JSON.stringify({
    message: `Fant ${tasks.length} oppgave(r).`,
    results: tasks.map((t) => ({
      id: t.id,
      taskNumber: t.taskNumber,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee,
      dueDate: t.dueDate,
      project: t.project.name,
      projectShortCode: t.project.shortCode,
      source: t.source,
      note: t.note,
      createdAt: t.createdAt,
    })),
  });
}

async function createTask(input: Input, userId: string): Promise<string> {
  const projectId = str(input.project_id);
  const title = str(input.title);

  if (!projectId || !title) {
    return JSON.stringify({ error: "project_id og title er påkrevd." });
  }

  await requireProjectMembership(userId, projectId);

  const taskNumber = await getNextTaskNumber(projectId);

  const priority = (str(input.priority) || "normal") as PriorityLevel;
  const source = (str(input.source) || "manual") as TaskSource;
  const dueDate = str(input.due_date)
    ? new Date(str(input.due_date))
    : undefined;

  const task = await prisma.task.create({
    data: {
      projectId,
      title,
      description: str(input.description) || null,
      priority,
      assignee: str(input.assignee) || null,
      dueDate: dueDate ?? null,
      source,
      taskNumber,
      createdBy: userId,
      aiGenerated: true,
    },
    include: {
      project: { select: { name: true, shortCode: true } },
    },
  });

  return JSON.stringify({
    message: `Oppgave #${task.taskNumber} opprettet i prosjekt "${task.project.name}".`,
    task: {
      id: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      status: task.status,
      priority: task.priority,
      project: task.project.name,
    },
  });
}

async function updateTask(input: Input, userId: string): Promise<string> {
  const taskId = str(input.task_id);
  if (!taskId) {
    return JSON.stringify({ error: "task_id er påkrevd." });
  }

  // Verify task exists and user has access
  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { name: true } } },
  });
  if (!existing) {
    return JSON.stringify({ error: `Oppgave ${taskId} finnes ikke.` });
  }

  await requireProjectMembership(userId, existing.projectId);

  const newStatus = str(input.status) || undefined;
  const isCompleting =
    newStatus === "utfort" || newStatus === "lukket";

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(newStatus ? { status: newStatus as TaskStatus } : {}),
      ...(str(input.priority)
        ? { priority: str(input.priority) as PriorityLevel }
        : {}),
      ...(str(input.title) ? { title: str(input.title) } : {}),
      ...(str(input.description)
        ? { description: str(input.description) }
        : {}),
      ...(str(input.note) ? { note: str(input.note) } : {}),
      ...(str(input.assignee) ? { assignee: str(input.assignee) } : {}),
      ...(str(input.due_date)
        ? { dueDate: new Date(str(input.due_date)) }
        : {}),
      ...(isCompleting ? { completedAt: new Date() } : {}),
    },
    include: {
      project: { select: { name: true, shortCode: true } },
    },
  });

  return JSON.stringify({
    message: `Oppgave #${task.taskNumber} "${task.title}" oppdatert.`,
    task: {
      id: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      status: task.status,
      priority: task.priority,
      project: task.project.name,
    },
  });
}

async function listProjects(
  _input: Input,
  userId: string
): Promise<string> {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          members: { select: { id: true } },
          tasks: {
            where: {
              status: { in: ["apen", "sendt", "mottatt", "signert"] },
            },
            select: { id: true },
          },
        },
      },
    },
  });

  const projects = memberships.map((m) => ({
    id: m.project.id,
    name: m.project.name,
    shortCode: m.project.shortCode,
    description: m.project.description,
    byggherre: m.project.byggherre,
    role: m.role,
    memberCount: m.project.members.length,
    openTaskCount: m.project.tasks.length,
  }));

  return JSON.stringify({
    message: `Du er medlem av ${projects.length} prosjekt(er).`,
    results: projects,
  });
}

async function getCalendar(input: Input, userId: string): Promise<string> {
  const daysAhead = num(input.days_ahead, 7);

  const now = new Date();
  const until = new Date();
  until.setDate(until.getDate() + daysAhead);

  const meetings = await prisma.meeting.findMany({
    where: {
      userId,
      startsAt: { gte: now, lte: until },
    },
    orderBy: { startsAt: "asc" },
    include: {
      project: { select: { name: true, shortCode: true } },
    },
  });

  return JSON.stringify({
    message: `Fant ${meetings.length} møte(r) de neste ${daysAhead} dagene.`,
    results: meetings.map((m) => ({
      id: m.id,
      subject: m.subject,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      location: m.location,
      isOnline: m.isOnline,
      onlineUrl: m.onlineUrl,
      organizerName: m.organizerName,
      project: m.project?.name ?? null,
      status: m.status,
    })),
  });
}

async function saveMemory(input: Input, userId: string): Promise<string> {
  const type = str(input.type);
  const name = str(input.name);
  const description = str(input.description);
  const content = str(input.content);

  if (!type || !name || !description || !content) {
    return JSON.stringify({
      error: "type, name, description og content er påkrevd.",
    });
  }

  const memory = await prisma.memory.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, type, name, description, content },
    update: { type, description, content },
  });

  return JSON.stringify({
    message: `Minne "${memory.name}" lagret.`,
    memory: {
      id: memory.id,
      name: memory.name,
      type: memory.type,
      description: memory.description,
    },
  });
}

async function searchMemories(
  input: Input,
  userId: string
): Promise<string> {
  const query = str(input.query);
  const type = str(input.type) || undefined;

  const memories = await prisma.memory.findMany({
    where: {
      userId,
      ...(type ? { type } : {}),
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return JSON.stringify({
    message: `Fant ${memories.length} minne(r) for søk "${query}".`,
    results: memories.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      description: m.description,
      content: m.content,
      updatedAt: m.updatedAt,
    })),
  });
}

async function generateReplySuggestion(
  input: Input,
  userId: string
): Promise<string> {
  const emailId = str(input.email_id);
  const tone = str(input.tone, "formal");
  const instructions = str(input.instructions);

  if (!emailId) {
    return JSON.stringify({ error: "email_id er påkrevd." });
  }

  const email = await prisma.email.findFirst({
    where: { id: emailId, userId },
    include: {
      project: { select: { name: true } },
    },
  });

  if (!email) {
    return JSON.stringify({ error: `E-post ${emailId} ikke funnet.` });
  }

  // Build a template-based reply (will be replaced with AI generation later)
  const toneGreeting =
    tone === "friendly"
      ? "Hei"
      : tone === "brief"
        ? "Hei"
        : "Kjære";

  const senderFirstName = email.senderName?.split(" ")[0] ?? "avsender";
  const projectRef = email.project ? ` (${email.project.name})` : "";

  let draftBody = `${toneGreeting} ${senderFirstName},\n\n`;
  draftBody += `Takk for din e-post`;
  if (email.subject) {
    draftBody += ` vedrørende "${email.subject}"`;
  }
  draftBody += `${projectRef}.\n\n`;

  if (instructions) {
    draftBody += `${instructions}\n\n`;
  } else {
    draftBody += `Jeg har mottatt din henvendelse og vil komme tilbake til deg så snart som mulig.\n\n`;
  }

  if (tone === "formal") {
    draftBody += `Med vennlig hilsen`;
  } else if (tone === "friendly") {
    draftBody += `Hilsen`;
  } else {
    draftBody += `Mvh`;
  }

  const draftSubject = email.subject?.startsWith("Re:")
    ? email.subject
    : `Re: ${email.subject ?? ""}`;

  const suggestion = await prisma.replySuggestion.create({
    data: {
      emailId,
      userId,
      projectId: email.projectId,
      draftSubject,
      draftBody,
      tone,
      confidence: 0.7,
      status: "suggested",
    },
  });

  return JSON.stringify({
    message: `Svarforslag generert for e-post fra ${email.senderName}.`,
    suggestion: {
      id: suggestion.id,
      draftSubject: suggestion.draftSubject,
      draftBody: suggestion.draftBody,
      tone: suggestion.tone,
    },
  });
}

// ---------------------------------------------------------------------------
// Create project
// ---------------------------------------------------------------------------

async function createProject(input: Input, userId: string): Promise<string> {
  const name = str(input.name);
  if (!name) {
    return JSON.stringify({ error: "name er påkrevd." });
  }

  const shortCode =
    str(input.short_code) ||
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 5);

  const project = await prisma.project.create({
    data: {
      name,
      shortCode,
      description: str(input.description) || null,
      byggherre: str(input.byggherre) || null,
      searchTerms: Array.isArray(input.search_terms)
        ? (input.search_terms as string[])
        : [],
      createdBy: userId,
      members: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
  });

  // Add contacts if provided
  const contacts = Array.isArray(input.contacts)
    ? (input.contacts as any[])
    : [];

  for (const c of contacts) {
    const contactName = str(c.name);
    if (!contactName) continue;

    await prisma.contact.create({
      data: {
        projectId: project.id,
        name: contactName,
        email: str(c.email) || null,
        company: str(c.company) || null,
        roleDescription: str(c.role) || null,
      },
    });

    // Also create email monitor if email is provided
    const contactEmail = str(c.email);
    if (contactEmail) {
      await prisma.emailMonitor.create({
        data: {
          projectId: project.id,
          emailAddress: contactEmail,
          displayName: contactName,
        },
      });
    }
  }

  return JSON.stringify({
    message: `Prosjekt "${name}" (${shortCode}) opprettet med ${contacts.length} kontakt(er).`,
    project: {
      id: project.id,
      name: project.name,
      shortCode: project.shortCode,
    },
  });
}

// ---------------------------------------------------------------------------
// Update project
// ---------------------------------------------------------------------------

async function updateProject(input: Input, userId: string): Promise<string> {
  const projectId = str(input.project_id);
  if (!projectId) {
    return JSON.stringify({ error: "project_id er påkrevd." });
  }

  await requireProjectMembership(userId, projectId);

  const changes: string[] = [];

  // Update basic fields
  const updateData: Record<string, any> = {};
  if (str(input.name)) {
    updateData.name = str(input.name);
    changes.push(`navn → "${updateData.name}"`);
  }
  if (str(input.short_code)) {
    updateData.shortCode = str(input.short_code);
    changes.push(`kortkode → "${updateData.shortCode}"`);
  }
  if (str(input.byggherre)) {
    updateData.byggherre = str(input.byggherre);
    changes.push(`byggherre → "${updateData.byggherre}"`);
  }
  if (str(input.description)) {
    updateData.description = str(input.description);
    changes.push("beskrivelse oppdatert");
  }
  if (Array.isArray(input.search_terms)) {
    updateData.searchTerms = input.search_terms as string[];
    changes.push(`søkeord → [${(input.search_terms as string[]).join(", ")}]`);
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });
  }

  // Add contacts
  const addContacts = Array.isArray(input.add_contacts)
    ? (input.add_contacts as any[])
    : [];
  for (const c of addContacts) {
    const contactName = str(c.name);
    if (!contactName) continue;

    await prisma.contact.create({
      data: {
        projectId,
        name: contactName,
        email: str(c.email) || null,
        company: str(c.company) || null,
        roleDescription: str(c.role) || null,
      },
    });

    const contactEmail = str(c.email);
    if (contactEmail) {
      await prisma.emailMonitor.upsert({
        where: {
          projectId_emailAddress: { projectId, emailAddress: contactEmail },
        },
        create: {
          projectId,
          emailAddress: contactEmail,
          displayName: contactName,
        },
        update: { displayName: contactName },
      });
    }

    changes.push(`kontakt lagt til: ${contactName}`);
  }

  // Remove contacts
  const removeNames = Array.isArray(input.remove_contact_names)
    ? (input.remove_contact_names as string[])
    : [];
  for (const name of removeNames) {
    const deleted = await prisma.contact.deleteMany({
      where: {
        projectId,
        name: { equals: name, mode: "insensitive" },
      },
    });
    if (deleted.count > 0) {
      changes.push(`kontakt fjernet: ${name}`);

      // Also remove email monitor if it was the only reference
      const contact = await prisma.contact.findFirst({
        where: { projectId, name: { equals: name, mode: "insensitive" } },
      });
      // Contact already deleted, find by email in monitor
    }
  }

  if (changes.length === 0) {
    return JSON.stringify({ message: "Ingen endringer angitt." });
  }

  return JSON.stringify({
    message: `Prosjekt oppdatert: ${changes.join(", ")}.`,
    changes,
  });
}

// ---------------------------------------------------------------------------
// Accept AI suggestions (bulk)
// ---------------------------------------------------------------------------

async function acceptSuggestions(
  input: Input,
  userId: string
): Promise<string> {
  const projectId = str(input.project_id);
  if (!projectId) {
    return JSON.stringify({ error: "project_id er påkrevd." });
  }

  await requireProjectMembership(userId, projectId);

  const suggestionIds = Array.isArray(input.suggestion_ids)
    ? (input.suggestion_ids as string[])
    : [];

  // Find suggestions to accept
  const suggestions = await prisma.aiSuggestion.findMany({
    where: {
      status: "pending",
      ...(suggestionIds.length > 0 ? { id: { in: suggestionIds } } : {}),
      suggestionType: { in: ["new_task", "status_update", "close_task"] },
    },
    include: {
      project: { select: { name: true } },
    },
  });

  if (suggestions.length === 0) {
    return JSON.stringify({
      message: "Ingen ventende oppgaveforslag funnet.",
      accepted: 0,
    });
  }

  let accepted = 0;

  for (const suggestion of suggestions) {
    const taskNumber = await getNextTaskNumber(projectId);

    await prisma.task.create({
      data: {
        projectId,
        title: suggestion.title,
        description:
          (suggestion.details as any)?.description ||
          (suggestion.details as any)?.reason ||
          null,
        priority:
          ((suggestion.details as any)?.priority as PriorityLevel) || "normal",
        dueDate: (suggestion.details as any)?.dueDate
          ? new Date((suggestion.details as any).dueDate)
          : null,
        taskNumber,
        source: "ai_email" as TaskSource,
        createdBy: userId,
        aiGenerated: true,
      },
    });

    await prisma.aiSuggestion.update({
      where: { id: suggestion.id },
      data: { status: "accepted" },
    });

    accepted++;
  }

  return JSON.stringify({
    message: `${accepted} oppgave(r) opprettet i prosjektet.`,
    accepted,
    total: suggestions.length,
  });
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute a tool by name with the given input.
 * Returns a JSON string with the result (always valid JSON).
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (toolName) {
      case "search_emails":
        return await searchEmails(toolInput, userId);
      case "list_tasks":
        return await listTasks(toolInput, userId);
      case "create_task":
        return await createTask(toolInput, userId);
      case "update_task":
        return await updateTask(toolInput, userId);
      case "list_projects":
        return await listProjects(toolInput, userId);
      case "create_project":
        return await createProject(toolInput, userId);
      case "update_project":
        return await updateProject(toolInput, userId);
      case "accept_suggestions":
        return await acceptSuggestions(toolInput, userId);
      case "get_calendar":
        return await getCalendar(toolInput, userId);
      case "save_memory":
        return await saveMemory(toolInput, userId);
      case "search_memories":
        return await searchMemories(toolInput, userId);
      case "generate_reply_suggestion":
        return await generateReplySuggestion(toolInput, userId);
      case "create_reminder":
        return await createReminder(toolInput, userId);
      case "list_reminders":
        return await listReminders(toolInput, userId);
      case "complete_reminder":
        return await completeReminder(toolInput, userId);
      default:
        return JSON.stringify({
          error: `Ukjent verktøy: ${toolName}`,
        });
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Ukjent feil under verktøykjøring";
    console.error(`[executeTool] Error in ${toolName}:`, message);
    return JSON.stringify({ error: message });
  }
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

function nextOccurrence(current: Date, recurring: string): Date {
  const next = new Date(current);
  if (recurring === "daily") next.setDate(next.getDate() + 1);
  else if (recurring === "weekly") next.setDate(next.getDate() + 7);
  else if (recurring === "monthly") next.setMonth(next.getMonth() + 1);
  return next;
}

async function createReminder(input: Input, userId: string): Promise<string> {
  const title = str(input.title);
  const description = str(input.description) || null;
  const remindAtStr = str(input.remind_at);
  const recurring = str(input.recurring) || null;

  if (!title) return JSON.stringify({ error: "Tittel er påkrevd" });
  if (!remindAtStr) return JSON.stringify({ error: "Tidspunkt er påkrevd" });

  const remindAt = new Date(remindAtStr);
  if (isNaN(remindAt.getTime()))
    return JSON.stringify({ error: "Ugyldig datoformat" });

  if (recurring && !["daily", "weekly", "monthly"].includes(recurring))
    return JSON.stringify({ error: "Ugyldig gjentakelsestype" });

  const reminder = await prisma.reminder.create({
    data: {
      userId,
      title,
      description,
      remindAt,
      recurring,
    },
  });

  revalidatePath("/");

  const recurringLabel = recurring
    ? { daily: "daglig", weekly: "ukentlig", monthly: "månedlig" }[recurring]
    : "engangs";

  return JSON.stringify({
    success: true,
    reminder: {
      id: reminder.id,
      title: reminder.title,
      remindAt: reminder.remindAt.toISOString(),
      recurring: recurringLabel,
    },
    message: `Påminnelse opprettet: "${title}" — ${recurringLabel}, neste ${remindAt.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })} kl. ${remindAt.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}`,
  });
}

async function listReminders(input: Input, userId: string): Promise<string> {
  const includeCompleted = bool(input.include_completed, false);

  const where: Record<string, unknown> = { userId };
  if (!includeCompleted) where.completed = false;

  const reminders = await prisma.reminder.findMany({
    where,
    orderBy: { remindAt: "asc" },
    take: 20,
  });

  return JSON.stringify({
    count: reminders.length,
    reminders: reminders.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      remindAt: r.remindAt.toISOString(),
      recurring: r.recurring,
      completed: r.completed,
    })),
  });
}

async function completeReminder(
  input: Input,
  userId: string
): Promise<string> {
  const reminderId = str(input.reminder_id);
  if (!reminderId) return JSON.stringify({ error: "Påminnelse-ID er påkrevd" });

  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
  });

  if (!reminder || reminder.userId !== userId)
    return JSON.stringify({ error: "Påminnelse ikke funnet" });

  if (reminder.recurring) {
    // For recurring: advance to next occurrence
    const nextDate = nextOccurrence(reminder.remindAt, reminder.recurring);
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { remindAt: nextDate },
    });
    revalidatePath("/");
    return JSON.stringify({
      success: true,
      message: `Gjentakende påminnelse flyttet til ${nextDate.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })}`,
    });
  } else {
    // One-time: mark as completed
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { completed: true, completedAt: new Date() },
    });
    revalidatePath("/");
    return JSON.stringify({
      success: true,
      message: `Påminnelse "${reminder.title}" fullført`,
    });
  }
}
