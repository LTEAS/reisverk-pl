import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Returns a singleton Anthropic SDK client.
 * Reads ANTHROPIC_API_KEY from environment automatically.
 */
export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      timeout: 30_000, // 30s per request — fail fast instead of hanging
      maxRetries: 0,   // We handle retries ourselves
    });
  }
  return client;
}

/**
 * Call Anthropic messages.create with automatic retry on transient errors
 * (connection errors, timeouts, 529 overloaded).
 * Retries twice with short delays (1s, 2s) to stay within Vercel timeouts.
 */
export async function createMessageWithRetry(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  maxRetries = 2
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
        const delay = attempt * 1000
        console.warn(
          `Anthropic API attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms...`
        )
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }

  throw new Error('Retry loop exited unexpectedly')
}
