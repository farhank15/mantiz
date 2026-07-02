/**
 * Mantiz User Verdict — allow users to tag findings as false positive / confirmed
 */

import { createServerFn } from '@tanstack/react-start'
import { db } from '../lib/db'
import { findings } from '../schemas/index'
import { scans } from '../schemas/index'
import { eq, and, inArray } from 'drizzle-orm'
import { requireAuth } from './auth-utils.server'

export type UserVerdict = 'unreviewed' | 'confirmed' | 'false_positive'

/**
 * Update the verdict on a specific finding.
 * Verifies ownership using a subquery — replaces 3 queries with 1.
 */
export const updateFindingVerdict = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const v = input as { findingId: string; verdict: UserVerdict }
    if (!v.findingId || typeof v.findingId !== 'string') {
      throw new Error('Finding ID is required')
    }
    if (!['unreviewed', 'confirmed', 'false_positive'].includes(v.verdict)) {
      throw new Error('Invalid verdict. Must be: unreviewed, confirmed, or false_positive')
    }
    return v
  })
  .handler(async ({ data }) => {
    const session = requireAuth()

    // 2 queries: get user's scan IDs → update finding if owned
    const userScans = await db
      .select({ id: scans.id })
      .from(scans)
      .where(eq(scans.userId, session.dbUserId))

    const scanIds = userScans.map((s) => s.id)

    // Guard: empty scanIds would generate invalid SQL (WHERE scan_id IN ())
    if (scanIds.length === 0) {
      throw new Error('Finding not found or unauthorized')
    }

    const [result] = await db
      .update(findings)
      .set({ userVerdict: data.verdict as any })
      .where(and(eq(findings.id, data.findingId), inArray(findings.scanId, scanIds)))
      .returning({ id: findings.id })

    if (!result) {
      throw new Error('Finding not found or unauthorized')
    }

    return { success: true, verdict: data.verdict }
  })
