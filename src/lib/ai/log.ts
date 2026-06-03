import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

// Prices per 1M tokens (USD). Matched by model family so version suffixes
// (e.g. sonnet-4-6, haiku-4-5) resolve correctly. Converted to NOK below.
const USD_TO_NOK = 11

const MODEL_PRICING: Record<'sonnet' | 'haiku' | 'opus', { input: number; output: number }> = {
  sonnet: { input: 3, output: 15 },  // Claude Sonnet 4 / 4.6 — $3 / $15 per 1M
  haiku: { input: 1, output: 5 },    // Claude Haiku 4.5 — $1 / $5 per 1M
  opus: { input: 5, output: 25 },    // Claude Opus 4.x — $5 / $25 per 1M
}

function estimateCostNok(model: string, promptTokens: number, completionTokens: number): number {
  const m = model.toLowerCase()
  const pricing = m.includes('opus')
    ? MODEL_PRICING.opus
    : m.includes('haiku')
      ? MODEL_PRICING.haiku
      : MODEL_PRICING.sonnet // default: all Sonnet variants

  const inputCost = (promptTokens / 1_000_000) * pricing.input * USD_TO_NOK
  const outputCost = (completionTokens / 1_000_000) * pricing.output * USD_TO_NOK
  return Math.round((inputCost + outputCost) * 10000) / 10000
}

// ---------------------------------------------------------------------------
// Quota check
// ---------------------------------------------------------------------------

export class QuotaExceededError extends Error {
  constructor(public remaining: number, public limit: number) {
    super(`AI-kvote oppbrukt. Brukt: ${limit - remaining} kr av ${limit} kr.`)
    this.name = 'QuotaExceededError'
  }
}

export async function checkQuota(userId: string): Promise<{ ok: boolean; remaining: number; limit: number }> {
  // Check if user has free account or active trial — bypass quota
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { isFreeAccount: true, status: true, trialEndsAt: true },
  })

  if (subscription?.isFreeAccount) {
    return { ok: true, remaining: 9999, limit: 9999 }
  }

  if (subscription?.status === 'trial' && subscription.trialEndsAt && subscription.trialEndsAt > new Date()) {
    return { ok: true, remaining: 9999, limit: 9999 }
  }

  const periodMonth = new Date().toISOString().slice(0, 7)

  const usage = await prisma.monthlyUsage.findUnique({
    where: { userId_periodMonth: { userId, periodMonth } },
  })

  const limit = usage?.creditLimitNok ?? 100
  const spent = usage?.totalCostNok ?? 0
  const remaining = Math.max(limit - spent, 0)

  return { ok: remaining > 0, remaining, limit }
}

// ---------------------------------------------------------------------------
// Logging + usage tracking
// ---------------------------------------------------------------------------

/**
 * Best-effort AI call logging. Never throws — errors are silently swallowed
 * so that logging failures don't break the chat flow.
 */
export async function logAiCall(params: {
  userId: string;
  purpose: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  status: string;
  errorMessage?: string;
}): Promise<void> {
  try {
    const costNok = estimateCostNok(params.model, params.promptTokens, params.completionTokens)
    const periodMonth = new Date().toISOString().slice(0, 7)

    // Log the call
    await prisma.aiCallLog.create({
      data: {
        userId: params.userId,
        purpose: params.purpose,
        model: params.model,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens: params.totalTokens,
        durationMs: params.durationMs,
        estimatedCostNok: costNok,
        status: params.status,
        errorMessage: params.errorMessage ?? null,
      },
    });

    // Update monthly usage (upsert)
    if (params.status === 'success' || params.status === 'ok') {
      await prisma.monthlyUsage.upsert({
        where: { userId_periodMonth: { userId: params.userId, periodMonth } },
        create: {
          userId: params.userId,
          periodMonth,
          totalCostNok: costNok,
          totalCalls: 1,
          totalTokens: params.totalTokens,
          creditLimitNok: 100,
        },
        update: {
          totalCostNok: { increment: costNok },
          totalCalls: { increment: 1 },
          totalTokens: { increment: params.totalTokens },
        },
      });
    }
  } catch {
    // Best-effort — never throw from logging
    console.error("[logAiCall] Failed to log AI call:", params.purpose);
  }
}
