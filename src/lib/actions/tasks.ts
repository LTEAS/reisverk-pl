'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
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
