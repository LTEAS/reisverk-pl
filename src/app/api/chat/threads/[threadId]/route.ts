import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { threadId } = await params

  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          parts: true,
          createdAt: true,
        },
      },
    },
  })

  if (!thread) {
    return NextResponse.json(
      { error: 'Tråd ikke funnet' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
    },
    messages: thread.messages,
  })
}
