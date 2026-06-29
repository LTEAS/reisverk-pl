/**
 * Email sync service — delta-sync from Microsoft Graph to the emails table.
 *
 * Uses the Graph delta API to efficiently fetch only new/changed messages.
 * On first run it fetches the last 7 days of mail; subsequent runs use the
 * stored deltaLink for incremental updates.
 */

import { prisma } from '@/lib/prisma'
import { graphGet, graphGetAll, graphListAttachments, type GraphResponse } from './graph-client'

// ---------------------------------------------------------------------------
// Types (subset of Graph message fields we request)
// ---------------------------------------------------------------------------

interface GraphAddress {
  emailAddress: { name?: string; address?: string }
}

interface GraphMessage {
  id: string
  conversationId?: string
  internetMessageId?: string
  subject?: string
  bodyPreview?: string
  body?: { contentType: string; content: string }
  from?: GraphAddress
  toRecipients?: GraphAddress[]
  ccRecipients?: GraphAddress[]
  receivedDateTime?: string
  sentDateTime?: string
  hasAttachments?: boolean
  importance?: string
  isRead?: boolean
  '@removed'?: { reason: string }
}

// Fields we ask Graph to return (keeps payload small)
const SELECT_FIELDS = [
  'id',
  'conversationId',
  'internetMessageId',
  'subject',
  'bodyPreview',
  'body',
  'from',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'sentDateTime',
  'hasAttachments',
  'importance',
  'isRead',
].join(',')

// ---------------------------------------------------------------------------
// Noise filter — skip newsletters, automated mail, etc.
// ---------------------------------------------------------------------------

const NOISE_SENDERS = [
  'noreply@',
  'no-reply@',
  'notifications@',
  'mailer-daemon@',
  'postmaster@',
  'newsletter@',
  'marketing@',
  'donotreply@',
]

const NOISE_SUBJECTS = [
  /^(re:\s*)?out of office/i,
  /automatisk svar/i,
  /automatic reply/i,
  /undeliverable/i,
  /delivery status/i,
  /unsubscribe/i,
]

function computeNoiseScore(msg: GraphMessage): number {
  let score = 0
  const sender = msg.from?.emailAddress?.address?.toLowerCase() || ''
  const subject = msg.subject?.toLowerCase() || ''

  if (NOISE_SENDERS.some((n) => sender.includes(n))) score += 50
  if (NOISE_SUBJECTS.some((re) => re.test(subject))) score += 40
  if (!msg.toRecipients?.length) score += 10

  return Math.min(score, 100)
}

// ---------------------------------------------------------------------------
// Direction detection
// ---------------------------------------------------------------------------

function detectDirection(
  msg: GraphMessage,
  userEmail: string | null
): 'inbound' | 'outbound' {
  if (!userEmail) return 'inbound'
  const from = msg.from?.emailAddress?.address?.toLowerCase() || ''
  return from === userEmail.toLowerCase() ? 'outbound' : 'inbound'
}

// ---------------------------------------------------------------------------
// Extract plain text from body
// ---------------------------------------------------------------------------

function extractPlainText(body?: { contentType: string; content: string }): string | null {
  if (!body?.content) return null
  if (body.contentType === 'text') return body.content.slice(0, 10000)

  // Strip HTML tags for a rough plain-text extraction
  return body.content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000)
}

// ---------------------------------------------------------------------------
// Core sync function
// ---------------------------------------------------------------------------

export interface SyncResult {
  synced: number
  created: number
  updated: number
  skipped: number
  reconciledRemoved?: number
  deltaLink?: string
  error?: string
}

