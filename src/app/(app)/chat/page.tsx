import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ChatView } from './chat-view'

export default async function ChatPage() {
  const user = await requireUser()
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
      <ChatView threads={threads} />
    </div>
  )
}
