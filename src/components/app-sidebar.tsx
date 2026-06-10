'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Calendar,
  Mail,
  MessageSquare,
  Settings,
  Shield,
  LogOut,
} from 'lucide-react'
import { SyncStatus } from './sync-status'

const navItems = [
  { label: 'Oversikt', icon: LayoutDashboard, href: '/' },
  { label: 'Oppgaver', icon: CheckSquare, href: '/tasks' },
  { label: 'Prosjekter', icon: FolderKanban, href: '/projects' },
  { label: 'Møter', icon: Calendar, href: '/meetings' },
  { label: 'E-post', icon: Mail, href: '/emails' },
  { label: 'AI Chat', icon: MessageSquare, href: '/chat' },
  { label: 'Innstillinger', icon: Settings, href: '/settings' },
]

const adminItems = [
  { label: 'Admin', icon: Shield, href: '/admin' },
]

interface AppSidebarProps {
  user: {
    email?: string
    name?: string
    avatarUrl?: string
    isAdmin?: boolean
  }
  onNavigate?: () => void
}

export function AppSidebar({ user, onNavigate }: AppSidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const displayName =
    user.name || user.email?.split('@')[0] || 'Bruker'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="flex h-full flex-col bg-[#1a1918] border-r border-[#2a2827]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[#2a2827]">
        <Image
          src="/reisverk-logo.svg"
          alt="Reisverk"
          width={22}
          height={28}
          className="shrink-0"
        />
        <div className="min-w-0">
          <h1 className="text-[11px] font-semibold text-stone-300 tracking-widest uppercase leading-tight">REISVERK</h1>
          <p className="text-[10px] text-stone-500 leading-tight">Prosjektoppfølging</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-[#C07A4A]/10 text-white'
                    : 'text-stone-500 hover:bg-[#2a2827] hover:text-stone-200'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    active ? 'text-[#C07A4A]' : ''
                  }`}
                />
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Admin section */}
        {user.isAdmin && (
          <div className="mt-4 pt-4 border-t border-[#2a2827] space-y-0.5">
            {adminItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-[#C07A4A]/10 text-white'
                      : 'text-stone-500 hover:bg-[#2a2827] hover:text-stone-200'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      active ? 'text-[#C07A4A]' : ''
                    }`}
                  />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="border-t border-[#2a2827] p-2.5">
        <SyncStatus />
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={displayName}
              className="h-7 w-7 rounded-full"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#C07A4A]/15 text-[10px] font-medium text-[#C07A4A]">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate text-[13px] font-medium text-stone-200">
              {displayName}
            </p>
            <p className="truncate text-[11px] text-stone-600">{user.email}</p>
          </div>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="rounded-md p-1 text-stone-600 transition-colors hover:bg-[#2a2827] hover:text-stone-300"
              title="Logg ut"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
