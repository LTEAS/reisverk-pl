import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Bruks- og betalingsvilkår — Reisverk',
}

export default function VilkarPage() {
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
          <h1 className="text-xl font-semibold">Bruks- og betalingsvilkår</h1>
          <p className="text-sm text-muted-foreground">
            Sist oppdatert: 1. juni 2026
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-lg font-semibold">1. Om tjenesten</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Reisverk Prosjektoppfølging (&laquo;tjenesten&raquo;) leveres av
              HMT Prosjekt AS (org.nr. 930 953 048). Tjenesten er et AI-drevet
              verktøy for prosjektoppfølging i byggebransjen, med funksjoner for
              oppgavehåndtering, e-postsammendrag, kalenderintegrasjon og
              AI-assistert rådgivning.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Prøveperiode</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Nye brukere får 7 dager gratis prøveperiode fra og med
              registreringsdato. I prøveperioden har du tilgang til alle
              funksjoner. Du trenger ikke oppgi betalingsinformasjon for å
              starte prøveperioden. Etter prøveperioden kreves et aktivt
              abonnement for fortsatt tilgang.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Priser og betaling</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Abonnementet koster 149 kr per måned (ekskl. mva.) og inkluderer
              100 kr i månedlig AI-kreditt. AI-kreditt brukes til prosessering
              av e-post, chat og andre AI-funksjoner. Ubrukt kreditt overføres
              ikke til neste måned. Ekstra kreditt kan kjøpes ved behov.
              Alle priser er i norske kroner.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Oppsigelse</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Du kan si opp abonnementet når som helst. Oppsigelsen trer i
              kraft ved utløpet av inneværende betalingsperiode. Etter
              oppsigelse har du tilgang til tjenesten ut den betalte perioden.
              Forhåndsbetalt abonnement refunderes ikke.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Brukerens ansvar</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Du er ansvarlig for aktiviteten på din konto. Kontoen er
              personlig og skal ikke deles med andre. Du er ansvarlig for
              at informasjonen du legger inn i tjenesten er korrekt, og
              at du har rett til å dele eventuell informasjon med tjenesten.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. AI-generert innhold</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Tjenesten bruker kunstig intelligens til å generere forslag,
              sammendrag og anbefalinger. AI-generert innhold er veiledende
              og kan inneholde feil. Du er selv ansvarlig for å kontrollere
              og vurdere alle AI-genererte forslag før du handler på dem.
              HMT Prosjekt AS er ikke ansvarlig for beslutninger tatt basert
              på AI-generert innhold.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Tilgjengelighet</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Vi tilstreber høy oppetid, men garanterer ikke uavbrutt
              tilgang. Tjenesten kan være utilgjengelig ved vedlikehold
              eller tekniske problemer. Vi er ikke ansvarlige for tap
              som følge av nedetid.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Immaterielle rettigheter</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Du beholder alle rettigheter til data du legger inn i
              tjenesten. HMT Prosjekt AS beholder alle rettigheter til
              tjenestens programvare, design og funksjonalitet. Vi bruker
              ikke dine data til å trene AI-modeller.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Ansvarsbegrensning</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              HMT Prosjekt AS er ikke ansvarlig for indirekte tap, tapt
              fortjeneste eller følgeskader. Vårt samlede ansvar er
              begrenset til beløpet du har betalt for tjenesten de siste
              12 månedene.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Endringer i vilkårene</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Vi kan endre vilkårene med 30 dagers varsel. Vesentlige
              endringer varsles via e-post. Fortsatt bruk av tjenesten
              etter at endringene trer i kraft utgjør aksept av de nye
              vilkårene.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">11. Lovvalg og tvisteløsning</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Vilkårene reguleres av norsk lov. Tvister skal søkes løst
              i minnelighet. Dersom dette ikke fører frem, avgjøres
              tvisten ved Oslo tingrett.
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
