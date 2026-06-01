import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const briefing = await prisma.dailyBriefing.findUnique({
    where: { userId_briefingDate: { userId: user.id, briefingDate: today } },
    select: { generatedAt: true, summary: true },
  })

  return NextResponse.json({
    ready: !!(briefing?.summary && briefing?.generatedAt),
    generatedAt: briefing?.generatedAt || null,
  })
}
