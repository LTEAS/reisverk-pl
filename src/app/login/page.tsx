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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) toast.error(error.message)
    else router.push('/')
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
            Prosjektoppfølging — Logg inn
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Logg inn</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Personlig konto — hver bruker har sin egen, private arbeidsflate. Data deles
              ikke med andre brukere, verken i din organisasjon eller utenfor. Kontoer
              opprettes av administrator.
            </p>
          </div>

          <div className="space-y-3">
            {/* Microsoft SSO */}
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

            {/* Divider */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-xs uppercase tracking-wider text-muted-foreground">
                  eller
                </span>
              </div>
            </div>

            {/* Email/password form */}
            <form onSubmit={handleSignIn} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  E-post
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Passord
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Logg inn'}
              </button>
            </form>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="mt-6 px-2 text-center text-xs leading-relaxed text-muted-foreground">
          Ved å logge inn samtykker du til at appen leser e-post og kalender fra
          din Microsoft 365-konto, og at innhold sendes til AI-leverandører
          (OpenAI, Google, Anthropic) for prosessering. Data deles ikke med
          andre brukere.{' '}
          <Link href="/personvern" className="underline hover:text-foreground">
            Les mer om personvern
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
