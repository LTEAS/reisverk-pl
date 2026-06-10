import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { runToolLoop, runToolLoopStream } from "@/lib/ai/tool-loop";
import { checkQuota } from "@/lib/ai/log";

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

interface ChatRequestBody {
  threadId?: string;
  message: string;
  stream?: boolean;
}

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // 1b. Check AI quota
  const quota = await checkQuota(userId);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: "Kvote oppbrukt",
        response: `Du har brukt opp AI-kvoten din denne måneden (${quota.limit} kr). Gå til Innstillinger for å kjøpe mer kreditt.`,
      },
      { status: 200 }
    );
  }

  // 2. Parse request
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
    // 3. Thread management
    if (threadId) {
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
      const thread = await prisma.chatThread.create({
        data: { userId, title: message.slice(0, 100) },
      });
      threadId = thread.id;
    }

    // 4. Save user message
    await prisma.chatMessage.create({
      data: {
        threadId,
        userId,
        role: "user",
        parts: JSON.parse(JSON.stringify([{ type: "text", text: message }])),
      },
    });

    // 5. Load conversation history (last 40 messages, chronological order)
    const history = (
      await prisma.chatMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { role: true, parts: true },
      })
    ).reverse();

    // Convert DB messages to Anthropic format.
    // Keep full tool_use/tool_result structure for the last N messages.
    const KEEP_FULL_LAST = 10;
    const filtered = history.filter(
      (m) => m.role === "user" || m.role === "assistant"
    );
    const collapseCount = Math.max(0, filtered.length - KEEP_FULL_LAST);

    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (let i = 0; i < filtered.length; i++) {
      const m = filtered[i];
      const parts = m.parts as Array<Record<string, unknown>>;

      if (i >= collapseCount && m.role === "assistant") {
        const stored = parts.find(
          (p) => p.type === "anthropic_conversation"
        );
        if (stored && Array.isArray(stored.messages)) {
          for (const msg of stored.messages as Array<{
            role: string;
            content: unknown;
          }>) {
            anthropicMessages.push({
              role: msg.role as "user" | "assistant",
              content: msg.content as Anthropic.ContentBlockParam[],
            });
          }
          continue;
        }
      }

      const text = parts
        .filter(
          (p) => p.type === "text" && typeof p.text === "string" && p.text
        )
        .map((p) => p.text as string)
        .join("\n");

      anthropicMessages.push({
        role: m.role as "user" | "assistant",
        content: text || "(tom melding)",
      });
    }

    // 6. Run the tool loop (streaming or non-streaming)
    if (body.stream) {
      const rawStream = runToolLoopStream({
        userId,
        messages: anthropicMessages,
        threadId,
      });

      // Buffer the SSE byte stream so the "done" event is parsed reliably
      // even when it is split across chunk boundaries.
      const decoder = new TextDecoder();
      let sseBuffer = "";
      const persist = new TransformStream<Uint8Array, Uint8Array>({
        async transform(chunk, ctrl) {
          ctrl.enqueue(chunk);
          sseBuffer += decoder.decode(chunk, { stream: true });

          // Process complete events (terminated by blank line)
          let sep: number;
          while ((sep = sseBuffer.indexOf("\n\n")) !== -1) {
            const rawEvent = sseBuffer.slice(0, sep);
            sseBuffer = sseBuffer.slice(sep + 2);
            if (!rawEvent.includes("event: done")) continue;
            try {
              const dataLine = rawEvent
                .split("\n")
                .find((l) => l.startsWith("data: "));
              if (dataLine) {
                const doneData = JSON.parse(dataLine.slice(6));
                const msgParts: Array<Record<string, unknown>> = [
                  { type: "text", text: doneData.response },
                ];
                if (doneData.toolCalls?.length > 0) {
                  msgParts.push({
                    type: "tool_calls",
                    calls: doneData.toolCalls,
                  });
                }
                if (doneData.conversationBlocks?.length > 0) {
                  msgParts.push({
                    type: "anthropic_conversation",
                    messages: doneData.conversationBlocks,
                  });
                }
                await prisma.chatMessage.create({
                  data: {
                    threadId: threadId!,
                    userId,
                    role: "assistant",
                    parts: JSON.parse(JSON.stringify(msgParts)),
                  },
                });
                if (!body.threadId) {
                  await prisma.chatThread.update({
                    where: { id: threadId! },
                    data: { title: message.slice(0, 80) },
                  });
                }
              }
            } catch (e) {
              console.error("[POST /api/chat] Error persisting stream:", e);
            }
          }
        },
      });

      return new Response(rawStream.pipeThrough(persist), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming path
    const result = await runToolLoop({
      userId,
      messages: anthropicMessages,
    });

    // 7. Save assistant response
    const assistantParts: Array<Record<string, unknown>> = [
      { type: "text", text: result.response },
    ];

    if (result.toolCalls.length > 0) {
      assistantParts.push({
        type: "tool_calls",
        calls: result.toolCalls.map((tc) => ({
          name: tc.name,
          input: tc.input,
        })),
      });
    }

    if (result.conversationBlocks.length > 0) {
      assistantParts.push({
        type: "anthropic_conversation",
        messages: result.conversationBlocks.map((msg) => ({
          role: msg.role,
          content: msg.content,
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

    // 8. Update thread title if first message
    if (!body.threadId) {
      await prisma.chatThread.update({
        where: { id: threadId },
        data: { title: message.slice(0, 80) },
      });
    }

    // 9. Return response
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
    const errMessage =
      err instanceof Error ? err.message : "Intern serverfeil";
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}
