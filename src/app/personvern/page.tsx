import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Personvernerklæring — Reisverk',
}

export default function PersonvernPage() {
  return (
    <div className="flex min-h-dvh justify-center bg-background px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <Link href="/login">
            <Image
              src="/reisverk-logo.svg"
              alt="Reisverk"
              width={36}
              height={45}
              priority
            />
          </Link>
          <h1 className="text-xl font-semibold">Personvernerklæring</h1>
          <p className="text-sm text-muted-foreground">
            Sist oppdatert: 1. juni 2026
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-lg font-semibold">1. Behandlingsansvarlig</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              HMT Prosjekt AS (org.nr. 930 953 048) er behandlingsansvarlig for
              personopplysninger som samles inn gjennom Reisverk
              Prosjektoppfølging (&laquo;tjenesten&raquo;). Kontakt:{' '}
              <a href="mailto:tobias@hmtprosjekt.no" className="underline hover:text-foreground">
                tobias@hmtprosjekt.no
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Hvilke opplysninger vi samler inn</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ved registrering henter vi navn og e-postadresse fra din
              Microsoft-konto. Når du kobler til Microsoft 365 gir du oss
              lesetilgang til e-post og kalender. Vi lagrer også oppgaver,
              prosjektdata og chatmeldinger du oppretter i tjenesten.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Formål og behandlingsgrunnlag</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Vi behandler personopplysningene dine for å levere tjenesten:
              prosjektoppfølging, oppgavehåndtering, e-postsammendrag og
              AI-assistert rådgivning. Behandlingsgrunnlaget er avtale
              (GDPR art. 6 nr. 1 bokstav b) — opplysningene er nødvendige
              for å oppfylle tjenesten du har registrert deg for.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. AI-behandling</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Innhold fra e-post, kalender, oppgaver og chat sendes til
              Anthropic (Claude) for AI-prosessering. Anthropic lagrer ikke
              data fra API-kall for trening av modeller. Data sendes kryptert
              (TLS) og behandles i henhold til Anthropics databehandleravtale.
              Ingen andre brukere har tilgang til dine data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Lagring og sikkerhet</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Data lagres i Supabase (AWS eu-central-1) med kryptering i
              hvile og under overføring. Microsoft-tokens krypteres før
              lagring. Vi benytter Row-Level Security slik at kun din
              bruker har tilgang til dine data. Tjenesten hostes på Vercel.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Deling med tredjeparter</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Vi deler personopplysninger med følgende underleverandører
              utelukkende for å levere tjenesten: Supabase (database),
              Vercel (hosting), Anthropic (AI-prosessering) og Microsoft
              (autentisering og e-post/kalender-synk). Vi selger aldri
              data til tredjeparter.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Oppbevaring</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Data oppbevares så lenge du har en aktiv konto. Dersom du
              sletter kontoen din, sletter vi alle personopplysninger
              innen 30 dager, med unntak av det som kreves av regnskaps-
              eller bokføringsloven.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Dine rettigheter</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Du har rett til innsyn, retting, sletting, begrensning av
              behandling og dataportabilitet. Du kan også trekke tilbake
              Microsoft 365-tilkoblingen når som helst under Innstillinger.
              For å utøve rettighetene dine, kontakt oss på{' '}
              <a href="mailto:tobias@hmtprosjekt.no" className="underline hover:text-foreground">
                tobias@hmtprosjekt.no
              </a>
              . Du har også rett til å klage til Datatilsynet.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Informasjonskapsler</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Tjenesten bruker kun nødvendige informasjonskapsler for
              autentisering og sesjonshåndtering. Vi bruker ikke
              analyse- eller markedsføringscookies.
            </p>
          </section>
        </div>

        {/* Back link */}
        <div className="mt-10 text-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Tilbake til innlogging
          </Link>
        </div>
      </div>
    </div>
  )
}
