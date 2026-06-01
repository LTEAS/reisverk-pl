import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Returns a singleton Anthropic SDK client.
 * Reads ANTHROPIC_API_KEY from environment automatically.
 */
export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      timeout: 30_000, // 30s default — overridden per call when needed
      maxRetries: 0,   // We handle retries ourselves
    });
  }
  return client;
}

/**
 * Call Anthropic messages.create with automatic retry on transient errors.
 * @param params - Message creation params
 * @param options.maxRetries - Number of attempts (default 2)
 * @param options.timeoutMs - Per-request timeout in ms (default: client default 30s)
 */
export async function createMessageWithRetry(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  options: { maxRetries?: number; timeoutMs?: number } = {}
): Promise<Anthropic.Messages.Message> {
  const { maxRetries = 2, timeoutMs } = options
  const anthropic = getAnthropicClient()

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(
        params,
        timeoutMs ? { timeout: timeoutMs } : undefined
      )
    } catch (err: any) {
      const isRetryable =
        err.message?.includes('Connection error') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('fetch failed') ||
        err.message?.includes('timed out') ||
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
