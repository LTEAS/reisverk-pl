import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  const userRoles = await prisma.userRole.findMany({
    where: { userId: user.id },
    select: { role: true },
  })
  const isAdmin = userRoles.some((r) => r.role === 'admin')

  if (!isAdmin) {
    redirect('/')
  }

  return <>{children}</>
}