export async function syncEmails(userId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, created: 0, updated: 0, skipped: 0 }

  // Get the user's MS account for email address
  const msAccount = await prisma.microsoftAccount.findUnique({
    where: { userId },
  })
  if (!msAccount) {
    result.error = 'No Microsoft account connected'
    return result
  }

  // Find the latest sync log to get deltaLink
  const lastSync = await prisma.syncLog.findFirst({
    where: { userId, syncType: 'email', status: 'completed' },
    orderBy: { completedAt: 'desc' },
  })

  let path: string
  if (lastSync?.deltaLink) {
    // Incremental sync via delta link
    path = lastSync.deltaLink
  } else {
    // Initial sync — last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const filter = `receivedDateTime ge ${sevenDaysAgo.toISOString()}`
    path = `/me/mailFolders/inbox/messages/delta?$select=${SELECT_FIELDS}&$filter=${encodeURIComponent(filter)}&$top=50`
  }

  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      userId,
      syncType: 'email',
      status: 'running',
      startedAt: new Date(),
    },
  })

  try {
    const { items, deltaLink } = await graphGetAll<GraphMessage>(
      userId,
      path,
      20 // max pages
    )

    for (const msg of items) {
      // Email left the inbox (deleted, moved to junk, filed, archived). Mark the
      // local row removed so it stops counting as unanswered, instead of leaving
      // a stale row behind on a plain skip.
      if (msg['@removed']) {
        if (msg.id) {
          await prisma.email.updateMany({
            where: { userId, graphMessageId: msg.id },
            data: { removedAt: new Date() },
          })
        }
        result.skipped++
        continue
      }

      if (!msg.id) {
        result.skipped++
        continue
      }

      const noiseScore = computeNoiseScore(msg)
      const direction = detectDirection(msg, msAccount.accountEmail)

      const recipients = [
        ...(msg.toRecipients || []).map((r) => ({
          type: 'to' as const,
          name: r.emailAddress?.name,
          email: r.emailAddress?.address,
        })),
        ...(msg.ccRecipients || []).map((r) => ({
          type: 'cc' as const,
          name: r.emailAddress?.name,
          email: r.emailAddress?.address,
        })),
      ]

      const bodyText = extractPlainText(msg.body)

      const emailData = {
        graphMessageId: msg.id,
        conversationId: msg.conversationId || null,
        internetMsgId: msg.internetMessageId || null,
        subject: msg.subject || null,
        bodyPreview: msg.bodyPreview?.slice(0, 500) || null,
        bodyText,
        senderEmail: msg.from?.emailAddress?.address || null,
        senderName: msg.from?.emailAddress?.name || null,
        recipients: recipients.length > 0 ? recipients : undefined,
        direction,
        receivedAt: msg.receivedDateTime
          ? new Date(msg.receivedDateTime)
          : null,
        sentAt: msg.sentDateTime ? new Date(msg.sentDateTime) : null,
        hasAttachments: msg.hasAttachments || false,
        importance: msg.importance || null,
        isRead: msg.isRead || false,
        noiseScore,
        removedAt: null,
        syncedAt: new Date(),
      }

      // Fetch attachment names for emails with attachments
      let attachmentNames: string[] = []
      if (emailData.hasAttachments) {
        try {
          const attachments = await graphListAttachments(userId, msg.id)
          attachmentNames = attachments
            .filter((a) => !a.isInline)
            .map((a) => a.name)
        } catch {
          // Non-critical — continue without names
        }
      }
      if (attachmentNames.length > 0) {
        ;(emailData as any).attachmentNames = attachmentNames
      }

      // Upsert by (userId, graphMessageId)
      const existing = await prisma.email.findUnique({
        where: {
          userId_graphMessageId: {
            userId,
            graphMessageId: msg.id,
          },
        },
        select: { id: true },
      })

      if (existing) {
        await prisma.email.update({
          where: { id: existing.id },
          data: emailData,
        })
        result.updated++
      } else {
        await prisma.email.create({
          data: {
            userId,
            ...emailData,
          },
        })
        result.created++
      }

      result.synced++
    }

    result.deltaLink = deltaLink

    // Reconciliation: mark emails that have left the inbox (deleted, moved to
    // junk, filed, archived) as removed. The inbox delta reports such messages
    // as '@removed' only once, so a periodic sweep against the current inbox
    // contents also clears rows that went stale before this was tracked.
    try {
      const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const inboxFilter = `receivedDateTime ge ${windowStart.toISOString()}`
      const { items: inboxItems } = await graphGetAll<{ id: string }>(
        userId,
        `/me/mailFolders/inbox/messages?$select=id&$filter=${encodeURIComponent(inboxFilter)}&$top=100`,
        20
      )
      const inboxIds = new Set(
        inboxItems.map((m) => m.id).filter((id): id is string => !!id)
      )
      // Guard: only reconcile when the inbox listing actually returned data, so a
      // failed or empty fetch never wipes the local mirror.
      if (inboxIds.size > 0) {
        const candidates = await prisma.email.findMany({
          where: {
            userId,
            removedAt: null,
            receivedAt: { gte: windowStart },
          },
          select: { id: true, graphMessageId: true },
        })
        const staleIds = candidates
          .filter((e) => e.graphMessageId && !inboxIds.has(e.graphMessageId))
          .map((e) => e.id)
        if (staleIds.length > 0) {
          await prisma.email.updateMany({
            where: { id: { in: staleIds } },
            data: { removedAt: new Date() },
          })
          result.reconciledRemoved = staleIds.length
        }
      }
    } catch (err) {
      console.warn('Inbox reconciliation skipped:', err)
    }

    // Update sync log
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        itemsSynced: result.synced,
        itemsCreated: result.created,
        itemsUpdated: result.updated,
        deltaLink: deltaLink || null,
        lastSyncAt: new Date(),
      },
    })
  } catch (err: any) {
    result.error = err.message || String(err)
    console.error('Email sync error:', err)

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: result.error?.slice(0, 1000),
        itemsSynced: result.synced,
        itemsCreated: result.created,
        itemsUpdated: result.updated,
      },
    })
  }

  return result
}
