import type { Finding, ParsedDiff, FileImportance } from '../types'

// ─── Generalized File Classification ──────────────────────────────
//
// Instead of hardcoding specific agent tool directories (.kuma, .claude, etc.),
// we whitelist known project infrastructure dot-dirs. Any other dot-dir is
// treated as an agent artifact — this catches ANY agent tool automatically.
//
// Whitelist: dot-dirs that are standard project infrastructure (NOT agent tools).
// Any dot-dir NOT in this list is classified as agent artifact automatically.
// This inverts the problem — we maintain a small stable whitelist instead of
// a brittle ever-growing blacklist of agent tool directories.
const KNOWN_INFRA_DOT_DIRS = new Set([
  // ── CI/CD ──
  '.github',       // GitHub Actions, templates, community files
  '.circleci',     // CircleCI
  '.gitlab',       // GitLab CI/CD
  '.buildkite',    // Buildkite
  '.azure',        // Azure DevOps

  // ── IDE / Editor ──
  '.vscode',       // VS Code workspace settings
  '.idea',         // JetBrains IntelliJ IDEA
  '.zed',          // Zed editor
  '.vs',           // Visual Studio (non-Code)

  // ── Dev Environment ──
  '.devcontainer', // Dev containers
  '.husky',        // Git hooks
  '.docker',       // Docker context/config

  // ── Package Manager / Build ──
  '.yarn',         // Yarn Berry (zero-installs)
  '.pnpm',         // pnpm store
  '.nx',           // Nx cache
  '.changeset',    // Changesets (monorepo versioning)

  // ── Test Coverage ──
  '.nyc_output',   // NYC/istanbul output (committed in some workflows)
])

// Paths matching typical .gitignore patterns (shouldn't be committed)
const GITIGNORE_LIKE_PATTERNS = [
  /\/node_modules\//,
  /\/dist\//,
  /\/build\//,
  /\/\.next\//,
  /\/\.output\//,
  /\/coverage\//,
  /\/\.cache\//,
  /\/(?:tmp|temp)\//,
  /\.env$/i,
]

// Root-level agent config files — stable naming conventions per agent tool.
// These are well-documented single files, not directories, so they need
// explicit listing. Sourced from official docs of each tool.
const AGENT_ROOT_FILES = [
  // ── Claude Code ──
  /^CLAUDE\.md$/i,

  // ── OpenAI Codex CLI / Cursor ──
  /^AGENTS\.md$/i,

  // ── Cursor (legacy, migrating to agents.md) ──
  /^\.cursorrules$/i,

  // ── Gemini CLI ──
  /^GEMINI\.md$/i,

  // ── Aider ──
  /^\.aider\.conf\.yml$/i,
  /^\.aider\.ignore$/i,
  /^\.aider\.input\.yml$/i,

  // ── Windsurf ──
  /^\.windsurf$/i,

  // ── GitHub Copilot ──
  /^\.github\/copilot-instructions\.md$/i,

  // ── CodeRabbit ──
  /^\.coderabbit\.yaml$/i,
  /^\.coderabbit\.yml$/i,

  // ── Cline / Roo Code ──
  /^\.clinerules$/i,
  /^\.roomodes$/i,
]

// Extension-based classification
const TEST_FILE_PATTERN = /(\.(test|spec)\.(ts|tsx|js|jsx)$)|(\/(?:__tests__|tests?|fixtures)\/)/i
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/i
const DOCS_FILE_PATTERN = /\.(md|txt|css|scss|sass|less|styl|svg|png|jpg|jpeg|gif|ico|webp|avif)$/i
const CONFIG_FILE_EXT_PATTERN = /\.(json|yaml|yml|toml|cfg|ini)$/i

// Root-level config dot-files (no extension or unconventional extension)
const ROOT_CONFIG_FILES = [
  /^\.(npmrc|yarnrc|pnpmrc)$/i,
  /^\.(nvmrc|node-version)$/i,
  /^\.(envrc|env)$/i,
  /^\.(gitignore|gitattributes|gitmodules)$/i,
  /^\.(editorconfig|eslintrc|prettierrc|stylelintrc)$/i,
  /^\.(browserslistrc|caniuse-lrc)$/i,
  /^\.(dockerignore|containerignore)$/i,
  /^\.(npmignore|packagerc)$/i,
  /^\.(watchmanconfig)$/i,
  /^\.(parcelrc|webpackrc)$/i,
  /^\.(lintstagedrc|commitlintrc)$/i,
  /^\.(npm|yarn|pnpm)-?.*/i,
  /^(tsconfig|jsconfig|deno)\.json$/i,
  /^\.(gitpod|gitpod\.yml)$/i,
]

/**
 * Check if a path lives inside an agent/unknown dot-directory.
 * Known infra dot-dirs (.github, .vscode, etc.) are excluded.
 */
function inUnknownDotDir(path: string): boolean {
  const parts = path.split('/')
  return parts.some(part => part.startsWith('.') && !KNOWN_INFRA_DOT_DIRS.has(part))
}

function matchesGitignorePattern(path: string): boolean {
  return GITIGNORE_LIKE_PATTERNS.some(p => p.test(path))
}

function isAgentRootConfig(path: string): boolean {
  return AGENT_ROOT_FILES.some(p => p.test(path))
}

function isRootConfigFile(path: string): boolean {
  // Only match root-level files (no directory prefix)
  if (path.includes('/')) return false
  return ROOT_CONFIG_FILES.some(p => p.test(path))
}

