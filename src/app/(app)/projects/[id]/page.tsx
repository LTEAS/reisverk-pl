import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ProjectDetail } from './project-detail'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const userId = user.id
  const { id } = await params

  // Verify membership
  const membership = await prisma.projectMember.findFirst({
    where: { projectId: id, userId },
  })

  if (!membership) notFound()

  // Parallel data fetching
  const [project, tasks, emails, suggestions, contacts, emailMonitors, members, allProjects] =
    await Promise.all([
      prisma.project.findUnique({
        where: { id },
      }),

      prisma.task.findMany({
        where: { projectId: id },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          assigneeUser: { select: { displayName: true, email: true } },
          sourceEmail: { select: { id: true, subject: true } },
        },
      }),

      prisma.email.findMany({
        where: { projectId: id, userId },
        orderBy: { receivedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          subject: true,
          senderEmail: true,
          senderName: true,
          receivedAt: true,
          aiSummary: true,
          replyStatus: true,
          direction: true,
        },
      }),

      prisma.aiSuggestion.findMany({
        where: { projectId: id, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      }),

      prisma.contact.findMany({
        where: { projectId: id },
        orderBy: { name: 'asc' },
      }),

      prisma.emailMonitor.findMany({
        where: { projectId: id },
        orderBy: { createdAt: 'desc' },
      }),

      prisma.projectMember.findMany({
        where: { projectId: id },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      }),

      // All projects for "move email" dropdown
      prisma.project.findMany({
        where: { members: { some: { userId } } },
        select: { id: true, name: true, shortCode: true },
        orderBy: { name: 'asc' },
      }),
    ])

  if (!project) notFound()

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <ProjectDetail
        project={project}
        tasks={tasks}
        emails={emails}
        suggestions={suggestions}
        contacts={contacts}
        emailMonitors={emailMonitors}
        members={members}
        allProjects={allProjects}
        userRole={membership.role}
      />
    </div>
  )
}
