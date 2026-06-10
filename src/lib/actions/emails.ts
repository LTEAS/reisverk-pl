'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { graphPost } from '@/lib/microsoft/graph-client'

export async function changeEmailProject(emailId: string, newProjectId: string) {
  const user = await requireUser()

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    select: { userId: true, projectId: true },
  })

  if (!email || email.userId !== user.id) {
    throw new Error('E-post ikke funnet')
  }

  await prisma.email.update({
    where: { id: emailId },
    data: { projectId: newProjectId },
  })

  revalidatePath(`/projects/${email.projectId}`)
  revalidatePath(`/projects/${newProjectId}`)
}

/**
 * Create a reply draft in Outlook from an AI reply suggestion.
 * Returns the Outlook web link so the user can open and send it there.
 */
export async function createOutlookDraft(
  suggestionId: string
): Promise<{ webLink: string | null }> {
  const user = await requireUser()

  const suggestion = await prisma.replySuggestion.findFirst({
    where: { id: suggestionId, userId: user.id },
    include: { email: { select: { graphMessageId: true } } },
  })

  if (!suggestion) throw new Error('Svarforslag ikke funnet')
  if (suggestion.outlookWebLink) {
    return { webLink: suggestion.outlookWebLink }
  }
  if (!suggestion.email.graphMessageId) {
    throw new Error('E-posten mangler kobling til Outlook')
  }

  const html = (suggestion.draftBody || '').replace(/\n/g, '<br>')
  const draft = await graphPost<{ id: string; webLink?: string }>(
    user.id,
    `/me/messages/${encodeURIComponent(suggestion.email.graphMessageId)}/createReply`,
    { comment: html }
  )

  await prisma.replySuggestion.update({
    where: { id: suggestion.id },
    data: {
      outlookDraftId: draft.id,
      outlookWebLink: draft.webLink || null,
      status: 'drafted',
    },
  })

  revalidatePath('/emails')
  revalidatePath('/')
  return { webLink: draft.webLink || null }
}

/**
 * Mark an email as handled (replied / no reply needed / ignored).
 */
export async function setEmailReplyStatus(
  emailId: string,
  status: 'replied' | 'no_reply_needed' | 'ignored'
) {
  const user = await requireUser()

  const email = await prisma.email.findFirst({
    where: { id: emailId, userId: user.id },
    select: { id: true },
  })
  if (!email) throw new Error('E-post ikke funnet')

  await prisma.email.update({
    where: { id: emailId },
    data: {
      replyStatus: status,
      ...(status === 'replied' ? { repliedAt: new Date() } : {}),
    },
  })

  revalidatePath('/emails')
  revalidatePath('/')
}

/**
 * Dismiss an AI reply suggestion.
 */
export async function dismissReplySuggestion(suggestionId: string) {
  const user = await requireUser()

  const suggestion = await prisma.replySuggestion.findFirst({
    where: { id: suggestionId, userId: user.id },
    select: { id: true },
  })
  if (!suggestion) throw new Error('Svarforslag ikke funnet')

  await prisma.replySuggestion.update({
    where: { id: suggestionId },
    data: { status: 'dismissed' },
  })

  revalidatePath('/emails')
  revalidatePath('/')
}
