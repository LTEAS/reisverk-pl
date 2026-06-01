'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'

/**
 * Accept an AI suggestion — creates the task and marks suggestion as accepted.
 */
export async function acceptSuggestion(suggestionId: string, overrideProjectId?: string) {
  const user = await requireUser()
  const userId = user.id

  const suggestion = await prisma.aiSuggestion.findUnique({
    where: { id: suggestionId },
  })

  if (!suggestion || suggestion.status !== 'pending') {
    throw new Error('Forslag ikke funnet eller allerede behandlet')
  }

  const details = (suggestion.details as any) || {}

  if (suggestion.suggestionType === 'new_project') {
    // Create a new project with search terms and contacts
    const shortCode = suggestion.title
      .replace(/[^a-zA-ZæøåÆØÅ0-9 ]/g, '')
      .split(' ')
      .filter(Boolean)
      .map((w: string) => w[0]?.toUpperCase())
      .join('')
      .slice(0, 6) || 'PRJ'

    // Parse contacts: "Navn <epost>" format
    const contacts: { name: string; email: string }[] = (details.suggestedContacts || [])
      .map((c: string) => {
        const match = c.match(/^(.+?)\s*<(.+?)>$/)
        if (match) return { name: match[1].trim(), email: match[2].trim() }
        if (c.includes('@')) return { name: c.split('@')[0], email: c }
        return null
      })
      .filter(Boolean)

    const project = await prisma.project.create({
      data: {
        name: suggestion.title,
        shortCode,
        searchTerms: details.suggestedSearchTerms || [],
        excludeTerms: [],
        creator: { connect: { id: userId } },
        members: { create: { userId, role: 'owner' } },
        ...(contacts.length > 0
          ? {
              emailMonitors: {
                createMany: {
                  data: contacts.map((c) => ({
                    emailAddress: c.email,
                    displayName: c.name,
                  })),
                },
              },
            }
          : {}),
      },
    })

    // Reassign emails that were classified for this project suggestion
    if (suggestion.sourceEmailId) {
      await prisma.email.updateMany({
        where: {
          id: suggestion.sourceEmailId,
          projectId: null,
        },
        data: { projectId: project.id },
      })
    }
  } else {
    // Create a task (use override project if provided)
    const targetProjectId = overrideProjectId || suggestion.projectId
    const lastTask = await prisma.task.findFirst({
      where: { projectId: targetProjectId },
      orderBy: { taskNumber: 'desc' },
      select: { taskNumber: true },
    })

    await prisma.task.create({
      data: {
        projectId: targetProjectId,
        title: suggestion.title,
        description: details.description || null,
        priority: details.priority || 'normal',
        status: 'apen',
        source: 'ai_email',
        sourceEmailId: suggestion.sourceEmailId,
        aiGenerated: true,
        aiConfidence: 0.8,
        taskNumber: (lastTask?.taskNumber || 0) + 1,
        createdBy: userId,
        dueDate: details.dueDate ? new Date(details.dueDate) : null,
      },
    })
  }

  // Mark suggestion as accepted
  await prisma.aiSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: 'accepted',
      reviewedAt: new Date(),
      reviewedBy: userId,
    },
  })

  revalidatePath('/tasks')
  revalidatePath(`/projects/${suggestion.projectId}`)
}

/**
 * Reject an AI suggestion.
 */
export async function rejectSuggestion(suggestionId: string) {
  const user = await requireUser()
  const userId = user.id

  await prisma.aiSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedBy: userId,
    },
  })

  revalidatePath('/tasks')
}
