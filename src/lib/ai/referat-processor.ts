/**
 * Automatic meeting minutes (referat) processor.
 *
 * Detects emails with attached meeting minutes, downloads and extracts text,
 * uses AI to identify action items, and creates task suggestions.
 *
 * Runs after email classification in the sync pipeline.
 */

import { prisma } from "@/lib/prisma";
import { getAnthropicClient } from "./anthropic";
import { logAiCall } from "./log";
import {
  graphListAttachments,
  graphGetAttachment,
  type GraphAttachment,
} from "@/lib/microsoft/graph-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReferatAnalysis {
  isReferat: boolean;
  summary: string;
  meetingDate: string | null;
  meetingTitle: string | null;
  participants: string[];
  decisions: string[];
  actionItems: Array<{
    title: string;
    assignee: string | null;
    dueDate: string | null;
    priority: "urgent" | "high" | "normal" | "low";
  }>;
  suggestedProjectCode: string | null;
  _usage?: { input: number; output: number };
}

export interface ReferatResult {
  processed: number;
  referatFound: number;
  suggestionsCreated: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Detection: is this email likely a referat?
// ---------------------------------------------------------------------------

const REFERAT_ATTACHMENT_PATTERNS = [
  /referat/i,
  /møtereferat/i,
  /møteprotokoll/i,
  /protokoll/i,
  /meeting.?minutes/i,
  /minutes.?of.?meeting/i,
  /mom\b/i,
];

const REFERAT_BODY_PATTERNS = [
  /referat\s*(vedlagt|er vedlagt|følger|ligger vedlagt|finnes vedlagt)/i,
  /vedlagt\s*(finner du|er|følger)\s*referat/i,
  /vedlegger?\s*referat/i,
  /møtereferat\s*(vedlagt|er vedlagt)/i,
  /sender?\s*(over|med|herved)\s*referat/i,
  /her\s*(kommer|er|følger)\s*referat/i,
];

function hasReferatAttachment(attachmentNames: string[]): boolean {
  return attachmentNames.some((name) =>
    REFERAT_ATTACHMENT_PATTERNS.some((pattern) => pattern.test(name))
  );
}

function bodyMentionsReferat(bodyText: string | null): boolean {
  if (!bodyText) return false;
  return REFERAT_BODY_PATTERNS.some((pattern) => pattern.test(bodyText));
}

/**
 * Determine if an email is a referat candidate based on attachment names
 * and body text. Requires hasAttachments=true AND either a matching
 * attachment name or clear body mention.
 */
function isReferatCandidate(email: {
  hasAttachments: boolean;
  attachmentNames: string[];
  bodyText: string | null;
  bodyPreview: string | null;
  subject: string | null;
}): boolean {
  if (!email.hasAttachments) return false;

  const nameMatch = hasReferatAttachment(email.attachmentNames);
  const bodyMatch = bodyMentionsReferat(email.bodyText || email.bodyPreview);
  const subjectMatch = REFERAT_ATTACHMENT_PATTERNS.some((p) =>
    p.test(email.subject || "")
  );

  // Need attachment name match OR (body/subject mention + has attachments)
  return nameMatch || (bodyMatch && email.hasAttachments) || (subjectMatch && email.hasAttachments);
}

// ---------------------------------------------------------------------------
// Text extraction from attachments
// ---------------------------------------------------------------------------

const SUPPORTED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/html",
  "application/rtf",
];

function isSupportedAttachment(att: GraphAttachment): boolean {
  if (att.isInline) return false;
  if (att.size > 10 * 1024 * 1024) return false; // skip > 10MB
  return (
    SUPPORTED_CONTENT_TYPES.some((t) => att.contentType?.startsWith(t)) ||
    REFERAT_ATTACHMENT_PATTERNS.some((p) => p.test(att.name))
  );
}

/**
 * Extract text from a base64-encoded attachment. For PDF and DOCX we send
 * the raw content to the AI model for extraction. For text/html we do basic
 * HTML stripping.
 */
