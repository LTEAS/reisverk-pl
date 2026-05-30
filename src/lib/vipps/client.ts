// ---------------------------------------------------------------------------
// Vipps ePayment API client
// ---------------------------------------------------------------------------

const VIPPS_API_BASE = process.env.VIPPS_API_BASE || 'https://api.vipps.no'
const VIPPS_CLIENT_ID = process.env.VIPPS_CLIENT_ID!
const VIPPS_CLIENT_SECRET = process.env.VIPPS_CLIENT_SECRET!
const VIPPS_SUBSCRIPTION_KEY = process.env.VIPPS_SUBSCRIPTION_KEY!
const VIPPS_MSN = process.env.VIPPS_MERCHANT_SERIAL_NUMBER!

// ---------------------------------------------------------------------------
// Access token (cached in-memory with TTL)
// ---------------------------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null

export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  const res = await fetch(`${VIPPS_API_BASE}/accesstoken/get`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client_id': VIPPS_CLIENT_ID,
      'client_secret': VIPPS_CLIENT_SECRET,
      'Ocp-Apim-Subscription-Key': VIPPS_SUBSCRIPTION_KEY,
      'Merchant-Serial-Number': VIPPS_MSN,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Vipps access token failed (${res.status}): ${body}`)
  }

  const data = await res.json() as {
    token_type: string
    access_token: string
    expires_in: string
    ext_expires_in: string
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + parseInt(data.expires_in) * 1000,
  }

  return cachedToken.token
}

// ---------------------------------------------------------------------------
// Common headers
// ---------------------------------------------------------------------------

async function vippsHeaders(idempotencyKey: string): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Ocp-Apim-Subscription-Key': VIPPS_SUBSCRIPTION_KEY,
    'Merchant-Serial-Number': VIPPS_MSN,
    'Idempotency-Key': idempotencyKey,
    'Vipps-System-Name': 'Reisverk',
    'Vipps-System-Version': '1.0.0',
  }
}

// ---------------------------------------------------------------------------
// Create ePayment
// ---------------------------------------------------------------------------

export interface CreatePaymentParams {
  /** Amount in NOK (will be converted to øre) */
  amountNok: number
  /** Unique reference for this payment */
  reference: string
  /** Description shown to user in Vipps */
  description: string
  /** URL to redirect user back to after payment */
  returnUrl: string
  /** Optional customer phone number (8 digits, no country code) */
  phoneNumber?: string
}

export interface CreatePaymentResult {
  reference: string
  redirectUrl: string
}

export async function createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
  const headers = await vippsHeaders(params.reference)

  const body = {
    amount: {
      value: params.amountNok * 100, // NOK → øre
      currency: 'NOK',
    },
    paymentMethod: { type: 'WALLET' },
    reference: params.reference,
    userFlow: 'WEB_REDIRECT',
    returnUrl: params.returnUrl,
    paymentDescription: params.description,
    ...(params.phoneNumber ? {
      customer: { phoneNumber: `47${params.phoneNumber}` },
    } : {}),
  }

  const res = await fetch(`${VIPPS_API_BASE}/epayment/v1/payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Vipps create payment failed (${res.status}): ${errBody}`)
  }

  const data = await res.json() as { reference: string; redirectUrl: string }
  return data
}

// ---------------------------------------------------------------------------
// Get payment status
// ---------------------------------------------------------------------------

export type VippsPaymentState = 'CREATED' | 'AUTHORIZED' | 'ABORTED' | 'EXPIRED' | 'TERMINATED'

export interface VippsPaymentStatus {
  reference: string
  state: VippsPaymentState
  amount: { value: number; currency: string }
  aggregate: {
    authorizedAmount: { value: number; currency: string }
    cancelledAmount: { value: number; currency: string }
    capturedAmount: { value: number; currency: string }
    refundedAmount: { value: number; currency: string }
  }
}

export async function getPaymentStatus(reference: string): Promise<VippsPaymentStatus> {
  const headers = await vippsHeaders(`status-${reference}`)

  const res = await fetch(`${VIPPS_API_BASE}/epayment/v1/payments/${reference}`, {
    method: 'GET',
    headers,
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Vipps get payment failed (${res.status}): ${errBody}`)
  }

  return await res.json() as VippsPaymentStatus
}

// ---------------------------------------------------------------------------
// Capture payment (after AUTHORIZED)
// ---------------------------------------------------------------------------

export async function capturePayment(reference: string, amountInOre: number): Promise<void> {
  const headers = await vippsHeaders(`capture-${reference}`)

  const body = {
    modificationAmount: {
      value: amountInOre,
      currency: 'NOK',
    },
  }

  const res = await fetch(`${VIPPS_API_BASE}/epayment/v1/payments/${reference}/capture`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Vipps capture failed (${res.status}): ${errBody}`)
  }
}

// ---------------------------------------------------------------------------
// Cancel payment
// ---------------------------------------------------------------------------

export async function cancelPayment(reference: string): Promise<void> {
  const headers = await vippsHeaders(`cancel-${reference}`)

  const res = await fetch(`${VIPPS_API_BASE}/epayment/v1/payments/${reference}/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const errBody = await res.text()
    // Don't throw if already cancelled/captured
    if (res.status !== 409) {
      throw new Error(`Vipps cancel failed (${res.status}): ${errBody}`)
    }
  }
}
