'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  MapPin,
  Video,
  Users,
  Sparkles,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronRight,
  FileText,
  HelpCircle,
  MessageSquare,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MeetingData {
  id: string
  subject: string | null
  startsAt: Date
  endsAt: Date
  isAllDay: boolean
  location: string | null
  isOnline: boolean
  onlineUrl: string | null
  organizerName: string | null
  attendees: any
  status: string
  project: { id: string; name: string; shortCode: string | null } | null
  meetingPreps: Array<{
    id: string
    agendaSummary: string | null
    keyTopics: any
    openQuestions: any
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function isSameDay(a: Date, b: Date): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function groupByDate(meetings: MeetingData[]): Map<string, MeetingData[]> {
  const groups = new Map<string, MeetingData[]>()
  for (const m of meetings) {
    const key = new Date(m.startsAt).toISOString().slice(0, 10)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }
  return groups
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

// ---------------------------------------------------------------------------
// MeetingsList
// ---------------------------------------------------------------------------

export function MeetingsList({
  upcomingMeetings,
  pastMeetings,
}: {
  upcomingMeetings: MeetingData[]
  pastMeetings: MeetingData[]
}) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [showPast, setShowPast] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Synkroniser kalenderen min fra Microsoft 365',
        }),
      })
      router.refresh()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  const grouped = groupByDate(upcomingMeetings)

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Moter</h1>
          <p className="text-sm text-stone-400 mt-1">
            {upcomingMeetings.length} kommende mote
            {upcomingMeetings.length !== 1 ? 'r' : ''}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg bg-[#C07A4A]/10 px-3 py-2 text-sm font-medium text-[#C07A4A] hover:bg-[#C07A4A]/20 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synkroniserer...' : 'Synkroniser kalender'}
        </button>
      </div>

      {/* Upcoming meetings grouped by date */}
      {grouped.size > 0 ? (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([dateKey, meetings]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-white">
                  {isToday(new Date(meetings[0].startsAt))
                    ? 'I dag'
                    : formatDate(new Date(meetings[0].startsAt))}
                </h2>
                <div className="flex-1 h-px bg-[#2a2827]" />
              </div>
              <div className="space-y-3">
                {meetings.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center mb-4">
            <Calendar className="h-6 w-6 text-stone-500" />
          </div>
          <h3 className="text-sm font-medium text-white mb-1">
            Ingen kommende moter
          </h3>
          <p className="text-xs text-stone-500">
            Synkroniser kalenderen for å hente moter fra Microsoft 365.
          </p>
        </div>
      )}

      {/* Past meetings */}
      {pastMeetings.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-2 text-sm font-medium text-stone-400 hover:text-white transition-colors"
          >
            {showPast ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Tidligere moter ({pastMeetings.length})
          </button>
          {showPast && (
            <div className="space-y-3 mt-3">
              {pastMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  isPast
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// MeetingCard
// ---------------------------------------------------------------------------

function MeetingCard({
  meeting,
  isPast,
}: {
  meeting: MeetingData
  isPast?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const router = useRouter()
  const prep = meeting.meetingPreps[0] || null
  const attendees = (meeting.attendees as any[]) || []

  async function handleGeneratePrep() {
    setGenerating(true)
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Generer moteforberedelse for motet "${meeting.subject}" den ${formatDate(new Date(meeting.startsAt))}`,
        }),
      })
      router.refresh()
    } catch (err) {
      console.error('Prep generation failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      className={`rounded-xl bg-[#1a1918] border border-[#2a2827] overflow-hidden ${
        isPast ? 'opacity-60' : ''
      }`}
    >
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#2a2827] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Time block */}
        <div className="flex flex-col items-center justify-center rounded-lg bg-[#2a2827] px-3 py-2 min-w-[60px]">
          {meeting.isAllDay ? (
            <span className="text-xs font-medium text-stone-300">
              Hele dagen
            </span>
          ) : (
            <>
              <span className="text-sm font-medium text-white">
                {formatTime(meeting.startsAt)}
              </span>
              <span className="text-[10px] text-stone-500">
                {formatTime(meeting.endsAt)}
              </span>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-200 truncate">
            {meeting.subject || 'Uten tittel'}
          </p>
          <div className="flex items-center gap-3 mt-1">
            {meeting.isOnline && (
              <span className="flex items-center gap-1 text-[10px] text-[#C07A4A]">
                <Video className="h-3 w-3" />
                Online
              </span>
            )}
            {meeting.location && !meeting.isOnline && (
              <span className="flex items-center gap-1 text-[10px] text-stone-500 truncate">
                <MapPin className="h-3 w-3" />
                {meeting.location}
              </span>
            )}
            {attendees.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-stone-500">
                <Users className="h-3 w-3" />
                {attendees.length} deltaker
                {attendees.length !== 1 ? 'e' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Project badge */}
        {meeting.project && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-400 shrink-0">
            {meeting.project.shortCode || meeting.project.name}
          </span>
        )}

        {/* Prep indicator */}
        {prep && (
          <div className="shrink-0" title="Forberedelse klar">
            <FileText className="h-4 w-4 text-green-400" />
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[#2a2827] px-5 py-4 space-y-4">
          {/* Attendees */}
          {attendees.length > 0 && (
            <div>
              <p className="text-xs text-stone-500 mb-2">Deltakere:</p>
              <div className="flex flex-wrap gap-2">
                {attendees.slice(0, 10).map((a: any, i: number) => (
                  <span
                    key={i}
                    className="text-xs bg-stone-800 text-stone-300 rounded-full px-2 py-0.5"
                  >
                    {a.name || a.email || 'Ukjent'}
                  </span>
                ))}
                {attendees.length > 10 && (
                  <span className="text-xs text-stone-500">
                    +{attendees.length - 10} til
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Meeting prep */}
          {prep ? (
            <div className="rounded-lg bg-[#0f0e0d] border border-[#2a2827] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#C07A4A]" />
                <h4 className="text-sm font-medium text-white">
                  Moteforberedelse
                </h4>
              </div>

              {prep.agendaSummary && (
                <div>
                  <p className="text-xs text-stone-500 mb-1">Agenda:</p>
                  <p className="text-sm text-stone-300 whitespace-pre-line">
                    {prep.agendaSummary}
                  </p>
                </div>
              )}

              {prep.keyTopics &&
                Array.isArray(prep.keyTopics) &&
                (prep.keyTopics as string[]).length > 0 && (
                  <div>
                    <p className="text-xs text-stone-500 mb-1 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Viktige temaer:
                    </p>
                    <ul className="space-y-1">
                      {(prep.keyTopics as string[]).map((t: string, i: number) => (
                        <li
                          key={i}
                          className="text-sm text-stone-300 flex items-start gap-2"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#C07A4A] shrink-0" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {prep.openQuestions &&
                Array.isArray(prep.openQuestions) &&
                (prep.openQuestions as string[]).length > 0 && (
                  <div>
                    <p className="text-xs text-stone-500 mb-1 flex items-center gap-1">
                      <HelpCircle className="h-3 w-3" />
                      Apne sporsmal:
                    </p>
                    <ul className="space-y-1">
                      {(prep.openQuestions as string[]).map((q: string, i: number) => (
                        <li
                          key={i}
                          className="text-sm text-stone-300 flex items-start gap-2"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ) : (
            <button
              onClick={handleGeneratePrep}
              disabled={generating}
              className="flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
            >
              <Sparkles
                className={`h-4 w-4 ${generating ? 'animate-pulse' : ''}`}
              />
              {generating ? 'Genererer...' : 'Generer forberedelse'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