function extractTextFromAttachment(
  contentBytes: string,
  contentType: string,
  name: string
): string | null {
  // Plain text
  if (contentType?.startsWith("text/plain")) {
    return Buffer.from(contentBytes, "base64").toString("utf-8").slice(0, 50000);
  }

  // HTML — strip tags
  if (contentType?.startsWith("text/html")) {
    const html = Buffer.from(contentBytes, "base64").toString("utf-8");
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50000);
  }

  // PDF / DOCX — return base64 for AI processing
  // We'll send the base64 content directly to Claude which can read PDFs
  if (
    contentType?.includes("pdf") ||
    contentType?.includes("wordprocessingml") ||
    contentType?.includes("msword") ||
    name.toLowerCase().endsWith(".pdf") ||
    name.toLowerCase().endsWith(".docx") ||
    name.toLowerCase().endsWith(".doc")
  ) {
    // Return a marker so the caller knows to use document content
    return `__BINARY_DOCUMENT__:${contentType}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// AI analysis of referat content
// ---------------------------------------------------------------------------

async function analyzeReferat(
  text: string,
  emailSubject: string | null,
  projectContext: string,
  binaryContent?: { base64: string; mediaType: string }
): Promise<ReferatAnalysis & { _usage?: { input: number; output: number } }> {
  const anthropic = getAnthropicClient();

  const userContent: any[] = [];

  // If we have binary content (PDF/DOCX), send as document
  if (binaryContent) {
    userContent.push({
      type: "document",
      source: {
        type: "base64",
        media_type: binaryContent.mediaType,
        data: binaryContent.base64,
      },
    });
    userContent.push({
      type: "text",
      text: `Analyser dette vedlegget som et møtereferat. E-postens emne: "${emailSubject || "ukjent"}"

BRUKERENS PROSJEKTER:
${projectContext || "Ingen prosjekter registrert"}

${getAnalysisInstructions()}`,
    });
  } else {
    userContent.push({
      type: "text",
      text: `Analyser dette møtereferatet. E-postens emne: "${emailSubject || "ukjent"}"

REFERATETS INNHOLD:
${text.slice(0, 15000)}

BRUKERENS PROSJEKTER:
${projectContext || "Ingen prosjekter registrert"}

${getAnalysisInstructions()}`,
    });
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: userContent }],
  });

  const usage = response.usage
    ? { input: response.usage.input_tokens, output: response.usage.output_tokens }
    : undefined;

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  try {
    const jsonStr = rawText
      .replace(/^```json?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(jsonStr);
    return { ...parsed, _usage: usage };
  } catch {
    return {
      isReferat: false,
      summary: rawText.slice(0, 500),
      meetingDate: null,
      meetingTitle: null,
      participants: [],
      decisions: [],
      actionItems: [],
      suggestedProjectCode: null,
      _usage: usage,
    };
  }
}

function getAnalysisInstructions(): string {
  return `Svar med BARE JSON i dette formatet:
{
  "isReferat": true/false,
  "summary": "Kort oppsummering av referatet (2-4 setninger)",
  "meetingTitle": "Møtetittel eller null",
  "meetingDate": "YYYY-MM-DD eller null",
  "participants": ["Navn1", "Navn2"],
  "decisions": ["Beslutning 1", "Beslutning 2"],
  "actionItems": [
    {
      "title": "Kort, konkret oppgavetittel",
      "assignee": "Ansvarlig person eller null",
      "dueDate": "YYYY-MM-DD eller null",
      "priority": "urgent|high|normal|low"
    }
  ],
  "suggestedProjectCode": "Prosjektkode fra listen over, eller null"
}

Regler:
- "isReferat": Sett til true KUN hvis innholdet faktisk er et møtereferat/protokoll med deltakere, saker/agenda, og eventuelt beslutninger.
- Trekk ut ALLE konkrete handlingspunkter/oppgaver som er nevnt. Inkluder ansvarlig person hvis nevnt.
- Match til riktig prosjekt basert på innholdet og prosjektlisten.
- Skriv oppgavetitler som korte, handlingsbare setninger.
- Sett "priority" basert på hastegrad: tidsfrister nært = high/urgent, ellers normal.
- "decisions": viktige beslutninger tatt i møtet.`;
}

// ---------------------------------------------------------------------------
// Main processing function
// ---------------------------------------------------------------------------

