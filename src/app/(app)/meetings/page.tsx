import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MeetingsList } from './meetings-list'

export default async function MeetingsPage() {
  const user = await requireUser()
  const userId = user.id

  const meetings = await prisma.meeting.findMany({
    where: {
      userId,
      startsAt: { gte: new Date() },
      status: { not: 'cancelled' },
    },
    orderBy: { startsAt: 'asc' },
    take: 50,
    include: {
      project: { select: { id: true, name: true, shortCode: true } },
      meetingPreps: {
        where: { userId },
        take: 1,
      },
    },
  })

  // Also get past meetings from last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const pastMeetings = await prisma.meeting.findMany({
    where: {
      userId,
      startsAt: { lt: new Date(), gte: sevenDaysAgo },
      status: { not: 'cancelled' },
    },
    orderBy: { startsAt: 'desc' },
    take: 10,
    include: {
      project: { select: { id: true, name: true, shortCode: true } },
      meetingPreps: {
        where: { userId },
        take: 1,
      },
    },
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <MeetingsList
        upcomingMeetings={meetings}
        pastMeetings={pastMeetings}
      />
    </div>
  )
}
