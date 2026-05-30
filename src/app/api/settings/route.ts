import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const allowedFields = [
    'briefingTime',
    'aiLanguage',
    'autoCreateTasks',
    'requireTaskConfirmation',
    'syncEnabled',
    'syncIntervalMin',
  ]

  const data: Record<string, any> = {}
  for (const key of allowedFields) {
    if (key in body) {
      data[key] = body[key]
    }
  }

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: data,
    create: {
      userId: user.id,
      ...data,
    },
  })

  return NextResponse.json({ success: true })
}
