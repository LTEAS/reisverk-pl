import type Anthropic from "@anthropic-ai/sdk";

/**
 * All tool definitions exposed to Claude during the tool-use loop.
 * Descriptions are in Norwegian to match the system prompt language.
 */
export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_emails",
    description:
      "Søk i brukerens e-post fra Microsoft 365. Brukes til å finne relevante e-poster basert på søkeord, avsender, eller prosjekt.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Søketekst" },
        project_id: {
          type: "string",
          description: "Filtrer på prosjekt-ID (valgfritt)",
        },
        limit: {
          type: "number",
          description: "Maks antall resultater (standard 10)",
        },
        since_days: {
          type: "number",
          description: "Antall dager tilbake å søke (standard 30)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_tasks",
    description:
      "Hent oppgaver for brukeren, filtrert etter prosjekt og/eller status.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Filtrer på prosjekt-ID" },
        status: {
          type: "string",
          enum: ["apen", "sendt", "mottatt", "signert", "utfort", "lukket"],
          description: "Filtrer på status",
        },
        include_completed: {
          type: "boolean",
          description: "Inkluder fullførte oppgaver (standard false)",
        },
      },
      required: [],
    },
  },
  {
    name: "create_task",
    description: "Opprett en ny oppgave i et prosjekt.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Prosjekt-ID" },
        title: { type: "string", description: "Oppgavetittel" },
        description: { type: "string", description: "Beskrivelse" },
        priority: {
          type: "string",
          enum: ["urgent", "high", "normal", "low"],
          description: "Prioritet (standard normal)",
        },
        assignee: { type: "string", description: "Ansvarlig (navn)" },
        due_date: {
          type: "string",
          description: "Frist (ISO 8601 dato)",
        },
        source: {
          type: "string",
          enum: ["manual", "ai_email", "meeting", "briefing"],
          description: "Kilde (standard manual)",
        },
      },
      required: ["project_id", "title"],
    },
  },
  {
    name: "update_task",
    description:
      "Oppdater en eksisterende oppgave (status, prioritet, beskrivelse, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Oppgave-ID" },
        status: {
          type: "string",
          enum: ["apen", "sendt", "mottatt", "signert", "utfort", "lukket"],
          description: "Ny status",
        },
        priority: {
          type: "string",
          enum: ["urgent", "high", "normal", "low"],
          description: "Ny prioritet",
        },
        title: { type: "string", description: "Ny tittel" },
        description: { type: "string", description: "Ny beskrivelse" },
        note: { type: "string", description: "Legg til notat" },
        assignee: { type: "string", description: "Ny ansvarlig" },
        due_date: { type: "string", description: "Ny frist (ISO 8601)" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "list_projects",
    description: "Hent alle prosjekter brukeren er medlem av.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_calendar",
    description:
      "Hent møter fra brukerens kalender for en gitt periode.",
    input_schema: {
      type: "object" as const,
      properties: {
        days_ahead: {
          type: "number",
          description: "Antall dager frem i tid (standard 7)",
        },
      },
      required: [],
    },
  },
  {
    name: "save_memory",
    description:
      "Lagre viktig kontekst som bør huskes mellom samtaler. Bruk dette for brukerpreferanser, prosjektkontekst, eller tilbakemeldinger.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["user", "feedback", "project", "reference"],
          description: "Type minne",
        },
        name: {
          type: "string",
          description: "Kort, unik identifikator (kebab-case)",
        },
        description: {
          type: "string",
          description: "Én linje som beskriver innholdet",
        },
        content: {
          type: "string",
          description: "Fullt innhold",
        },
      },
      required: ["type", "name", "description", "content"],
    },
  },
  {
    name: "search_memories",
    description: "Søk i lagrede minner for relevant kontekst.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Søketekst" },
        type: {
          type: "string",
          enum: ["user", "feedback", "project", "reference"],
          description: "Filtrer på type",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_project",
    description:
      "Opprett et nytt prosjekt. Brukeren blir automatisk lagt til som eier. Kan også legge til kontaktpersoner og søkeord for e-postmatching.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Prosjektnavn" },
        short_code: {
          type: "string",
          description: "Kort prosjektkode (f.eks. 'WA' for Wilberg Alleen). Valgfritt — genereres automatisk.",
        },
        byggherre: { type: "string", description: "Byggherre/oppdragsgiver (valgfritt)" },
        description: { type: "string", description: "Kort beskrivelse (valgfritt)" },
        search_terms: {
          type: "array",
          items: { type: "string" },
          description: "Søkeord for å matche e-poster til prosjektet (valgfritt)",
        },
        contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Fullt navn" },
              email: { type: "string", description: "E-postadresse" },
              company: { type: "string", description: "Firma" },
              role: { type: "string", description: "Rolle i prosjektet" },
            },
            required: ["name"],
          },
          description: "Kontaktpersoner å legge til (valgfritt)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "update_project",
    description:
      "Oppdater et eksisterende prosjekt — endre navn, kortkode, byggherre, søkeord, eller administrer kontaktpersoner.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Prosjekt-ID" },
        name: { type: "string", description: "Nytt prosjektnavn (valgfritt)" },
        short_code: { type: "string", description: "Ny kortkode (valgfritt)" },
        byggherre: { type: "string", description: "Ny byggherre (valgfritt)" },
        description: { type: "string", description: "Ny beskrivelse (valgfritt)" },
        search_terms: {
          type: "array",
          items: { type: "string" },
          description: "Erstatt søkeord (valgfritt)",
        },
        add_contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Fullt navn" },
              email: { type: "string", description: "E-postadresse" },
              company: { type: "string", description: "Firma" },
              role: { type: "string", description: "Rolle" },
            },
            required: ["name"],
          },
          description: "Kontakter å legge til (valgfritt)",
        },
        remove_contact_names: {
          type: "array",
          items: { type: "string" },
          description: "Navn på kontakter å fjerne (valgfritt)",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "accept_suggestions",
    description:
      "Godkjenn ventende AI-forslag (oppgaver) og flytt dem til et prosjekt. Kan godkjenne alle, eller filtrere på prosjekt. Bruk dette når brukeren sier ting som 'legg alle oppgavene på prosjektet' eller 'godkjenn forslagene'.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "Prosjekt-ID å legge oppgavene på. Påkrevd.",
        },
        suggestion_ids: {
          type: "array",
          items: { type: "string" },
          description: "Spesifikke forslags-ID-er å godkjenne. Hvis tom/utelatt, godkjennes alle ventende forslag.",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_reminder",
    description:
      "Opprett en påminnelse for brukeren. Påminnelsen vises på dashboardet og i den daglige briefingen. Kan være engangs eller gjentakende (daglig, ukentlig, månedlig).",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Kort tittel for påminnelsen" },
        description: {
          type: "string",
          description: "Utfyllende beskrivelse (valgfritt)",
        },
        remind_at: {
          type: "string",
          description:
            "Tidspunkt for påminnelsen (ISO 8601, f.eks. '2026-06-03T14:00:00'). For gjentakende: neste forekomst.",
        },
        recurring: {
          type: "string",
          enum: ["daily", "weekly", "monthly"],
          description: "Gjentakelsestype. Utelat for engangspåminnelse.",
        },
      },
      required: ["title", "remind_at"],
    },
  },
  {
    name: "list_reminders",
    description:
      "Hent brukerens aktive påminnelser. Viser kommende og gjentakende påminnelser.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_completed: {
          type: "boolean",
          description: "Inkluder fullførte påminnelser (standard false)",
        },
      },
      required: [],
    },
  },
  {
    name: "complete_reminder",
    description:
      "Marker en påminnelse som fullført. For gjentakende påminnelser flyttes tidspunktet til neste forekomst.",
    input_schema: {
      type: "object" as const,
      properties: {
        reminder_id: { type: "string", description: "Påminnelse-ID" },
      },
      required: ["reminder_id"],
    },
  },
  {
    name: "generate_reply_suggestion",
    description:
      "Generer et profesjonelt svarforslag på en e-post. Svaret skrives på norsk.",
    input_schema: {
      type: "object" as const,
      properties: {
        email_id: { type: "string", description: "E-post-ID" },
        tone: {
          type: "string",
          enum: ["formal", "friendly", "brief"],
          description: "Tone for svaret (standard formal)",
        },
        instructions: {
          type: "string",
          description: "Ekstra instruksjoner for svaret",
        },
      },
      required: ["email_id"],
    },
  },
];

/** Utility type: name of any defined tool */
export type AiToolName = (typeof AI_TOOLS)[number]["name"];
