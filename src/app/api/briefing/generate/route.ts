/**
 * POST /api/briefing/generate
 *
 * Dedicated endpoint for briefing generation only.
 * Called by frontend AFTER sync completes.
 * Runs in its own serverless function with generous timeout.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateBriefing } from '@/lib/briefing/generate'

export const maxDuration = 300 // 5 min dedicated to briefing

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await generateBriefing(user.id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('Briefing generation failed:', err.message)
    return NextResponse.json(
      { ok: false, error: err.message || 'Briefing generation failed' },
      { status: 500 }
    )
  }
}
