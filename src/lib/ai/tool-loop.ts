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
  usage: { input_tokens: number; output_tokens: number };
}

// ---------------------------------------------------------------------------
// Core tool-use loop
// ---------------------------------------------------------------------------

/**
 * Runs the agentic tool-use loop:
 *   1. Call Anthropic with system prompt + tools + messages
 *   2. If stop_reason === "end_turn" → return the text
 *   3. If stop_reason === "tool_use" → execute tools, append results, loop
 *   4. Enforce maxIterations to prevent runaway loops
 */
export async function runToolLoop(
  params: ToolLoopParams
): Promise<ToolLoopResult> {
  const {
    userId,
    maxIterations = 10,
    model = "claude-sonnet-4-6",
    onToolCall,
  } = params;

  // Build system prompt if not provided
  const systemPrompt =
    params.systemPrompt ?? (await buildSystemPrompt(userId));

  const client = getAnthropicClient();

  // Clone messages so we don't mutate the caller's array
  const messages: Anthropic.MessageParam[] = [...params.messages];

  const allToolCalls: ToolCallRecord[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const loopStart = Date.now();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const iterStart = Date.now();

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: AI_TOOLS,
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

    // Accumulate usage
    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // -----------------------------------------------------------------------
    // Case 1: end_turn — extract text and return
    // -----------------------------------------------------------------------
    if (response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      const responseText =
        textBlocks.map((b) => b.text).join("\n") || "";

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

      return {
        response: responseText,
        toolCalls: allToolCalls,
        usage: {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        },
      };
    }

    // -----------------------------------------------------------------------
    // Case 2: tool_use — execute tools and loop
    // -----------------------------------------------------------------------
    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        // Shouldn't happen, but handle gracefully
        const textBlocks = response.content.filter(
          (b): b is Anthropic.TextBlock => b.type === "text"
        );
        return {
          response: textBlocks.map((b) => b.text).join("\n") || "",
          toolCalls: allToolCalls,
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          },
        };
      }

      // Append the full assistant response (with both text and tool_use blocks)
      messages.push({
        role: "assistant",
        content: response.content,
      });

      // Execute each tool and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const toolInput = block.input as Record<string, unknown>;

        // Notify callback if provided
        onToolCall?.(block.name, toolInput);

        const result = await executeTool(block.name, toolInput, userId);

        allToolCalls.push({
          name: block.name,
          input: toolInput,
          result,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      // Append tool results as user message
      messages.push({
        role: "user",
        content: toolResults,
      });

      // Continue loop — next iteration will call Anthropic again
      continue;
    }

    // -----------------------------------------------------------------------
    // Case 3: unexpected stop reason — return whatever we have
    // -----------------------------------------------------------------------
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
      usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Max iterations reached
  // -----------------------------------------------------------------------
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
    usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    },
  };
}
