import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { runToolLoop } from "@/lib/ai/tool-loop";
import { checkQuota } from "@/lib/ai/log";

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

interface ChatRequestBody {
  threadId?: string;
  message: string;
}

export async function POST(request: NextRequest) {
  // -------------------------------------------------------------------------
  // 1. Authenticate
  // -------------------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // -------------------------------------------------------------------------
  // 1b. Check AI quota
  // -------------------------------------------------------------------------
  const quota = await checkQuota(userId);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: "Kvote oppbrukt",
        response: `Du har brukt opp AI-kvoten din denne måneden (${quota.limit} kr). Gå til Innstillinger for å kjøpe mer kreditt.`,
      },
      { status: 200 } // Return 200 so the chat UI can display the message
    );
  }

  // -------------------------------------------------------------------------
  // 2. Parse request
  // -------------------------------------------------------------------------
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ugyldig JSON i request body" },
      { status: 400 }
    );
  }

  const { message } = body;
  let { threadId } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: "Melding er påkrevd" },
      { status: 400 }
    );
  }

  try {
    // -----------------------------------------------------------------------
    // 3. Thread management — create or validate
    // -----------------------------------------------------------------------
    if (threadId) {
      // Verify the thread belongs to this user
      const existing = await prisma.chatThread.findFirst({
        where: { id: threadId, userId },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "Chat-tråd ikke funnet" },
          { status: 404 }
        );
      }
    } else {
      // Create a new thread
      const thread = await prisma.chatThread.create({
        data: {
          userId,
          title: message.slice(0, 100),
        },
      });
      threadId = thread.id;
    }

    // -----------------------------------------------------------------------
    // 4. Save user message
    // -----------------------------------------------------------------------
    await prisma.chatMessage.create({
      data: {
        threadId,
        userId,
        role: "user",
        parts: JSON.parse(
          JSON.stringify([{ type: "text", text: message }])
        ),
      },
    });

    // -----------------------------------------------------------------------
    // 5. Load conversation history (limit 40 messages)
    // -----------------------------------------------------------------------
    const history = await prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      take: 40,
      select: { role: true, parts: true },
    });

    // Convert DB messages to Anthropic message format
    const anthropicMessages: Anthropic.MessageParam[] = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const parts = m.parts as Array<{ type: string; text?: string }>;
        // Simple text extraction for history — tool results are already
        // resolved, so we just send the text content
        const text = parts
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text!)
          .join("\n");

        return {
          role: m.role as "user" | "assistant",
          content: text || "(tom melding)",
        };
      });

    // -----------------------------------------------------------------------
    // 6. Run the tool loop
    // -----------------------------------------------------------------------
    const result = await runToolLoop({
      userId,
      messages: anthropicMessages,
    });

    // -----------------------------------------------------------------------
    // 7. Save assistant response
    // -----------------------------------------------------------------------
    const assistantParts: Array<Record<string, unknown>> = [
      { type: "text", text: result.response },
    ];

    // Include tool call references for UI rendering
    if (result.toolCalls.length > 0) {
      assistantParts.push({
        type: "tool_calls",
        calls: result.toolCalls.map((tc) => ({
          name: tc.name,
          input: tc.input,
        })),
      });
    }

    await prisma.chatMessage.create({
      data: {
        threadId,
        userId,
        role: "assistant",
        parts: JSON.parse(JSON.stringify(assistantParts)),
      },
    });

    // -----------------------------------------------------------------------
    // 8. Update thread title if it was auto-generated
    // -----------------------------------------------------------------------
    if (!body.threadId) {
      // First message — update title based on the conversation
      const titleCandidate = message.slice(0, 80);
      await prisma.chatThread.update({
        where: { id: threadId },
        data: { title: titleCandidate },
      });
    }

    // -----------------------------------------------------------------------
    // 9. Return response
    // -----------------------------------------------------------------------
    return NextResponse.json({
      threadId,
      response: result.response,
      toolCalls: result.toolCalls.map((tc) => ({
        name: tc.name,
        input: tc.input,
      })),
      usage: result.usage,
    });
  } catch (err) {
    console.error("[POST /api/chat] Error:", err);
    const message =
      err instanceof Error ? err.message : "Intern serverfeil";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
