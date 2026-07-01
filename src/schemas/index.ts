import { pgTable, text, timestamp, uuid, bigint, integer, boolean } from 'drizzle-orm/pg-core'

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
})

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
    ],
  }).notNull(),
  filePath: text('file_path').notNull(),
  lineStart: integer('line_start').notNull(),
  lineEnd: integer('line_end').notNull(),
  confidence: text('confidence', { enum: ['low', 'medium', 'high'] }).notNull(),
  explanation: text('explanation').notNull(),
  evidenceExcerpt: text('evidence_excerpt').notNull(),
  userVerdict: text('user_verdict', { enum: ['unreviewed', 'confirmed', 'false_positive'] }).default('unreviewed').notNull(),
})

export const sharedScans = pgTable('shared_scans', {
  id: text('id').primaryKey(), // random short ID
  scanData: text('scan_data').notNull(), // JSON stringified scan result
  sourceType: text('source_type', { enum: ['manual', 'github_pr'] }).notNull(),
  sourceRef: text('source_ref'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

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
