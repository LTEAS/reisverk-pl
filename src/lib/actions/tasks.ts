'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { createMessageWithRetry } from '@/lib/ai/anthropic'
import { logAiCall } from '@/lib/ai/log'
import { TaskStatus } from '@prisma/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyProjectMembership(userId: string, projectId: string) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
  })
  if (!member) {
    throw new Error('Du har ikke tilgang til dette prosjektet')
  }
  return member
}

async function getNextTaskNumber(projectId: string): Promise<number> {
  const last = await prisma.task.findFirst({
    where: { projectId },
    orderBy: { taskNumber: 'desc' },
    select: { taskNumber: true },
  })
  return (last?.taskNumber ?? 0) + 1
}

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

export async function createTask(formData: FormData) {
  const user = await requireUser()
  const userId = user.id

  const projectId = formData.get('projectId') as string
  const title = formData.get('title') as string
  const description = (formData.get('description') as string) || undefined
  const priority = (formData.get('priority') as string) || 'normal'
  const assignee = (formData.get('assignee') as string) || undefined
  const dueDateStr = formData.get('dueDate') as string | null

  if (!projectId || !title) {
    throw new Error('Prosjekt og tittel er påkrevd')
  }

  await verifyProjectMembership(userId, projectId)

  const taskNumber = await getNextTaskNumber(projectId)

  await prisma.task.create({
    data: {
      projectId,
      title,
      description,
      priority: priority as any,
      assignee,
      dueDate: dueDateStr ? new Date(dueDateStr) : undefined,
      taskNumber,
      createdBy: userId,
      source: 'manual',
    },
  })

  revalidatePath('/tasks')
  revalidatePath(`/projects/${projectId}`)
}

// ---------------------------------------------------------------------------
// updateTaskStatus
// ---------------------------------------------------------------------------

export async function updateTaskStatus(taskId: string, newStatus: TaskStatus) {
  const user = await requireUser()
  const userId = user.id

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  })

  if (!task) throw new Error('Oppgave ikke funnet')

  await verifyProjectMembership(userId, task.projectId)

  const completedStatuses: TaskStatus[] = ['utfort', 'lukket']
  const completedAt = completedStatuses.includes(newStatus) ? new Date() : null

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: newStatus,
      completedAt,
    },
  })

  revalidatePath('/tasks')
  revalidatePath(`/projects/${task.projectId}`)
}

// ---------------------------------------------------------------------------
// moveTask — flytt en oppgave til et annet prosjekt
// ---------------------------------------------------------------------------

export async function moveTask(taskId: string, newProjectId: string) {
  const user = await requireUser()
  const userId = user.id

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  })

  if (!task) throw new Error('Oppgave ikke funnet')
  if (task.projectId === newProjectId) return

  // Verify membership in both source and destination project
  await verifyProjectMembership(userId, task.projectId)
  await verifyProjectMembership(userId, newProjectId)

  // Assign a fresh task number in the destination project (numbers are
  // project-scoped, so reusing the old one would collide/confuse)
  const taskNumber = await getNextTaskNumber(newProjectId)

  await prisma.task.update({
    where: { id: taskId },
    data: { projectId: newProjectId, taskNumber },
  })

  revalidatePath('/tasks')
  revalidatePath(`/projects/${task.projectId}`)
  revalidatePath(`/projects/${newProjectId}`)
}

// ---------------------------------------------------------------------------
// snoozeTask
// ---------------------------------------------------------------------------

export async function snoozeTask(
  taskId: string,
  duration: '1d' | '3d' | '1w' | '1m'
) {
  const user = await requireUser()
  const userId = user.id

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  })

  if (!task) throw new Error('Oppgave ikke funnet')

  await verifyProjectMembership(userId, task.projectId)

  const now = new Date()
  let snoozeUntil: Date

  switch (duration) {
    case '1d':
      snoozeUntil = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000)
      break
    case '3d':
      snoozeUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      break
    case '1w':
      snoozeUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      break
    case '1m':
      snoozeUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      break
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { snoozeUntil },
  })

  revalidatePath('/tasks')
  revalidatePath(`/projects/${task.projectId}`)
}

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------

export async function deleteTask(taskId: string) {
  const user = await requireUser()
  const userId = user.id

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  })

  if (!task) throw new Error('Oppgave ikke funnet')

  await verifyProjectMembership(userId, task.projectId)

  await prisma.task.delete({
    where: { id: taskId },
  })

  revalidatePath('/tasks')
  revalidatePath(`/projects/${task.projectId}`)
}

// ---------------------------------------------------------------------------
// setTaskDueDate
// ---------------------------------------------------------------------------

