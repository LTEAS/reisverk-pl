import { Suspense } from 'react'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TaskList } from './task-list'
import { TaskBoard } from './task-board'
import { ViewToggle } from './view-toggle'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    project?: string
    priority?: string
    view?: string
  }>
}) {
  const user = await requireUser()
  const userId = user.id
  const params = await searchParams
  const view = params.view === 'tavle' ? 'tavle' : 'liste'

  // Get user's projects for filter dropdown
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, shortCode: true },
  })

  // Build filter conditions
  const where: any = {
    project: { members: { some: { userId } } },
  }

  if (params.status && params.status !== 'alle') {
    where.status = params.status
  }

  if (params.project && params.project !== 'alle') {
    where.projectId = params.project
  }

  if (params.priority && params.priority !== 'alle') {
    where.priority = params.priority
  }

  // Fetch tasks
  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    include: {
      project: { select: { id: true, name: true, shortCode: true } },
      sourceEmail: { select: { id: true, subject: true } },
      assigneeUser: { select: { displayName: true, email: true } },
    },
  })

  // Group by project
  const grouped = new Map<
    string,
    { project: { id: string; name: string; shortCode: string | null }; tasks: typeof tasks }
  >()

  for (const task of tasks) {
    const key = task.projectId
    if (!grouped.has(key)) {
      grouped.set(key, { project: task.project, tasks: [] })
    }
    grouped.get(key)!.tasks.push(task)
  }

  const groupedTasks = Array.from(grouped.values())

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex justify-end">
        <Suspense>
          <ViewToggle active={view} />
        </Suspense>
      </div>
      {view === 'tavle' ? (
        <TaskBoard
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            taskNumber: t.taskNumber,
            project: t.project,
          }))}
        />
      ) : (
        <TaskList
          groupedTasks={groupedTasks}
          projects={projects}
          currentFilters={{
            status: params.status || 'alle',
            project: params.project || 'alle',
            priority: params.priority || 'alle',
          }}
        />
      )}
    </div>
  )
}
