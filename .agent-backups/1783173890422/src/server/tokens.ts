/**
 * Mantiz API Token Management
 *
 * Server functions for generating, listing, revoking, and verifying
 * API tokens used for external integrations (GitHub Actions, CLI, etc.)
 */

import { createServerFn } from '@tanstack/react-start'
import crypto from 'node:crypto'
import { db } from '../lib/db'
import { users, apiTokens, scans, findings } from '../schemas/index'
import { eq, and, desc } from 'drizzle-orm'
import { checkRateLimit } from './rate-limiter'
import { validateTokenName } from './middleware'
import { requireAuth } from './auth-utils.server'

// ─── Token Generation ────────────────────────────────────────────

const TOKEN_PREFIX = 'mtz_'

function generateToken(): { raw: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(32).toString('hex')
  const raw = `${TOKEN_PREFIX}${random}`
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  return { raw, prefix: raw.slice(0, 12), hash }
}

/**
 * Generate a new API token for the current user.
 * Returns the raw token (only shown once) — store the hash in DB.
 */
export const createToken = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input as { name: string })
  .handler(async ({ data }) => {
    const session = requireAuth()

    // Rate limit: max 3 tokens per hour
    const rateResult = checkRateLimit('strict', `create_token:${session.dbUserId}`)
    if (!rateResult.allowed) {
      throw new Error('Rate limit exceeded. Maximum 3 tokens per hour.')
    }

    // Validate token name
    const nameValidation = validateTokenName(data.name)
    if (!nameValidation.valid) {
      throw new Error(nameValidation.error)
    }

    const { raw, prefix, hash } = generateToken()

    await db.insert(apiTokens).values({
      userId: session.dbUserId,
      name: data.name,
      tokenPrefix: prefix,
      tokenHash: hash,
    })

    return {
      raw, // Only returned once on creation
      prefix,
      name: data.name,
    }
  })

/**
 * List all API tokens for the current user.
 * Returns only metadata (prefix, name, dates), never the raw token.
 */
export const listTokens = createServerFn({ method: 'POST' }).handler(async () => {
  const session = requireAuth()

  const tokens = await db.select({
    id: apiTokens.id,
    name: apiTokens.name,
    tokenPrefix: apiTokens.tokenPrefix,
    createdAt: apiTokens.createdAt,
    lastUsedAt: apiTokens.lastUsedAt,
    expiresAt: apiTokens.expiresAt,
    isRevoked: apiTokens.isRevoked,
  })
    .from(apiTokens)
    .where(and(
      eq(apiTokens.userId, session.dbUserId),
    ))
    .orderBy(desc(apiTokens.createdAt))

  return tokens
})

/**
 * Revoke an API token by ID.
 */
export const revokeToken = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input as { tokenId: string })
  .handler(async ({ data }) => {
    const session = requireAuth()

    await db.update(apiTokens)
      .set({ isRevoked: true })
      .where(and(
        eq(apiTokens.id, data.tokenId),
        eq(apiTokens.userId, session.dbUserId),
      ))

    return { success: true }
  })

/**
 * Verify an API token and return the associated user info.
 * Used by the /api/scan endpoint for authentication.
 */
export async function verifyToken(rawToken: string): Promise<{ userId: string; login: string } | null> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex')

  const [token] = await db.select({ id: apiTokens.id, userId: apiTokens.userId })
    .from(apiTokens)
    .where(and(
      eq(apiTokens.tokenHash, hash),
      eq(apiTokens.isRevoked, false),
    ))
    .limit(1)

  if (!token) return null

  // Get user info
  const user = await db.query.users.findFirst({
    where: eq(users.id, token.userId),
  })

  if (!user) return null

  // Update last used timestamp
  await db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, token.id))

  return { userId: user.id, login: user.username || 'unknown' }
}

/**
 * Save an API scan result to the database.
 */
export async function saveAPIScan(params: {
  userId: string
  rawDiff: string
  trustScore: number
  findings: Array<{
    patternType: string
    filePath: string
    lineStart: number
    lineEnd: number
    confidence: string
    explanation: string
    evidenceExcerpt: string
  }>
  sourceRef?: string
}): Promise<string> {
  const [scanRecord] = await db.insert(scans).values({
    userId: params.userId,
    sourceType: 'api',
    sourceRef: params.sourceRef,
    rawDiff: params.rawDiff,
    trustScore: params.trustScore,
    status: 'complete',
    completedAt: new Date(),
  }).returning()

  if (params.findings.length > 0) {
    await db.insert(findings).values(
      params.findings.map((f) => ({
        scanId: scanRecord.id,
        patternType: f.patternType as any,
        filePath: f.filePath,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        confidence: f.confidence as any,
        explanation: f.explanation,
        evidenceExcerpt: f.evidenceExcerpt,
      }))
    )
  }

  return scanRecord.id
}
