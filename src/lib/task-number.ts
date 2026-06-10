import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/**
 * Task numbers are project-scoped and sequential. The DB has a unique
 * constraint on (project_id, task_number); concurrent creators may race for
 * the same number, so writes must go through withNextTaskNumber, which
 * retries on unique-constraint violation.
 */
export async function getNextTaskNumber(projectId: string): Promise<number> {
  const last = await prisma.task.findFirst({
    where: { projectId },
    orderBy: { taskNumber: 'desc' },
    select: { taskNumber: true },
  })
  return (last?.taskNumber ?? 0) + 1
}

/**
 * Run a task write that needs a fresh task number, retrying with a new
 * number if a concurrent writer took it first (P2002).
 */
export async function withNextTaskNumber<T>(
  projectId: string,
  fn: (taskNumber: number) => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const taskNumber = await getNextTaskNumber(projectId)
    try {
      return await fn(taskNumber)
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Kunne ikke tildele oppgavenummer')
}
