'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'

export async function changeEmailProject(emailId: string, newProjectId: string) {
  const user = await requireUser()

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    select: { userId: true, projectId: true },
  })

  if (!email || email.userId !== user.id) {
    throw new Error('E-post ikke funnet')
  }

  await prisma.email.update({
    where: { id: emailId },
    data: { projectId: newProjectId },
  })

  revalidatePath(`/projects/${email.projectId}`)
  revalidatePath(`/projects/${newProjectId}`)
}
