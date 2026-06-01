'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [msLoading, setMsLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.push('/')
    })
  }, [router, supabase.auth])

  const handleMicrosoftLogin = async () => {
    setMsLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        scopes: 'openid profile email',
      },
    })
    if (error) {
      toast.error(error.message)
      setMsLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo + subtitle */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/reisverk-logo.svg"
            alt="Reisverk Prosjektoppfølging"
            width={45}
            height={56}
            priority
          />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Prosjektoppfølging
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Logg inn</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Logg inn med din Microsoft-konto for å komme i gang.
              Ny bruker? Kontoen opprettes automatisk ved første innlogging.
            </p>
          </div>

          <button
            onClick={handleMicrosoftLogin}
            disabled={msLoading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {msLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
            )}
            Logg inn med Microsoft
          </button>
        </div>

        {/* Footer */}
        <p className="mt-6 px-2 text-center text-xs leading-relaxed text-muted-foreground">
          Ved å logge inn godtar du våre{' '}
          <Link href="/vilkar" className="underline hover:text-foreground">
            bruks- og betalingsvilkår
          </Link>{' '}
          og{' '}
          <Link href="/personvern" className="underline hover:text-foreground">
            personvernerklæring
          </Link>
          . Første uke er gratis.
        </p>
      </div>
    </div>
  )
}
