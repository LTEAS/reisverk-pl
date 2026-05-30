import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ProjectGrid } from './project-grid'

export default async function ProjectsPage() {
  const user = await requireUser()
  const userId = user.id

  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          tasks: {
            where: { status: { notIn: ['utfort', 'lukket'] } },
          },
        },
      },
    },
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <ProjectGrid projects={projects} />
    </div>
  )
}
