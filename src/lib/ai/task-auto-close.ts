/**
 * Task Auto-Close
 *
 * Detects when emails in a conversation thread have been replied to,
 * and automatically updates linked task statuses.
 *
 * Logic:
 * - If a task was created from an inbound email (source = ai_email)
 *   and the user has since sent an outbound email in the same conversation
 *   → mark the email as "replied" and update task status
 *
 * - If a task is "awaiting_reply" (user sent something, waiting for response)
 *   and a new inbound email arrives in the same conversation
 *   → mark the email as "replied" and potentially close the task
 */

import { prisma } from '@/lib/prisma'

export interface AutoCloseResult {
  tasksUpdated: number
  emailsUpdated: number
}

export async function autoCloseTasks(userId: string): Promise<AutoCloseResult> {
  const result: AutoCloseResult = { tasksUpdated: 0, emailsUpdated: 0 }

  // -----------------------------------------------------------------------
  // 1. Find tasks created from emails that now have replies
  // -----------------------------------------------------------------------

  const emailLinkedTasks = await prisma.task.findMany({
    where: {
      createdBy: userId,
      source: 'ai_email',
      sourceEmailId: { not: null },
      status: { in: ['apen', 'sendt'] },
    },
    include: {
      sourceEmail: {
        select: {
          id: true,
          conversationId: true,
          replyStatus: true,
          direction: true,
        },
      },
    },
  })

  for (const task of emailLinkedTasks) {
    if (!task.sourceEmail?.conversationId) continue

    // Check if user has sent a reply in this conversation AFTER the
    // original email was received
    const userReply = await prisma.email.findFirst({
      where: {
        userId,
        conversationId: task.sourceEmail.conversationId,
        direction: 'outbound',
        sentAt: { not: null },
      },
      orderBy: { sentAt: 'desc' },
    })

    if (userReply) {
      // User replied → update task to "sendt" (sent/responded)
      if (task.status === 'apen') {
        await prisma.task.update({
          where: { id: task.id },
          data: { status: 'sendt' },
        })
        result.tasksUpdated++
      }

      // Update the source email's reply status
      if (task.sourceEmail.replyStatus !== 'replied') {
        await prisma.email.update({
          where: { id: task.sourceEmail.id },
          data: {
            replyStatus: 'replied',
            repliedAt: userReply.sentAt,
          },
        })
        result.emailsUpdated++
      }
    }
  }

  // -----------------------------------------------------------------------
  // 2. Find emails marked "needs_reply" where user has now replied
  // -----------------------------------------------------------------------

  const needsReplyEmails = await prisma.email.findMany({
    where: {
      userId,
      replyStatus: 'needs_reply',
      conversationId: { not: null },
      direction: 'inbound',
    },
    select: {
      id: true,
      conversationId: true,
      receivedAt: true,
    },
  })

  for (const email of needsReplyEmails) {
    if (!email.conversationId) continue

    const userReply = await prisma.email.findFirst({
      where: {
        userId,
        conversationId: email.conversationId,
        direction: 'outbound',
        sentAt: email.receivedAt ? { gt: email.receivedAt } : undefined,
      },
    })

    if (userReply) {
      await prisma.email.update({
        where: { id: email.id },
        data: {
          replyStatus: 'replied',
          repliedAt: userReply.sentAt,
        },
      })
      result.emailsUpdated++
    }
  }

  // -----------------------------------------------------------------------
  // 3. Find emails marked "awaiting_reply" where response has arrived
  // -----------------------------------------------------------------------

  const awaitingEmails = await prisma.email.findMany({
    where: {
      userId,
      replyStatus: 'awaiting_reply',
      conversationId: { not: null },
      direction: 'outbound',
    },
    select: {
      id: true,
      conversationId: true,
      sentAt: true,
    },
  })

  for (const email of awaitingEmails) {
    if (!email.conversationId) continue

    const inboundReply = await prisma.email.findFirst({
      where: {
        userId,
        conversationId: email.conversationId,
        direction: 'inbound',
        receivedAt: email.sentAt ? { gt: email.sentAt } : undefined,
      },
    })

    if (inboundReply) {
      await prisma.email.update({
        where: { id: email.id },
        data: { replyStatus: 'replied' },
      })
      result.emailsUpdated++

      // Check if there's a task linked to this conversation
      const relatedTask = await prisma.task.findFirst({
        where: {
          createdBy: userId,
          sourceEmail: { conversationId: email.conversationId },
          status: 'sendt', // Was sent, now got reply
        },
      })

      if (relatedTask) {
        await prisma.task.update({
          where: { id: relatedTask.id },
          data: { status: 'mottatt' }, // Response received
        })
        result.tasksUpdated++
      }
    }
  }

  return result
}
