/**
 * Microsoft Graph API client with automatic token refresh.
 */

import { prisma } from '@/lib/prisma'

const TOKEN_ENDPOINT =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
}

/**
 * Get a valid access token for the given user. Refreshes automatically if
 * the stored token has expired (or will expire within 5 minutes).
 */
export async function getAccessToken(userId: string): Promise<string> {
  const account = await prisma.microsoftAccount.findUnique({
    where: { userId },
  })

  if (!account?.refreshToken) {
    throw new Error('No Microsoft account connected')
  }

  // Return existing token if still valid for > 5 min
  if (
    account.accessToken &&
    account.expiresAt &&
    account.expiresAt.getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return account.accessToken
  }

  // Refresh the token
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: account.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('Token refresh failed:', err)
    throw new Error(
      `Token refresh failed: ${err.error_description || err.error || res.status}`
    )
  }

  const data: TokenResponse = await res.json()
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  await prisma.microsoftAccount.update({
    where: { userId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || account.refreshToken,
      expiresAt,
      scope: data.scope || account.scope,
    },
  })

  return data.access_token
}

// ---------------------------------------------------------------------------
// Generic Graph API helpers
// ---------------------------------------------------------------------------

export interface GraphResponse<T> {
  value: T[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

/**
 * Make a GET request to Microsoft Graph.
 */
export async function graphGet<T = any>(
  userId: string,
  path: string
): Promise<T> {
  const token = await getAccessToken(userId)
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `Graph API error ${res.status}: ${err.error?.message || JSON.stringify(err)}`
    )
  }

  return res.json()
}

/**
 * Make a POST request to Microsoft Graph. Returns parsed JSON.
 */
export async function graphPost<T = any>(
  userId: string,
  path: string,
  body: unknown
): Promise<T> {
  const token = await getAccessToken(userId)
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `Graph API error ${res.status}: ${err.error?.message || JSON.stringify(err)}`
    )
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Attachment helpers
// ---------------------------------------------------------------------------

export interface GraphAttachment {
  id: string
  name: string
  contentType: string
  size: number
  isInline: boolean
  contentBytes?: string // base64-encoded content
}

/**
 * List attachments on a message (metadata only, no content).
 */
export async function graphListAttachments(
  userId: string,
  messageId: string
): Promise<GraphAttachment[]> {
  const data = await graphGet<{ value: GraphAttachment[] }>(
    userId,
    `/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`
  )
  return data.value || []
}

/**
 * Download a single attachment with its content (base64).
 */
export async function graphGetAttachment(
  userId: string,
  messageId: string,
  attachmentId: string
): Promise<GraphAttachment> {
  return graphGet<GraphAttachment>(
    userId,
    `/me/messages/${messageId}/attachments/${attachmentId}`
  )
}

/**
 * Paginate through all results of a Graph list endpoint.
 * Returns items + optional deltaLink for incremental sync.
 */
export async function graphGetAll<T = any>(
  userId: string,
  path: string,
  maxPages = 10
): Promise<{ items: T[]; deltaLink?: string }> {
  const items: T[] = []
  let nextLink: string | undefined = path
  let deltaLink: string | undefined
  let page = 0

  while (nextLink && page < maxPages) {
    const data: GraphResponse<T> = await graphGet<GraphResponse<T>>(userId, nextLink)
    items.push(...(data.value || []))
    nextLink = data['@odata.nextLink']
    deltaLink = data['@odata.deltaLink']
    page++
  }

  return { items, deltaLink }
}
