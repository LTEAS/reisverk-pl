import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/sync/status — when did the current user's data last sync?
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const last = await prisma.syncLog.findFirst({
    where: {
      userId: user.id,
      status: { in: ['completed', 'partial'] },
      completedAt: { not: null },
    },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true },
  })

  return NextResponse.json({ lastSyncAt: last?.completedAt ?? null })
}
