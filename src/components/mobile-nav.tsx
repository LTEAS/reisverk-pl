'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { AppSidebar } from './app-sidebar'

interface MobileNavProps {
  user: {
    email?: string
    name?: string
    avatarUrl?: string
    isAdmin?: boolean
  }
}

export function MobileNav({ user }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      {/* Mobile header bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[#2a2827] bg-[#1a1918] px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-stone-400 hover:bg-[#2a2827] hover:text-white"
          aria-label="Åpne meny"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-white">Reisverk PL</span>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[280px] transform transition-transform duration-200 ease-in-out lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative h-full">
          <button
            onClick={() => setOpen(false)}
            className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-stone-400 hover:bg-[#2a2827] hover:text-white"
            aria-label="Lukk meny"
          >
            <X className="h-4 w-4" />
          </button>
          <AppSidebar user={user} onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </>
  )
}
