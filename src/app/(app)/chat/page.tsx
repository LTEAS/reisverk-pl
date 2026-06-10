import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ChatView } from './chat-view'

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const user = await requireUser()
  const { q } = await searchParams
  const userId = user.id

  const threads = await prisma.chatThread.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  })

  return (
    <div className="h-full flex">
      <ChatView threads={threads} initialPrompt={q || null} />
    </div>
  )
}
