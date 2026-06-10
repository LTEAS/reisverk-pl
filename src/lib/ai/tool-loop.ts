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

const MAX_TOKENS = 8192;

const FALLBACK_ERROR_TEXT = "Beklager, noe gikk galt. Prøv igjen.";
const MAX_ITERATIONS_TEXT =
  "Beklager, jeg nådde maks antall verktøykall. Kan du prøve å formulere spørsmålet annerledes?";

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
// Core tool-use loop — shared between the streaming and non-streaming paths.
// Hooks let the streaming wrapper forward text deltas and tool-call events;
// without hooks it behaves as a plain request/response loop.
// All terminal outcomes (ok, unexpected_stop, max_iterations, error) are
// logged via logAiCall so token usage is always accounted for.
// ---------------------------------------------------------------------------

interface LoopHooks {
  onTextDelta?: (delta: string) => void;
  onToolCall?: (name: string, input: unknown) => void;
}

interface CoreResult extends ToolLoopResult {
  /** True when `response` has already been delivered via onTextDelta. */
  textStreamed: boolean;
}

async function runLoopCore(
  params: ToolLoopParams,
  hooks: LoopHooks = {}
): Promise<CoreResult> {
  const { userId, maxIterations = 10, model = "claude-sonnet-4-6" } = params;

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

  const log = (status: string, errorMessage?: string) =>
    logAiCall({
      userId,
      purpose: "chat",
      model,
      promptTokens: totalIn,
      completionTokens: totalOut,
      totalTokens: totalIn + totalOut,
      durationMs: Date.now() - loopStart,
      status,
      errorMessage,
    });

  const finish = (response: string, textStreamed: boolean): CoreResult => ({
    response,
    toolCalls: allToolCalls,
    conversationBlocks: loopMessages,
    usage: { input_tokens: totalIn, output_tokens: totalOut },
    textStreamed,
  });

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let resp: Anthropic.Message;
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: MAX_TOKENS,
        system: systemBlocks,
        tools: toolsWithCache,
        messages,
      });
      if (hooks.onTextDelta) stream.on("text", hooks.onTextDelta);
      resp = await stream.finalMessage();
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Anthropic API error";
      await log("error", errorMsg);
      throw new Error(`AI-feil: ${errorMsg}`);
    }

    totalIn += resp.usage.input_tokens;
    totalOut += resp.usage.output_tokens;

    const text =
      resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n") || "";

    // Case 1: end_turn — done
    if (resp.stop_reason === "end_turn") {
      loopMessages.push({ role: "assistant", content: resp.content });
      await log("ok");
      return finish(text, true);
    }

    // Case 2: tool_use — execute tools and loop
    if (resp.stop_reason === "tool_use") {
      const toolUseBlocks = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        loopMessages.push({ role: "assistant", content: resp.content });
        await log("ok");
        return finish(text, true);
      }

      const assistantMsg: Anthropic.MessageParam = {
        role: "assistant",
        content: resp.content,
      };
      messages.push(assistantMsg);
      loopMessages.push(assistantMsg);

      // Run tools in parallel, isolating per-tool failures so a single
      // throwing tool can't abort the turn. Every tool_use must get a
      // matching tool_result, otherwise the next API call rejects.
      const toolEntries = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const toolInput = block.input as Record<string, unknown>;
          hooks.onToolCall?.(block.name, toolInput);
          params.onToolCall?.(block.name, toolInput);
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
    await log("unexpected_stop", `Unexpected stop_reason: ${resp.stop_reason}`);
    if (text) {
      loopMessages.push({ role: "assistant", content: resp.content });
      return finish(text, true);
    }
    return finish(FALLBACK_ERROR_TEXT, false);
  }

  // Max iterations reached
  await log("max_iterations", `Reached max iterations (${maxIterations})`);
  return finish(MAX_ITERATIONS_TEXT, false);
}

// ---------------------------------------------------------------------------
// Non-streaming wrapper
// ---------------------------------------------------------------------------

export async function runToolLoop(
  params: ToolLoopParams
): Promise<ToolLoopResult> {
  const { textStreamed: _textStreamed, ...result } = await runLoopCore(params);
  return result;
}

// ---------------------------------------------------------------------------
// Streaming wrapper — emits SSE events (text_delta, tool_call, done, error)
// ---------------------------------------------------------------------------

export function runToolLoopStream(
  params: ToolLoopParams & { threadId?: string }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));

      try {
        const result = await runLoopCore(params, {
          onTextDelta: (delta) => send("text_delta", { delta }),
          onToolCall: (name, input) => send("tool_call", { name, input }),
        });

        // Fallback texts (max iterations, unexpected stop without text) were
        // never streamed live — push them as a single delta first.
        if (!result.textStreamed && result.response) {
          send("text_delta", { delta: result.response });
        }

        send("done", {
          response: result.response,
          toolCalls: result.toolCalls.map((tc) => ({
            name: tc.name,
            input: tc.input,
          })),
          conversationBlocks: result.conversationBlocks.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          usage: result.usage,
          threadId: params.threadId,
        });
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Ukjent feil";
        send("error", { message: errorMsg });
        controller.close();
      }
    },
  });
}
