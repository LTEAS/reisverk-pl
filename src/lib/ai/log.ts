import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

// Prices per 1M tokens (USD), converted to NOK at ~11 NOK/USD
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 0.033, output: 0.165 },  // $3/$15 per 1M → NOK
  'claude-opus-4-20250514': { input: 0.165, output: 0.825 },    // $15/$75 per 1M → NOK
  'claude-haiku-3-5-20241022': { input: 0.0088, output: 0.044 }, // $0.80/$4 per 1M → NOK
}

function estimateCostNok(model: string, promptTokens: number, completionTokens: number): number {
  // Find pricing — match partial model name
  const pricing = Object.entries(MODEL_PRICING).find(([key]) =>
    model.includes(key) || key.includes(model)
  )?.[1] || MODEL_PRICING['claude-sonnet-4-20250514'] // default to Sonnet

  const inputCost = (promptTokens / 1_000_000) * pricing.input * 11
  const outputCost = (completionTokens / 1_000_000) * pricing.output * 11
  return Math.round((inputCost + outputCost) * 100) / 100
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
       