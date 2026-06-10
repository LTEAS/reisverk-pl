# REISVERK-PL — Prosjektinstruksjoner

## Kommunikasjonsstil

- Led med svaret. Kontekst og begrunnelse kommer etter, aldri før.
- Hvis en forespørsel har en bedre tilnærming, si det én gang — gjør deretter det som ble bedt om.
- Flagg reelle feil og risikoer direkte. Ikke pakk inn advarsler til de blir ubrukelige.

## Hva er reisverk-pl

AI-drevet prosjektoppfølgingsverktøy for byggebransjen. Hjelper prosjektledere med oppgaver, e-post, møter og prosjektstatus via en innebygd AI-assistent med verktøybruk (tool-use loop).

### Tech stack

- **Frontend/Backend**: Next.js (App Router), TypeScript, Tailwind CSS
- **Database**: Supabase Postgres via Prisma ORM (direkte tilkobling)
- **Auth**: Supabase Auth (e-post/passord)
- **AI**: Anthropic Claude (claude-sonnet-4-6) med agentic tool-use loop
- **Integrasjoner**: Microsoft 365 (e-post + kalender via Graph API)
- **Hosting**: Vercel
- **UI**: Radix UI-primitiver, shadcn/ui-komponenter

### Viktige stier

- `src/lib/ai/` — AI-logikk: system prompt, tool-definisjoner, tool-executor, tool-loop
- `src/lib/actions/` — Server actions (oppgaver, prosjekter)
- `src/lib/supabase/` — Supabase-klienter (client, server, admin)
- `src/app/(app)/` — Autentiserte sider (dashboard, prosjekter, oppgaver, chat, møter, team, innstillinger)
- `src/app/api/` — API-ruter (chat, auth, cron, briefing, settings)
- `prisma/schema.prisma` — Databaseskjema

## Supabase-prosjekt

- Prosjekt-ID: `dgltiavafoibykahpvbc`
- Alle databaseendringer gjøres mot dette prosjektet

## Databasetilgang — Prisma, ikke Supabase Data API

Reisverk-pl bruker **Prisma ORM med direktekobling til Postgres** for alle databaseoperasjoner. Supabase Data API (PostgREST / supabase-js `/rest/v1/`) brukes **ikke** for tabelldata — kun for autentisering (`supabase.auth.*`).

Dette betyr:
- Supabase sin endring fra 30. mai 2026 om at nye tabeller i `public`-skjemaet krever eksplisitt `GRANT` for Data API-tilgang **påvirker ikke appen** så lenge alt går via Prisma.
- Dersom det i fremtiden legges til en mobilapp eller tredjeparts-integrasjon som bruker Supabase Data API, må nye tabeller ha eksplisitte `GRANT`-setninger i migrasjonen.
- Frist for eksisterende prosjekter: **30. oktober 2026**.

## Sikkerhetskrav ved databaseendringer

Når du gjør endringer i databaseskjema (Prisma/SQL), server actions eller API-ruter:

1. **Kjør sikkerhetssjekk etter DDL-endringer**: Bruk `get_advisors` med type `security` mot Supabase-prosjektet etter alle skjemaendringer (nye tabeller, kolonner, funksjoner, policies).

2. **RLS på alle tabeller**: Nye tabeller skal alltid ha Row-Level Security (RLS) aktivert med en `service_role_all`-policy som bruker `is_service_role()`. Eksempel:
   ```sql
   ALTER TABLE public.<tabell> ENABLE ROW LEVEL SECURITY;
   CREATE POLICY service_role_all ON public.<tabell>
     FOR ALL USING (public.is_service_role()) WITH CHECK (public.is_service_role());
   ```

3. **search_path på funksjoner**: Nye PostgreSQL-funksjoner skal alltid ha `SET search_path = ''` for å hindre search_path-manipulering.

4. **Indekser på foreign keys**: Nye foreign keys skal alltid ha tilhørende indeks (`CREATE INDEX`). Verifiser med performance advisor etter endringer.

5. **Autorisasjon i server actions**: Verifiser alltid brukerens identitet og prosjektmedlemskap før dataoperasjoner. Bruk `requireUser()` fra `src/lib/auth.ts` og sjekk prosjektmedlemskap/rolle via `ProjectMember`.

6. **Autorisasjon i tool-executor**: Alle verktøy i `tool-executor.ts` mottar `userId` og skal verifisere tilgang via `requireProjectMembership()` før de utfører operasjoner.

## AI-assistent — arkitektur

### Tool-use loop (`src/lib/ai/tool-loop.ts`)
- Agentic loop som kaller Claude med verktøy, kjører verktøy ved `tool_use`-stopp, og looper til `end_turn` eller maks 10 iterasjoner.
- Modell: `claude-sonnet-4-6`, maks 8192 tokens per kall.
- Alle kall logges i `ai_call_log`-tabellen.

### System prompt (`src/lib/ai/system-prompt.ts`)
- Bygges dynamisk per bruker med: prosjektoversikt, forfalte oppgaver, dagens møter, og lagrede minner.
- Språk: norsk (bokmål). Ingen emojis.

### Verktøy (`src/lib/ai/tool-definitions.ts`)
Tilgjengelige verktøy: `search_emails`, `list_tasks`, `create_task`, `update_task`, `list_projects`, `create_project`, `update_project`, `accept_suggestions`, `get_calendar`, `save_memory`, `search_memories`, `generate_reply_suggestion`.

Når du legger til nye verktøy:
1. Definer i `tool-definitions.ts` (beskrivelse på norsk).
2. Implementer i `tool-executor.ts` med `userId`-parameter og tilgangskontroll.
3. Legg til i switch-case i `executeTool()`.

## Cron-jobber

- `sync-all` kjører kl 06:00 på ukedager (Vercel Cron — vercel.json er fasit for tidspunkt).
- Synkroniserer e-post og kalender fra Microsoft 365.

## Prisma-konvensjoner

- Tabellnavn: `@@map("snake_case_flertall")` (f.eks. `@@map("projects")`)
- Kolonnenavn: `@map("snake_case")` (f.eks. `@map("created_at")`)
- ID-er: UUID med `@default(dbgenerated("gen_random_uuid()"))`.
- Timestamps: `@db.Timestamptz` for alle tidspunkter.
- Enums: `@@map("snake_case")` for enum-navn.

## Oppgavestatus-flyt

```
åpen → sendt → mottatt → signert → utført/lukket
```

Statuser i Prisma-enum: `apen`, `sendt`, `mottatt`, `signert`, `utfort`, `lukket`.

## Konvensjoner

- **Språk i kode**: Variabelnavn og kommentarer på engelsk, brukervendte strenger på norsk.
- **Feilmeldinger**: Alltid på norsk i brukervendte svar.
- **Server actions**: Bruk `'use server'`-direktiv, kall `requireUser()` først.
- **Revalidering**: Kall `revalidatePath()` etter mutasjoner for relevante stier.
- **API-ruter**: Autentiser via `createClient()` + `supabase.auth.getUser()`.

## Kjente aksepterte advarsler

- **Leaked Password Protection Disabled** — må aktiveres manuelt i Supabase Dashboard > Authentication > Settings > Password Security.
