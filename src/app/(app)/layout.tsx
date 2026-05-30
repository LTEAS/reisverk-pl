import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppSidebar } from '@/components/app-sidebar'
import { MobileNav } from '@/components/mobile-nav'
import { SyncProvider } from './sync-context'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  // Check admin role from DB
  const userRoles = await prisma.userRole.findMany({
    where: { userId: user.id },
    select: { role: true },
  })
  const isAdmin = userRoles.some((r) => r.role === 'admin')

  const userData = {
    email: user.email ?? undefined,
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
    avatarUrl: user.user_metadata?.avatar_url ?? undefined,
    isAdmin,
  }

  return (
    <SyncProvider>
      <div className="flex h-dvh overflow-hidden bg-[#0f0e0d]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-60 lg:shrink-0">
          <AppSidebar user={userData} />
        </aside>

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile nav */}
          <MobileNav user={userData} />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SyncProvider>
  )
}
