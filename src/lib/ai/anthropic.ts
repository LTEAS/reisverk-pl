import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Returns a singleton Anthropic SDK client.
 * Reads ANTHROPIC_API_KEY from environment automatically.
 */
export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Call Anthropic messages.create with automatic retry on transient errors
 * (connection errors, timeouts, 529 overloaded).
 */
export async function createMessageWithRetry(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  maxRetries = 3
): Promise<Anthropic.Messages.Message> {
  const anthropic = getAnthropicClient()

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params)
    } catch (err: any) {
      const isRetryable =
        err.message?.includes('Connection error') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('fetch failed') ||
        err.status === 529 || // Anthropic overloaded
        err.status === 503    // Service unavailable
      if (isRetryable && attempt < maxRetries) {
        const delay = attempt * 2000
        console.warn(
          `Anthropic API attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms...`
        )
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }

  // TypeScript: unreachable, but satisfies the compiler
  throw new Error('Retry loop exited unexpectedly')
}
