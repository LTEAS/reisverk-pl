import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "./anthropic";
import { AI_TOOLS } from "./tool-definitions";
import { executeTool } from "./tool-executor";
import { buildSystemPrompt } from "./system-prompt";
import { logAiCall } from "./log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallRecord {
  name: string;
  input: unknown;
  result: string;
}

export interface ToolLoopParams {
  userId: string;
  messages: Anthropic.MessageParam[];
  systemPrompt?: string;
  maxIterations?: number;
  model?: string;
  onToolCall?: (toolName: string, input: unknown) => void;
}

export interface ToolLoopResult {
  response: string;
  toolCalls: ToolCallRecord[];
  conversationBlocks: Anthropic.MessageParam[];
  usage: { input_tokens: number; output_tokens: number };
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// Shared: build system + tools params with prompt caching
// ---------------------------------------------------------------------------

function buildCachedSystemBlocks(systemPrompt: string) {
  return [
    {
      type: "text" as const,
      text: systemPrompt,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

function buildCachedTools() {
  return AI_TOOLS.map((tool, i) =>
    i === AI_TOOLS.length - 1
      ? { ...tool, cache_control: { type: "ephemeral" as const } }
      : tool
  );
}

// ---------------------------------------------------------------------------
// Core tool-use loop (non-streaming)
// ---------------------------------------------------------------------------

export async function runToolLoop(
  params: ToolLoopParams
): Promise<ToolLoopResult> {
  const {
    userId,
    maxIterations = 10,
    model = "claude-sonnet-4-6",
    onToolCall,
  } = params;

  const systemPrompt =
    params.systemPrompt ?? (await buildSystemPrompt(userId));

  const client = getAnthropicClient();
  const messages: Anthropic.MessageParam[] = [...params.messages];
  const allToolCalls: ToolCallRecord[] = [];
  const loopMessages: Anthropic.MessageParam[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const loopStart = Date.now();

  const systemBlocks = buildCachedSystemBlocks(systemPrompt);
  const toolsWithCache = buildCachedTools();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const iterStart = Date.now();

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: systemBlocks,
        tools: toolsWithCache,
        messages,
      });
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Anthropic API error";

      await logAiCall({
        userId,
        purpose: "chat",
        model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs: Date.now() - iterStart,
        status: "error",
        errorMessage: errorMsg,
      });

      throw new Error(`AI-feil: ${errorMsg}`);
    }

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Case 1: end_turn
    if (response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      const responseText = textBlocks.map((b) => b.text).join("\n") || "";

      await logAiCall({
        userId,
        purpose: "chat",
        model,
        promptTokens: totalInputTokens,
        completionTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        durationMs: Date.now() - loopStart,
        status: "ok",
      });

      loopMessages.push({ role: "assistant", content: response.content });

      return {
        response: responseText,
        toolCalls: allToolCalls,
        conversationBlocks: loopMessages,
        usage: {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        },
      };
    }

    // Case 2: tool_use
    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        const textBlocks = response.content.filter(
          (b): b is Anthropic.TextBlock => b.type === "text"
        );
        return {
          response: textBlocks.map((b) => b.text).join("\n") || "",
          toolCalls: allToolCalls,
          conversationBlocks: loopMessages,
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          },
        };
      }

      const assistantMsg: Anthropic.MessageParam = {
        role: "assistant",
        content: response.content,
      };
      messages.push(assistantMsg);
      loopMessages.push(assistantMsg);

