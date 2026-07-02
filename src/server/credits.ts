/**
 * Mantiz Credit System — Anti-Brutal Hackathon Protection
 *
 * Each user gets 30 free credits on signup.
 * AI features consume credits; static scans are free.
 *
 * Credit costs:
 *   AI Judge       = 2 credits
 *   AI-Assisted    = 2 credits
 *   Full AI (both) = 3 credits
 *
 * Reset: manual via admin / automatic via DB cron (future).
 */

import { createServerFn } from '@tanstack/react-start'
import { db } from '../lib/db'
import { users, userCredits, creditTransactions } from '../schemas/index'
import { eq, sql } from 'drizzle-orm'
import { requireAuth } from './auth-utils.server'

const FREE_CREDITS = 30
const PERIOD_DAYS = 30

export const CREDIT_COSTS = {
  ai_judge: 2,
  ai_assisted: 2,
  full_ai: 3,
} as const

// ─── Internal ────────────────────────────────────────────────────

/**
 * Get user credits record. Creates one if missing (for existing users who
 * registered before credit system existed).
 */
export async function getCreditsRecord(userId: string) {
  let record = await db.query.userCredits.findFirst({
    where: eq(userCredits.userId, userId),
  })

  if (!record) {
    // Auto-create for legacy users
    const [inserted] = await db.insert(userCredits).values({
      userId,
      balance: FREE_CREDITS,
      lifetimeUsed: 0,
      plan: 'free',
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + PERIOD_DAYS * 24 * 60 * 60 * 1000),
    }).returning()
    record = inserted

    await db.insert(creditTransactions).values({
      userId,
      amount: FREE_CREDITS,
      reason: 'signup_bonus',
      metadata: JSON.stringify({ note: 'Auto-created for legacy user' }),
    })
  }

  return record
}

/**
 * Check if a user has enough credits for the given cost.
 * Throws descriptive error if insufficient.
 */
export async function ensureCredits(userId: string, cost: number): Promise<void> {
  const record = await getCreditsRecord(userId)

  // Check period reset
  if (new Date() > new Date(record.periodEnd)) {
    // Reset credits
    await db.update(userCredits)
      .set({
        balance: FREE_CREDITS,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + PERIOD_DAYS * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(userCredits.userId, userId))

    // Refetch after reset
    if (cost > FREE_CREDITS) {
      throw new Error(`Insufficient credits. You need ${cost} credits but only have ${FREE_CREDITS} after reset.`)
    }
    return
  }

  if (record.balance < cost) {
    throw new Error(
      `Insufficient AI credits (${record.balance}/${cost}). ` +
      `Static scans are free. Reset in ${Math.ceil((new Date(record.periodEnd).getTime() - Date.now()) / 86400000)} days.`
    )
  }
}

/**
 * Deduct credits for an AI scan. Must call ensureCredits first.
 */
export async function deductCredits(
  userId: string,
  reason: keyof typeof CREDIT_COSTS | string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  const cost = CREDIT_COSTS[reason as keyof typeof CREDIT_COSTS] ?? 2

  const [record] = await db.update(userCredits)
    .set({
      balance: sql`balance - ${cost}`,
      lifetimeUsed: sql`lifetime_used + ${cost}`,
      updatedAt: new Date(),
    })
    .where(eq(userCredits.userId, userId))
    .returning()

  await db.insert(creditTransactions).values({
    userId,
    amount: -cost,
    reason,
    metadata: metadata ? JSON.stringify(metadata) : null,
  })

  return record.balance - cost
}

// ─── Server Functions ─────────────────────────────────────────────

/**
 * Get current credit balance and usage info for the authenticated user.
 */
export const getCredits = createServerFn({ method: 'POST' }).handler(async () => {
  const session = requireAuth()
  const record = await getCreditsRecord(session.dbUserId)

  return {
    balance: record.balance,
    lifetimeUsed: record.lifetimeUsed,
    plan: record.plan,
    periodStart: record.periodStart.toISOString(),
    periodEnd: record.periodEnd.toISOString(),
    daysUntilReset: Math.ceil((record.periodEnd.getTime() - Date.now()) / 86400000),
  }
})

/**
 * Get recent credit transactions for the authenticated user.
 */
export const getCreditHistory = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const v = input as { limit?: number }
    return { limit: Math.min(v.limit ?? 10, 50) }
  })
  .handler(async ({ data }) => {
    const session = requireAuth()

    const txs = await db.select({
      id: creditTransactions.id,
      amount: creditTransactions.amount,
      reason: creditTransactions.reason,
      metadata: creditTransactions.metadata,
      createdAt: creditTransactions.createdAt,
    })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, session.dbUserId))
      .orderBy(sql`${creditTransactions.createdAt} DESC`)
      .limit(data.limit)

    return txs.map(tx => ({
      ...tx,
      createdAt: tx.createdAt.toISOString(),
    }))
  })

// ─── Admin / Seeder ───────────────────────────────────────────────

/**
 * Seed credits for ALL existing users who don't have a credits record.
 * Safe to run multiple times (idempotent).
 */
export const seedAllExistingUsers = createServerFn({ method: 'POST' }).handler(async () => {
  // Get all users
  const allUsers = await db.select({ id: users.id }).from(users)
  let seeded = 0

  for (const user of allUsers) {
    const existing = await db.query.userCredits.findFirst({
      where: eq(userCredits.userId, user.id),
    })
    if (!existing) {
      await db.insert(userCredits).values({
        userId: user.id,
        balance: FREE_CREDITS,
        lifetimeUsed: 0,
        plan: 'free',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + PERIOD_DAYS * 24 * 60 * 60 * 1000),
      })
      await db.insert(creditTransactions).values({
        userId: user.id,
        amount: FREE_CREDITS,
        reason: 'signup_bonus',
        metadata: JSON.stringify({ note: 'Seeded for existing user' }),
      })
      seeded++
    }
  }

  return { seeded, total: allUsers.length }
})

/**
 * Admin function to add credits to a user (for testing / support).
 */
export const adminAddCredits = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input as { userId: string; amount: number; reason: string })
  .handler(async ({ data }) => {
    await db.update(userCredits)
      .set({
        balance: sql`balance + ${data.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userCredits.userId, data.userId))

    await db.insert(creditTransactions).values({
      userId: data.userId,
      amount: data.amount,
      reason: data.reason,
      metadata: JSON.stringify({ admin: true }),
    })

    return { success: true }
  })
