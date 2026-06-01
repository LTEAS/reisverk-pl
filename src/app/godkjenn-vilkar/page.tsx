'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { acceptTerms } from '@/lib/actions/admin'
import { toast } from 'sonner'
import { Loader2, Shield, CreditCard, Brain, Calendar } from 'lucide-react'

export default function AcceptTermsPage() {
  const router = useRouter()
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleAccept = async () => {
    setLoading(true)
    try {
      await acceptTerms()
      router.push('/')
    } catch {
      toast.error('Noe gikk galt. Prøv igjen.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/reisverk-logo.svg"
            alt="Reisverk Prosjektoppfølging"
            width={45}
            height={56}
            priority
          />
          <h1 className="text-xl font-semibold">Velkommen til Reisverk</h1>
          <p className="text-sm text-muted-foreground">
            Før du kommer i gang trenger vi at du godkjenner vilkårene.
          </p>
        </div>

        {/* Info cards */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <Calendar className="mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">7 dager gratis</p>
            <p className="text-xs text-muted-foreground">
              Full tilgang uten betalingsinformasjon
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <CreditCard className="mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">149 kr/mnd</p>
            <p className="text-xs text-muted-foreground">
              Inkl. 100 kr AI-kreditt. Si opp når som helst.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <Brain className="mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">AI-assistent</p>
            <p className="text-xs text-muted-foreground">
              E-post, oppgaver og møter — alt på ett sted
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <Shield className="mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">Privat</p>
            <p className="text-xs text-muted-foreground">
              Dine data deles aldri med andre brukere
            </p>
          </div>
        </div>

        {/* Terms card */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ved å godkjenne bekrefter du at du har lest og aksepterer:
            </p>
            <ul className="list-inside list-disc space-y-1.5">
              <li>
                <Link href="/vilkar" className="underline hover:text-foreground" target="_blank">
                  Bruks- og betalingsvilkår
                </Link>
                {' '}— prøveperiode, pris, oppsigelse og ansvar
              </li>
              <li>
                <Link href="/personvern" className="underline hover:text-foreground" target="_blank">
                  Personvernerklæring
                </Link>
                {' '}— datainnsamling, AI-behandling og dine rettigheter
              </li>
            </ul>
            <p>
              Du godtar at e-post og kalender fra Microsoft 365 leses av
              tjenesten, og at innhold sendes til AI-leverandører (Anthropic)
              for prosessering.
            </p>
          </div>

          {/* Checkbox */}
          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm text-foreground">
              Jeg har lest og godtar bruks- og betalingsvilkårene og
              personvernerklæringen.
            </span>
          </label>

          {/* Accept button */}
          <button
            onClick={handleAccept}
            disabled={!accepted || loading}
            className="mt-4 flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Godkjenn og kom i gang'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