export async function processReferater(
  userId: string
): Promise<ReferatResult> {
  const result: ReferatResult = {
    processed: 0,
    referatFound: 0,
    suggestionsCreated: 0,
    errors: [],
  };

  // Find candidate emails: has attachments, not yet processed for referat,
  // received in the last 14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const candidates = await prisma.email.findMany({
    where: {
      userId,
      hasAttachments: true,
      referatProcessed: false,
      receivedAt: { gte: fourteenDaysAgo },
      noiseScore: { lt: 40 },
      direction: "inbound",
    },
    orderBy: { receivedAt: "desc" },
    take: 10,
    select: {
      id: true,
      graphMessageId: true,
      subject: true,
      bodyText: true,
      bodyPreview: true,
      attachmentNames: true,
      hasAttachments: true,
      projectId: true,
      senderName: true,
      senderEmail: true,
    },
  });

  if (candidates.length === 0) return result;

  // For emails without populated attachmentNames, fetch from Graph API
  for (const email of candidates) {
    if (
      email.hasAttachments &&
      email.attachmentNames.length === 0 &&
      email.graphMessageId
    ) {
      try {
        const attachments = await graphListAttachments(
          userId,
          email.graphMessageId
        );
        email.attachmentNames = attachments
          .filter((a) => !a.isInline)
          .map((a) => a.name);
        // Persist for future use
        if (email.attachmentNames.length > 0) {
          await prisma.email.update({
            where: { id: email.id },
            data: { attachmentNames: email.attachmentNames },
          });
        }
      } catch {
        // Non-critical
      }
    }
  }

  // Filter to only likely referat emails
  const referatEmails = candidates.filter(isReferatCandidate);

  // Mark non-referat candidates as processed so we don't re-check
  const nonReferatIds = candidates
    .filter((e) => !referatEmails.includes(e))
    .map((e) => e.id);
  if (nonReferatIds.length > 0) {
    await prisma.email.updateMany({
      where: { id: { in: nonReferatIds } },
      data: { referatProcessed: true },
    });
  }

  if (referatEmails.length === 0) return result;

  // Get project context for AI matching
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      shortCode: true,
      searchTerms: true,
      byggherre: true,
    },
  });

  const projectContext = projects
    .map(
      (p) =>
        `- ${p.shortCode || p.name} (ID: ${p.id}): ${p.name}${p.byggherre ? `, byggherre: ${p.byggherre}` : ""}${p.searchTerms.length ? `, søkeord: ${p.searchTerms.join(", ")}` : ""}`
    )
    .join("\n");

  // Helper
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Accumulate token usage across all AI calls
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const email of referatEmails) {
    try {
      if (!email.graphMessageId) {
        await prisma.email.update({
          where: { id: email.id },
          data: { referatProcessed: true },
        });
        result.processed++;
        continue;
      }

      // List attachments from Graph API
      const attachments = await graphListAttachments(
        userId,
        email.graphMessageId
      );

      // Find the referat attachment(s)
      const referatAttachments = attachments.filter(
        (att) =>
          isSupportedAttachment(att) &&
          (REFERAT_ATTACHMENT_PATTERNS.some((p) => p.test(att.name)) ||
            // If body mentions referat but no attachment name matches,
            // take the first non-inline document
            (!hasReferatAttachment(email.attachmentNames) &&
              !att.isInline &&
              att.size > 1000))
      );

      if (referatAttachments.length === 0) {
        await prisma.email.update({
          where: { id: email.id },
          data: { referatProcessed: true },
        });
        result.processed++;
        continue;
      }

      // Download the first matching attachment
      const att = referatAttachments[0];
      const fullAttachment = await graphGetAttachment(
        userId,
        email.graphMessageId,
        att.id
      );

      if (!fullAttachment.contentBytes) {
        await prisma.email.update({
          where: { id: email.id },
          data: { referatProcessed: true },
        });
        result.processed++;
        continue;
      }

      // Extract text
      const extractedText = extractTextFromAttachment(
        fullAttachment.contentBytes,
        fullAttachment.contentType,
        fullAttachment.name
      );

      if (!extractedText) {
        await prisma.email.update({
          where: { id: email.id },
          data: { referatProcessed: true },
        });
        result.processed++;
        continue;
      }

      // Analyze with AI
      let analysis: ReferatAnalysis;

      if (extractedText.startsWith("__BINARY_DOCUMENT__:")) {
        // Send binary document directly to Claude
        const mediaType = extractedText.split(":")[1];
        // Map contentType to Claude's supported media types
        let claudeMediaType = "application/pdf";
        if (mediaType.includes("wordprocessingml") || mediaType.includes("msword")) {
          // DOCX — extract what we can from the raw bytes or just send the text context
          // Claude supports PDF natively but not DOCX as document, so we'll describe it
          const bodyContext = email.bodyText || email.bodyPreview || "";
          analysis = await analyzeReferat(
            `Vedlegg: ${fullAttachment.name} (${mediaType})\n\nE-postens innhold som kontekst:\n${bodyContext}`,
            email.subject,
            projectContext
          );
        } else {
          // PDF — send as document
          analysis = await analyzeReferat(
            "",
            email.subject,
            projectContext,
            {
              base64: fullAttachment.contentBytes,
              mediaType: claudeMediaType,
            }
          );
        }
      } else {
        analysis = await analyzeReferat(
          extractedText,
          email.subject,
          projectContext
        );
      }

      // Accumulate token usage
      if (analysis._usage) {
        totalInputTokens += analysis._usage.input;
        totalOutputTokens += analysis._usage.output;
      }

      if (!analysis.isReferat) {
        await prisma.email.update({
          where: { id: email.id },
          data: { referatProcessed: true },
        });
        result.processed++;
        continue;
      }

      result.referatFound++;

      // Determine target project
      let targetProjectId = email.projectId;

      if (!targetProjectId && analysis.suggestedProjectCode) {
        const match = projects.find(
          (p) =>
            p.shortCode?.toLowerCase() ===
              analysis.suggestedProjectCode?.toLowerCase() ||
            p.name
              .toLowerCase()
              .includes(analysis.suggestedProjectCode!.toLowerCase())
        );
        if (match) targetProjectId = match.id;
      }

      // Fallback to "Generelt"
      if (!targetProjectId) {
        const gen = projects.find(
          (p) => p.shortCode === "GEN" || p.name === "Generelt"
        );
        if (gen) targetProjectId = gen.id;
      }

      // If still no project, skip creating suggestions but still save summary
      const summaryText = buildSummary(analysis);

      // Update email with referat info
      await prisma.email.update({
        where: { id: email.id },
        data: {
          referatProcessed: true,
          referatSummary: summaryText,
          projectId: targetProjectId || email.projectId,
        },
      });

      // Create task suggestions for action items
      if (targetProjectId && analysis.actionItems.length > 0) {
        for (const item of analysis.actionItems) {
          await prisma.aiSuggestion.create({
            data: {
              projectId: targetProjectId,
              suggestionType: "new_task",
              title: item.title,
              details: {
                description: item.assignee
                  ? `Ansvarlig: ${item.assignee}`
                  : null,
                priority: item.priority,
                dueDate: item.dueDate,
                source: "referat",
                meetingTitle: analysis.meetingTitle,
                meetingDate: analysis.meetingDate,
                emailSubject: email.subject,
                emailSender: email.senderName || email.senderEmail,
              },
              sourceEmailId: email.id,
              sourceEmailSubject: email.subject,
              status: "pending",
            },
          });
          result.suggestionsCreated++;
        }
      }

      result.processed++;
    } catch (err: any) {
      if (err?.status === 429) {
        console.log("Rate limited during referat processing, waiting 15s...");
        await wait(15000);
      }
      result.errors.push(
        `Email ${email.id}: ${err.message || String(err)}`
      );
      // Mark as processed to avoid infinite retry
      await prisma.email
        .update({
          where: { id: email.id },
          data: { referatProcessed: true },
        })
        .catch(() => {});
      result.processed++;
    }
  }

  // Log with actual token usage
  if (result.referatFound > 0 || totalInputTokens > 0) {
    await logAiCall({
      userId,
      purpose: "referat_processing",
      model: "claude-sonnet-4-20250514",
      promptTokens: totalInputTokens,
      completionTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      durationMs: 0,
      status: result.errors.length > 0 ? "partial" : "success",
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function buildSummary(analysis: ReferatAnalysis): string {
  const parts: string[] = [];

  if (analysis.meetingTitle) {
    parts.push(`**${analysis.meetingTitle}**`);
  }
  if (analysis.meetingDate) {
    parts.push(`Dato: ${analysis.meetingDate}`);
  }
  if (analysis.participants.length > 0) {
    parts.push(`Deltakere: ${analysis.participants.join(", ")}`);
  }

  parts.push("");
  parts.push(analysis.summary);

  if (analysis.decisions.length > 0) {
    parts.push("");
    parts.push("Beslutninger:");
    for (const d of analysis.decisions) {
      parts.push(`- ${d}`);
    }
  }

  if (analysis.actionItems.length > 0) {
    parts.push("");
    parts.push(`${analysis.actionItems.length} handlingspunkt(er) opprettet som forslag.`);
  }

  return parts.join("\n");
}
