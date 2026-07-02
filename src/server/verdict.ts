/**
 * Mantiz User Verdict — allow users to tag findings as false positive / confirmed
 */

import { createServerFn } from '@tanstack/react-start'
import { db } from '../lib/db'
import { findings } from '../schemas/index'
import { scans } from '../schemas/index'
import { eq } from 'drizzle-orm'
import { requireAuth } from './auth-utils.server'

export type UserVerdict = 'unreviewed' | 'confirmed' | 'false_positive'

/**
 * Update the verdict on a specific finding.
 * Verifies the finding belongs to a scan owned by the current user.
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

    // Get the finding's scan to verify ownership
    const finding = await db.query.findings.findFirst({
      where: eq(findings.id, data.findingId),
    })

    if (!finding) {
      throw new Error('Finding not found')
    }

    const scanRecord = await db.query.scans.findFirst({
      where: eq(scans.id, finding.scanId),
    })

    if (!scanRecord) {
      throw new Error('Scan not found')
    }

    if (scanRecord.userId !== session.dbUserId) {
      throw new Error('Unauthorized — this scan does not belong to you')
    }

    await db.update(findings)
      .set({ userVerdict: data.verdict as any })
      .where(eq(findings.id, data.findingId))

    return { success: true, verdict: data.verdict }
  })
