/**
 * Mantiz User Settings — per-user scan configuration
 *
 * Each user has a single settings row (created on first save).
 * Controls threshold, AI detection, minimum score, and webhook.
 */

import { createServerFn } from '@tanstack/react-start'
import { db } from '../lib/db'
import { userSettings } from '../schemas/index'
import { eq } from 'drizzle-orm'
import { requireAuth } from './auth-utils.server'

export interface UserSettingsData {
  threshold: number
  minScore: number
  webhookUrl: string | null
  webhookEnabled: boolean
  aiEnabled: boolean
}

const DEFAULT_SETTINGS: UserSettingsData = {
  threshold: 70,
  minScore: 0,
  webhookUrl: null,
  webhookEnabled: false,
  aiEnabled: false,
}

/**
 * Get settings for the current authenticated user.
 * If no settings row exists, returns defaults (without creating a row).
 */
export const getUserSettings = createServerFn({ method: 'POST' }).handler(async () => {
  const session = requireAuth()

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.dbUserId),
  })

  if (!settings) {
    return DEFAULT_SETTINGS
  }

  return {
    threshold: settings.threshold,
    minScore: settings.minScore,
    webhookUrl: settings.webhookUrl,
    webhookEnabled: settings.webhookEnabled,
    aiEnabled: settings.aiEnabled,
  } satisfies UserSettingsData
})

/**
 * Save settings for the current authenticated user.
 * Creates a row if one doesn't exist, otherwise updates.
 */
export const saveUserSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const v = input as Partial<UserSettingsData>

    if (v.threshold !== undefined) {
      if (typeof v.threshold !== 'number' || v.threshold < 0 || v.threshold > 100) {
        throw new Error('Threshold must be between 0 and 100')
      }
    }
    if (v.minScore !== undefined) {
      if (typeof v.minScore !== 'number' || v.minScore < 0 || v.minScore > 100) {
        throw new Error('Min score must be between 0 and 100')
      }
    }
    if (v.aiEnabled !== undefined) {
      if (typeof v.aiEnabled !== 'boolean') {
        throw new Error('AI enabled must be a boolean')
      }
    }
    if (v.webhookUrl !== undefined && v.webhookUrl !== null) {
      try {
        new URL(v.webhookUrl)
      } catch {
        throw new Error('Webhook URL must be a valid URL')
      }
    }

    return v as Partial<UserSettingsData>
  })
  .handler(async ({ data }) => {
    const session = requireAuth()

    // Upsert — try insert, on conflict update
    const existing = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, session.dbUserId),
    })

    if (existing) {
      await db.update(userSettings)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, session.dbUserId))
    } else {
      await db.insert(userSettings).values({
        userId: session.dbUserId,
        threshold: data.threshold ?? DEFAULT_SETTINGS.threshold,
        minScore: data.minScore ?? DEFAULT_SETTINGS.minScore,
        webhookUrl: data.webhookUrl ?? DEFAULT_SETTINGS.webhookUrl,
        webhookEnabled: data.webhookEnabled ?? DEFAULT_SETTINGS.webhookEnabled,
      })
    }

    return { success: true }
  })

/**
 * Load user settings by userId (used internally by API scan, no auth cookie needed).
 */
export async function loadUserSettings(userId: string): Promise<UserSettingsData> {
  try {
    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    })
    if (!settings) return DEFAULT_SETTINGS
    return {
      threshold: settings.threshold,
      minScore: settings.minScore,
      webhookUrl: settings.webhookUrl,
      webhookEnabled: settings.webhookEnabled,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}