export async function setTaskDueDate(taskId: string, dueDate: string | null) {
  const user = await requireUser()
  const userId = user.id

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  })

  if (!task) throw new Error('Oppgave ikke funnet')

  await verifyProjectMembership(userId, task.projectId)

  await prisma.task.update({
    where: { id: taskId },
    data: { dueDate: dueDate ? new Date(dueDate) : null },
  })

  revalidatePath('/tasks')
  revalidatePath(`/projects/${task.projectId}`)
}

// ---------------------------------------------------------------------------
// proposeTaskDueDates — AI proposes deadlines for tasks that lack one.
// Returns proposals only (no DB writes); the user approves and setTaskDueDate
// applies them. Conservative: the model is told to skip tasks with no basis.
// ---------------------------------------------------------------------------

export async function proposeTaskDueDates(projectId: string): Promise<
  Array<{
    taskId: string
    taskNumber: number
    title: string
    suggestedDueDate: string
    reason: string
    confidence: number
  }>
> {
  const user = await requireUser()
  const userId = user.id

  await verifyProjectMembership(userId, projectId)

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, shortCode: true, byggherre: true },
  })
  if (!project) throw new Error('Prosjekt ikke funnet')

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      dueDate: null,
      status: { notIn: ['utfort', 'lukket'] },
    },
    orderBy: { taskNumber: 'asc' },
    select: {
      id: true,
      taskNumber: true,
      title: true,
      description: true,
      note: true,
      sourceReference: true,
      sourceEmail: {
        select: {
          subject: true,
          bodyText: true,
          bodyPreview: true,
          receivedAt: true,
        },
      },
    },
  })

  if (tasks.length === 0) return []

  const todayStr = new Date().toISOString().slice(0, 10)

  const taskBlocks = tasks
    .map((t) => {
      const src = t.sourceEmail
      const body = (src?.bodyText || src?.bodyPreview || '').slice(0, 800)
      const srcDate = src?.receivedAt
        ? new Date(src.receivedAt).toISOString().slice(0, 10)
        : null
      return [
        `OPPGAVE #${t.taskNumber} (id: ${t.id})`,
        `Tittel: ${t.title}`,
        t.description ? `Beskrivelse: ${t.description}` : null,
        t.note ? `Notat: ${t.note}` : null,
        t.sourceReference ? `Referanse: ${t.sourceReference}` : null,
        src?.subject
          ? `Kilde-e-post (${srcDate ?? 'ukjent dato'}): "${src.subject}"\n${body}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n---\n\n')

  const prompt = `Du er prosjektleder-assistent i byggebransjen. Dagens dato er ${todayStr}.
Prosjekt: ${project.shortCode || ''} ${project.name}${project.byggherre ? ` (byggherre: ${project.byggherre})` : ''}

Under er oppgaver som mangler frist. Foreslå EN realistisk frist BARE for oppgaver der det finnes et konkret grunnlag i teksten — f.eks. en eksplisitt dato, "innen X", en rekkefølgekrav-sekvens, en myndighetsfrist, eller en tydelig avhengighet. Finnes det IKKE konkret grunnlag, utelat oppgaven. Ikke gjett eller dikt opp frister.

OPPGAVER:
${taskBlocks}

Svar med BARE JSON:
{
  "proposals": [
    {
      "taskId": "id fra oppgaven",
      "suggestedDueDate": "YYYY-MM-DD",
      "reason": "Kort begrunnelse med henvisning til grunnlaget",
      "confidence": 0.0-1.0
    }
  ]
}
Ta kun med oppgaver du faktisk foreslår en dato for. Returner tom liste hvis ingen har grunnlag.`

  const start = Date.now()
  const response = await createMessageWithRetry({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '{}'

  await logAiCall({
    userId,
    purpose: 'task_due_date_proposal',
    model: 'claude-sonnet-4-6',
    promptTokens: response.usage?.input_tokens || 0,
    completionTokens: response.usage?.output_tokens || 0,
    totalTokens:
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0),
    durationMs: Date.now() - start,
    status: 'success',
  })

  let parsed: {
    proposals?: Array<{
      taskId: string
      suggestedDueDate: string
      reason: string
      confidence: number
    }>
  }
  try {
    const jsonStr = rawText
      .replace(/^```json?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    return []
  }

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const proposals = []
  for (const p of parsed.proposals || []) {
    const t = byId.get(p.taskId)
    if (!t) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.suggestedDueDate || '')) continue
    proposals.push({
      taskId: t.id,
      taskNumber: t.taskNumber,
      title: t.title,
      suggestedDueDate: p.suggestedDueDate,
      reason: typeof p.reason === 'string' ? p.reason : '',
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    })
  }

  return proposals
}