      // Execute all tools in parallel, isolating per-tool failures so a single
      // throwing tool can't abort the turn. Every tool_use must get a matching
      // tool_result, otherwise the next API call rejects.
      const toolEntries = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const toolInput = block.input as Record<string, unknown>;
          onToolCall?.(block.name, toolInput);
          try {
            const result = await executeTool(block.name, toolInput, userId);
            return { block, toolInput, result, isError: false };
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Ukjent verktøyfeil";
            return {
              block,
              toolInput,
              result: `Feil under kjøring av ${block.name}: ${msg}`,
              isError: true,
            };
          }
        })
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const { block, toolInput, result, isError } of toolEntries) {
        allToolCalls.push({ name: block.name, input: toolInput, result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
          is_error: isError,
        });
      }

      const toolResultMsg: Anthropic.MessageParam = {
        role: "user",
        content: toolResults,
      };
      messages.push(toolResultMsg);
      loopMessages.push(toolResultMsg);
      continue;
    }

    // Case 3: unexpected stop reason
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );

    await logAiCall({
      userId,
      purpose: "chat",
      model,
      promptTokens: totalInputTokens,
      completionTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      durationMs: Date.now() - loopStart,
      status: "unexpected_stop",
      errorMessage: `Unexpected stop_reason: ${response.stop_reason}`,
    });

    return {
      response:
        textBlocks.map((b) => b.text).join("\n") ||
        "Beklager, noe gikk galt. Prøv igjen.",
      toolCalls: allToolCalls,
      conversationBlocks: loopMessages,
      usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      },
    };
  }

  // Max iterations reached
  await logAiCall({
    userId,
    purpose: "chat",
    model,
    promptTokens: totalInputTokens,
    completionTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    durationMs: Date.now() - loopStart,
    status: "max_iterations",
    errorMessage: `Reached max iterations (${maxIterations})`,
  });

  return {
    response:
      "Beklager, jeg nådde maks antall verktøykall. Kan du prøve å formulere spørsmålet annerledes?",
    toolCalls: allToolCalls,
    conversationBlocks: loopMessages,
    usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Streaming tool-use loop
// ---------------------------------------------------------------------------

export interface StreamToolLoopParams extends ToolLoopParams {}

export function runToolLoopStream(
  params: StreamToolLoopParams & { threadId?: string }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  // Emit only the terminal "done" metadata event. Used when the assistant
  // text has already been streamed live via the text-delta handler.
  function emitDone(
    controller: ReadableStreamDefaultController<Uint8Array>,
    fullText: string,
    allToolCalls: ToolCallRecord[],
    loopMessages: Anthropic.MessageParam[],
    totalIn: number,
    totalOut: number,
    threadId: string | undefined
  ) {
    controller.enqueue(
      encoder.encode(
        sseEvent("done", {
          response: fullText,
          toolCalls: allToolCalls.map((tc) => ({ name: tc.name, input: tc.input })),
          conversationBlocks: loopMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          usage: { input_tokens: totalIn, output_tokens: totalOut },
          threadId,
        })
      )
    );
    controller.close();
  }

  // For fallback paths where nothing was streamed live (unexpected stop with
  // no text, max iterations): push the static text as one delta, then close.
  function emitStaticAndDone(
    controller: ReadableStreamDefaultController<Uint8Array>,
    fullText: string,
    allToolCalls: ToolCallRecord[],
    loopMessages: Anthropic.MessageParam[],
    totalIn: number,
    totalOut: number,
    threadId: string | undefined
  ) {
    controller.enqueue(
      encoder.encode(sseEvent("text_delta", { delta: fullText }))
    );
    emitDone(controller, fullText, allToolCalls, loopMessages, totalIn, totalOut, threadId);
  }

  return new ReadableStream({
    async start(controller) {
      const {
        userId,
        maxIterations = 10,
        model = "claude-sonnet-4-6",
        threadId,
      } = params;

      const systemPrompt =
        params.systemPrompt ?? (await buildSystemPrompt(userId));
      const client = getAnthropicClient();
      const messages: Anthropic.MessageParam[] = [...params.messages];
      const allToolCalls: ToolCallRecord[] = [];
      const loopMessages: Anthropic.MessageParam[] = [];
      let totalIn = 0;
      let totalOut = 0;
      const loopStart = Date.now();

      const systemBlocks = buildCachedSystemBlocks(systemPrompt);
      const toolsWithCache = buildCachedTools();

      try {
        for (let iteration = 0; iteration < maxIterations; iteration++) {
          // Real streaming: forward text deltas to the client as they arrive.
          const stream = client.messages.stream({
            model,
            max_tokens: 8192,
            system: systemBlocks,
            tools: toolsWithCache,
            messages,
          });
          stream.on("text", (delta: string) => {
            controller.enqueue(
              encoder.encode(sseEvent("text_delta", { delta }))
            );
          });
          const resp = await stream.finalMessage();

          totalIn += resp.usage.input_tokens;
          totalOut += resp.usage.output_tokens;

          // end_turn: text was already streamed live; emit only metadata.
          if (resp.stop_reason === "end_turn") {
            const fullText =
              resp.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("\n") || "";

            loopMessages.push({ role: "assistant", content: resp.content });

            await logAiCall({
              userId,
              purpose: "chat",
              model,
              promptTokens: totalIn,
              completionTokens: totalOut,
              totalTokens: totalIn + totalOut,
              durationMs: Date.now() - loopStart,
              status: "ok",
            });

            emitDone(controller, fullText, allToolCalls, loopMessages, totalIn, totalOut, threadId);
            return;
          }

          // tool_use: execute tools, notify client, loop
          if (resp.stop_reason === "tool_use") {
            const toolUseBlocks = resp.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
            );

            if (toolUseBlocks.length === 0) {
              const text =
                resp.content
                  .filter((b): b is Anthropic.TextBlock => b.type === "text")
                  .map((b) => b.text)
                  .join("\n") || "";
              emitDone(controller, text, allToolCalls, loopMessages, totalIn, totalOut, threadId);
              return;
            }

            const assistantMsg: Anthropic.MessageParam = {
              role: "assistant",
              content: resp.content,
            };
            messages.push(assistantMsg);
            loopMessages.push(assistantMsg);

            for (const block of toolUseBlocks) {
              controller.enqueue(
                encoder.encode(
                  sseEvent("tool_call", { name: block.name, input: block.input })
                )
              );
            }

            // Run tools in parallel, but isolate failures: a single throwing
            // tool must not abort the turn, and every tool_use needs a matching
            // tool_result or the next API call rejects.
            const toolEntries = await Promise.all(
              toolUseBlocks.map(async (block) => {
                const toolInput = block.input as Record<string, unknown>;
                try {
                  const result = await executeTool(block.name, toolInput, userId);
                  return { block, toolInput, result, isError: false };
                } catch (err) {
                  const msg =
                    err instanceof Error ? err.message : "Ukjent verktøyfeil";
                  return {
                    block,
                    toolInput,
                    result: `Feil under kjøring av ${block.name}: ${msg}`,
                    isError: true,
                  };
                }
              })
            );

            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const { block, toolInput, result, isError } of toolEntries) {
              allToolCalls.push({ name: block.name, input: toolInput, result });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result,
                is_error: isError,
              });
            }

            const toolResultMsg: Anthropic.MessageParam = {
              role: "user",
              content: toolResults,
            };
            messages.push(toolResultMsg);
            loopMessages.push(toolResultMsg);
            continue;
          }

          // Unexpected stop reason
          const streamedText = resp.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n");
          if (streamedText) {
            // Already streamed live — emit metadata only.
            emitDone(controller, streamedText, allToolCalls, loopMessages, totalIn, totalOut, threadId);
          } else {
            emitStaticAndDone(
              controller,
              "Beklager, noe gikk galt. Prøv igjen.",
              allToolCalls,
              loopMessages,
              totalIn,
              totalOut,
              threadId
            );
          }
          return;
        }

        // Max iterations reached
        emitStaticAndDone(
          controller,
          "Beklager, jeg nådde maks antall verktøykall. Kan du prøve å formulere spørsmålet annerledes?",
          allToolCalls,
          loopMessages,
          totalIn,
          totalOut,
          threadId
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Ukjent feil";
        controller.enqueue(
          encoder.encode(sseEvent("error", { message: errorMsg }))
        );
        controller.close();
      }
    },
  });
}
