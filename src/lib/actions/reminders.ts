'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'

export async function deleteReminder(reminderId: string) {
  const user = await requireUser()

  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
  })

  if (!reminder || reminder.userId !== user.id) {
    throw new Error('Påminnelse ikke funnet')
  }

  await prisma.reminder.delete({
    where: { id: reminderId },
  })

  revalidatePath('/')
}

export async function completeReminder(reminderId: string) {
  const user = await requireUser()

  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
  })

  if (!reminder || reminder.userId !== user.id) {
    throw new Error('Påminnelse ikke funnet')
  }

  if (reminder.recurring) {
    const next = new Date(reminder.remindAt)
    if (reminder.recurring === 'daily') next.setDate(next.getDate() + 1)
    else if (reminder.recurring === 'weekly') next.setDate(next.getDate() + 7)
    else if (reminder.recurring === 'monthly') next.setMonth(next.getMonth() + 1)

    await prisma.reminder.update({
      where: { id: reminderId },
      data: { remindAt: next },
    })
  } else {
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { completed: true, completedAt: new Date() },
    })
  }

  revalidatePath('/')
}
