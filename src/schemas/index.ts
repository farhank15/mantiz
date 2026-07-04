import { pgTable, text, timestamp, uuid, bigint, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: text('github_id').unique(),
  username: text('username'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  githubRepoId: bigint('github_repo_id', { mode: 'number' }),
  fullName: text('full_name').notNull(),
  connectedAt: timestamp('connected_at').defaultNow().notNull(),
})

export const scans = pgTable('scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  repoId: uuid('repo_id').references(() => repos.id),
  sourceType: text('source_type', { enum: ['manual', 'github_pr', 'api'] }).notNull(),
  sourceRef: text('source_ref'),
  rawDiff: text('raw_diff').notNull(),
  trustScore: integer('trust_score'),
  status: text('status', { enum: ['pending', 'complete', 'failed'] }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  userIdCreatedAtIdx: index('scans_user_id_created_at_idx').on(table.userId, table.createdAt),
  createdAtIdx: index('scans_created_at_idx').on(table.createdAt),
}))

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').references(() => scans.id).notNull(),
  patternType: text('pattern_type', {
    enum: [
      'disabled_assertion',
      'assertion_tampering',
      'mock_to_avoid_failure',
      'claim_diff_mismatch',
      'silent_catch_and_pass',
      'hallucinated_assertion',
      'ai_assisted_detection',
      'historical_behavioral',
      'mutation_susceptibility',
      'agent_instruction_scan',
    ],
  }).notNull(),
  filePath: text('file_path').notNull(),
  lineStart: integer('line_start').notNull(),
  lineEnd: integer('line_end').notNull(),
  confidence: text('confidence', { enum: ['low', 'medium', 'high'] }).notNull(),
  explanation: text('explanation').notNull(),
  evidenceExcerpt: text('evidence_excerpt').notNull(),
  userVerdict: text('user_verdict', { enum: ['unreviewed', 'confirmed', 'false_positive'] }).default('unreviewed').notNull(),
}, (table) => ({
  scanIdIdx: index('findings_scan_id_idx').on(table.scanId),
}))

export const sharedScans = pgTable('shared_scans', {
  id: text('id').primaryKey(), // random short ID
  scanData: text('scan_data').notNull(), // JSON stringified scan result
  sourceType: text('source_type', { enum: ['manual', 'github_pr'] }).notNull(),
  sourceRef: text('source_ref'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const authorProfiles = pgTable('author_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubAuthor: text('github_author').notNull().unique(),
  firstSeen: timestamp('first_seen').defaultNow().notNull(),
  lastSeen: timestamp('last_seen').defaultNow().notNull(),
  totalScans: integer('total_scans').default(0).notNull(),
  avgTrustScore: integer('avg_trust_score').default(100).notNull(),
  avgFilesChanged: integer('avg_files_changed').default(1).notNull(),
  writingStyleHashes: text('writing_style_hashes').array().default([]).notNull(),
  suspicionScore: integer('suspicion_score').default(0).notNull(),
  lastFlaggedAt: timestamp('last_flagged_at'),
  consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
  peakDailyFrequency: integer('peak_daily_frequency').default(0).notNull(),
})

export const authorEvents = pgTable('author_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').references(() => authorProfiles.id).notNull(),
  scanId: uuid('scan_id').references(() => scans.id),
  eventType: text('event_type', { enum: ['pr_scan', 'manual_scan', 'api_scan'] }).notNull(),
  trustScore: integer('trust_score').notNull(),
  totalFindings: integer('total_findings').default(0).notNull(),
  filesChanged: integer('files_changed').default(0).notNull(),
  titleStyleHash: text('title_style_hash'),
  commitHour: integer('commit_hour').notNull(),
  metadata: text('metadata'), // JSON stringified extra data
  timestamp: timestamp('timestamp').defaultNow().notNull(),
})

export const userCredits = pgTable('user_credits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  balance: integer('balance').default(30).notNull(),
  lifetimeUsed: integer('lifetime_used').default(0).notNull(),
  plan: text('plan', { enum: ['free', 'pro'] }).default('free').notNull(),
  periodStart: timestamp('period_start').defaultNow().notNull(),
  periodEnd: timestamp('period_end').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: uniqueIndex('user_credits_user_id_idx').on(table.userId),
}))

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  amount: integer('amount').notNull(), // negative = deduction, positive = top-up
  reason: text('reason').notNull(), // e.g. 'ai_judge', 'ai_assisted', 'full_ai', 'signup_bonus', 'admin_topup'
  metadata: text('metadata'), // JSON for extra context
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdCreatedAtIdx: index('credit_tx_user_id_created_at_idx').on(table.userId, table.createdAt),
}))

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  tokenHash: text('token_hash').notNull(),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
  isRevoked: boolean('is_revoked').default(false).notNull(),
})

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  threshold: integer('threshold').default(70).notNull(),
  aiEnabled: boolean('ai_enabled').default(false).notNull(),
  minScore: integer('min_score').default(0).notNull(),
  webhookUrl: text('webhook_url'),
  webhookEnabled: boolean('webhook_enabled').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: uniqueIndex('user_settings_user_id_idx').on(table.userId),
}))

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  scanId: uuid('scan_id').references(() => scans.id),
  webhookUrl: text('webhook_url').notNull(),
  status: text('status', { enum: ['pending', 'delivered', 'failed'] }).default('pending').notNull(),
  responseCode: integer('response_code'),
  responseBody: text('response_body'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deliveredAt: timestamp('delivered_at'),
})

// ─── GitHub App Tables ────────────────────────────────────────

export const githubInstalls = pgTable('github_installs', {
  id: uuid('id').primaryKey().defaultRandom(),
  installationId: bigint('installation_id', { mode: 'number' }).notNull().unique(),
  accountId: bigint('account_id', { mode: 'number' }),
  accountLogin: text('account_login'),
  accountType: text('account_type'), // 'User' or 'Organization'
  repoIds: bigint('repo_ids', { mode: 'number' }).array().default([]).notNull(),
  permissions: text('permissions'), // JSON stringified permissions object
  created_at: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubDeliveryId: text('github_delivery_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  action: text('action'),
  installationId: bigint('installation_id', { mode: 'number' }),
  repositoryFullName: text('repository_full_name'),
  status: text('status', { enum: ['processing', 'completed', 'failed', 'skipped'] }).default('processing').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
})

export const rateLimitEvents = pgTable('rate_limit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => [
  index('rate_limit_events_key_timestamp_idx').on(table.key, table.timestamp),
])

