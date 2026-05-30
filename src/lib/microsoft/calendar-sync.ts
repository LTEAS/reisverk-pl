/**
 * Calendar sync — fetch events from Microsoft Graph and store in meetings table.
 *
 * Syncs events for the next 21 days (3 weeks). Uses graphEventId for upsert.
 */

import { prisma } from '@/lib/prisma'
import { graphGetAll } from './graph-client'

// ---------------------------------------------------------------------------
// Graph event types
// ---------------------------------------------------------------------------

interface GraphAttendee {
  emailAddress: { name?: string; address?: string }
  type?: string
  status?: { response?: string }
}

interface GraphEvent {
  id: string
  iCalUId?: string
  subject?: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  isAllDay?: boolean
  location?: { displayName?: string }
  isOnlineMeeting?: boolean
  onlineMeeting?: { joinUrl?: string }
  organizer?: { emailAddress?: { name?: string; address?: string } }
  attendees?: GraphAttendee[]
  isCancelled?: boolean
  '@removed'?: { reason: string }
}

const SELECT_FIELDS = [
  'id',
  'iCalUId',
  'subject',
  'start',
  'end',
  'isAllDay',
  'location',
  'isOnlineMeeting',
  'onlineMeeting',
  'organizer',
  'attendees',
  'isCancelled',
].join(',')

// ---------------------------------------------------------------------------
// Core sync
// ---------------------------------------------------------------------------

export interface CalendarSyncResult {
  synced: number
  created: number
  updated: number
  cancelled: number
  error?: string
}

export async function syncCalendar(userId: string): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = {
    synced: 0,
    created: 0,
    updated: 0,
    cancelled: 0,
  }

  const now = new Date()
  const startDate = new Date(now)
  startDate.setHours(0, 0, 0, 0)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 21)

  const start = startDate.toISOString()
  const end = endDate.toISOString()

  const path = `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$select=${SELECT_FIELDS}&$top=100&$orderby=start/dateTime`

  try {
    const { items } = await graphGetAll<GraphEvent>(userId, path, 5)

    for (const event of items) {
      if (event['@removed'] || !event.id) continue

      const startsAt = new Date(event.start.dateTime + 'Z')
      const endsAt = new Date(event.end.dateTime + 'Z')

      // If timezone info is available and not UTC, the datetime might
      // already be in local time — Graph calendarView returns UTC for
      // dateTime when timeZone is "UTC". We store as-is.

      const isCancelled = event.isCancelled || false

      const attendees = (event.attendees || []).map((a) => ({
        name: a.emailAddress?.name || null,
        email: a.emailAddress?.address || null,
        type: a.type || null,
        response: a.status?.response || null,
      }))

      const meetingData = {
        graphEventId: event.id,
        graphIcalUid: event.iCalUId || null,
        subject: event.subject || null,
        startsAt,
        endsAt,
        isAllDay: event.isAllDay || false,
        location: event.location?.displayName || null,
        isOnline: event.isOnlineMeeting || false,
        onlineUrl: event.onlineMeeting?.joinUrl || null,
        organizerName: event.organizer?.emailAddress?.name || null,
        organizerEmail: event.organizer?.emailAddress?.address || null,
        attendees: attendees.length > 0 ? attendees : undefined,
        status: isCancelled ? 'cancelled' as const : 'upcoming' as const,
        syncedAt: now,
      }

      const existing = await prisma.meeting.findUnique({
        where: {
          userId_graphEventId: {
            userId,
            graphEventId: event.id,
          },
        },
        select: { id: true },
      })

      if (existing) {
        await prisma.meeting.update({
          where: { id: existing.id },
          data: meetingData,
        })
        if (isCancelled) result.cancelled++
        else result.updated++
      } else {
        await prisma.meeting.create({
          data: {
            userId,
            ...meetingData,
          },
        })
        result.created++
      }

      result.synced++
    }

    // Log sync
    await prisma.syncLog.create({
      data: {
        userId,
        syncType: 'calendar',
        status: 'completed',
        startedAt: now,
        completedAt: new Date(),
        itemsSynced: result.synced,
        itemsCreated: result.created,
        itemsUpdated: result.updated,
      },
    })
  } catch (err: any) {
    result.error = err.message || String(err)
    console.error('Calendar sync error:', err)

    await prisma.syncLog.create({
      data: {
        userId,
        syncType: 'calendar',
        status: 'failed',
        startedAt: now,
        completedAt: new Date(),
        errorMessage: result.error?.slice(0, 1000),
      },
    })
  }

  return result
}
