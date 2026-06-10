import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EmailList } from './email-list'

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const user = await requireUser()
  const userId = user.id
  const params = await searchParams
  const filter = params.filter === 'venter' ? 'awaiting_reply' : 'needs_reply'

  const [emails, needsReplyCount, awaitingCount] = await Promise.all([
    prisma.email.findMany({
      where: { userId, replyStatus: filter },
      orderBy: { receivedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        subject: true,
        senderName: true,
        senderEmail: true,
        receivedAt: true,
        bodyPreview: true,
        aiSummary: true,
        replyStatus: true,
        project: { select: { name: true, shortCode: true } },
        replySuggestions: {
          where: { status: { in: ['suggested', 'drafted'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            draftSubject: true,
            draftBody: true,
            status: true,
            outlookWebLink: true,
          },
        },
      },
    }),
    prisma.email.count({ where: { userId, replyStatus: 'needs_reply' } }),
    prisma.email.count({ where: { userId, replyStatus: 'awaiting_reply' } }),
  ])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <EmailList
        emails={emails}
        activeFilter={filter}
        counts={{ needsReply: needsReplyCount, awaiting: awaitingCount }}
      />
    </div>
  )
}