export function isNonFunctional(filePath: string): boolean {
  if (isAgentRootConfig(filePath)) return true
  if (matchesGitignorePattern(filePath)) return true
  if (inUnknownDotDir(filePath)) return true
  // Root config files (.npmrc, .nvmrc, etc.) are functional — don't filter
  if (isRootConfigFile(filePath)) return false
  return DOCS_FILE_PATTERN.test(filePath)
}

export function classifyImportance(filePath: string): FileImportance {
  // Agent/config artifacts always return 'artifact'
  if (isAgentRootConfig(filePath)) return 'artifact'
  if (matchesGitignorePattern(filePath)) return 'artifact'
  if (inUnknownDotDir(filePath)) return 'artifact'

  if (TEST_FILE_PATTERN.test(filePath)) return 'test'
  if (SOURCE_FILE_PATTERN.test(filePath)) return 'source'
  if (CONFIG_FILE_EXT_PATTERN.test(filePath)) return 'config'
  if (isRootConfigFile(filePath)) return 'config'
  if (DOCS_FILE_PATTERN.test(filePath)) return 'docs'

  return 'docs'
}

export function isRebrandChange(files: ParsedDiff[]): boolean {
  const changedPaths = files.map(f => f.newFile || f.oldFile || '').filter(Boolean)
  const hasPackageJson = changedPaths.some(p => /package\.json$/i.test(p))

  if (!hasPackageJson) return false

  // Check if package.json has a name change
  for (const file of files) {
    const path = file.newFile || file.oldFile || ''
    if (!/package\.json$/i.test(path)) continue

    for (const hunk of file.hunks) {
      const lines = hunk.content.split('\n')
      let oldName: string | null = null
      let newName: string | null = null

      for (const line of lines) {
        if (line.startsWith('-') && line.includes('"name"')) {
          const match = line.match(/"name":\s*"(.+?)"/)
          if (match) oldName = match[1]
        }
        if (line.startsWith('+') && line.includes('"name"')) {
          const match = line.match(/"name":\s*"(.+?)"/)
          if (match) newName = match[1]
        }
      }

      if (oldName && newName && oldName !== newName) return true
    }
  }

  return false
}

function hasMeaningfulChanges(hunkContent: string): boolean {
  const lines = hunkContent.split('\n')
  for (const line of lines) {
    if (!line.startsWith('+') && !line.startsWith('-')) continue
    const content = line.slice(1).trim()
    if (!content) continue
    if (/^\/\/|^\/\*|^\*|^#/.test(content)) continue
    if (/^\s*$/.test(content)) continue
    return true
  }
  return false
}

function scanFiles(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  const nonFunctionalChanges = files.filter((f) => {
    const path = f.newFile || f.oldFile || ''
    return isNonFunctional(path)
  })

  const functionalChanges = files.filter((f) => {
    const path = f.newFile || f.oldFile || ''
    return !isNonFunctional(path)
  })

  const rebrand = isRebrandChange(files)

  if (nonFunctionalChanges.length > 0 && functionalChanges.length === 0 && !rebrand) {
    const paths = nonFunctionalChanges.map((f) => f.newFile || f.oldFile).filter(Boolean).join(', ')
    findings.push({
      patternType: 'claim_diff_mismatch',
      filePath: paths,
      lineStart: 0,
      lineEnd: 0,
      confidence: 'high',
      explanation: `All changes are in non-functional files (${paths}). No test or source code was modified.`,
      evidenceExcerpt: `Non-functional files: ${paths}`,
      fileImportance: 'docs',
    })
  }

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || ''
    if (TEST_FILE_PATTERN.test(filePath)) {
      const hasMeaningful = file.hunks.some((h) => hasMeaningfulChanges(h.content))
      if (!hasMeaningful) {
        findings.push({
          patternType: 'claim_diff_mismatch',
          filePath,
          lineStart: 0,
          lineEnd: 0,
          confidence: 'low',
          explanation: `Test file changed but only comments/whitespace — no actual test logic was modified.`,
          evidenceExcerpt: `${filePath}: Only cosmetic changes detected`,
          fileImportance: 'test',
        })
      }
    }
  }

  const hasSourceChanges = functionalChanges.some((f) => {
    const path = f.newFile || f.oldFile || ''
    return SOURCE_FILE_PATTERN.test(path) && !TEST_FILE_PATTERN.test(path)
  })
  const hasTestChanges = files.some((f) => {
    const path = f.newFile || f.oldFile || ''
    return TEST_FILE_PATTERN.test(path)
  })

  if (hasSourceChanges && !hasTestChanges && functionalChanges.length > 0) {
    const sourceFiles = functionalChanges
      .filter((f) => {
        const path = f.newFile || f.oldFile || ''
        return SOURCE_FILE_PATTERN.test(path) && !TEST_FILE_PATTERN.test(path)
      })
      .map((f) => f.newFile || f.oldFile)
      .filter(Boolean)
      .join(', ')

    findings.push({
      patternType: 'claim_diff_mismatch',
      filePath: sourceFiles,
      lineStart: 0,
      lineEnd: 0,
      confidence: 'medium',
      explanation: `Source code changed (${sourceFiles}) but no tests were updated. Claims of 'fixing tests' may be misleading.`,
      evidenceExcerpt: `Changed source: ${sourceFiles}`,
      fileImportance: 'source',
    })
  }

  return findings
}

export function detectClaimDiffMismatch(files: ParsedDiff[]): Finding[] {
  return scanFiles(files)
}
