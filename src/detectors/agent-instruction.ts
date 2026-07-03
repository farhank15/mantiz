/**
 * Mantiz D11 — Agent Instruction Scanner
 *
 * Scans diffs for changes to AI agent configuration files and detects
 * instructions that encourage cheating, evasion, or deception.
 *
 * Target files:
 *   - CLAUDE.md / GEMINI.md — Agent instructions
 *   - AGENTS.md — Agent configuration
 *   - .cursorrules — Cursor IDE agent rules
 *   - .windsurf — Windsurf agent config
 *   - .github/copilot-instructions.md — GitHub Copilot instructions
 *   - .clinerules / .roomodes — Cline/Roo Code agent config
 *   - .aider.conf.yml / .aider.ignore — Aider config
 *   - .coderabbit.yaml — CodeRabbit config
 *
 * Rationale: When AI agents are instructed to cheat, the instructions
 * themselves are often committed to the repo. Catching these patterns
 * is a strong signal of intent to manipulate test results.
 */

import type { Finding, ParsedDiff } from './types'

// ─── Agent Config File Patterns ─────────────────────────────────

const AGENT_CONFIG_PATTERNS = [
  /(?:^|\/)CLAUDE\.md$/i,
  /(?:^|\/)GEMINI\.md$/i,
  /(?:^|\/)AGENTS\.md$/i,
  /(?:^|\/)\.cursorrules$/i,
  /(?:^|\/)\.windsurf$/i,
  /\.github\/copilot-instructions\.md$/i,
  /(?:^|\/)\.clinerules$/i,
  /(?:^|\/)\.roomodes$/i,
  /(?:^|\/)\.aider\.conf\.yml$/i,
  /(?:^|\/)\.aider\.ignore$/i,
  /(?:^|\/)\.coderabbit\.ya?ml$/i,
]

// ─── Suspicious Instruction Patterns ────────────────────────────

interface SuspiciousPattern {
  regex: RegExp
  severity: 'high' | 'medium' | 'low'
  label: string
}

const SUSPICIOUS_PATTERNS: SuspiciousPattern[] = [
  // ── Test manipulation ──
  {
    regex: /skip\s+(flaky|failing|broken)\s+tests?/i,
    severity: 'medium',
    label: 'skip_tests',
  },
  {
    regex: /(?:use|add|prefer)\s+(xit|fdescribe|fit|xtest|xdescribe|fcontext)/i,
    severity: 'high',
    label: 'focus_directive',
  },
  {
    regex: /(?:disable|bypass|skip|remove)\s+(test|assertion|check)/i,
    severity: 'medium',
    label: 'disable_test_directive',
  },
  {
    regex: /don'?t\s+(?:run|execute|trigger)\s+tests/i,
    severity: 'high',
    label: 'skip_test_execution',
  },
  {
    regex: /make\s+(?:the\s+)?tests?\s+pass\s+(?:at\s+)?all\s+costs/i,
    severity: 'high',
    label: 'pass_at_any_cost',
  },
  {
    regex: /fabricate\s+(?:test|coverage|assertion)/i,
    severity: 'high',
    label: 'fabricate_test',
  },

  // ── Deception / Concealment ──
  {
    regex: /never\s+(?:reveal|mention|say|tell|admit|disclose)\s+(?:you'?re|you\s+are|being)\s+(?:an\s+)?AI/i,
    severity: 'medium',
    label: 'conceal_ai_identity',
  },
  {
    regex: /(?:pretend|act\s+as\s+if|make\s+it\s+look)\s+(?:human|like\s+a\s+human|natural)/i,
    severity: 'medium',
    label: 'human_impersonation',
  },
  {
    regex: /disguise|masquerade|camouflage/i,
    severity: 'medium',
    label: 'disguise_directive',
  },
  {
    regex: /don'?t\s+(?:leave|add|include)\s+(?:AI|artificial|generated|auto.?gen)\s+(?:traces?|footprints?|marks?)/i,
    severity: 'high',
    label: 'conceal_ai_traces',
  },

  // ── Evasion ──
  {
    regex: /(?:evade|bypass|circumvent)\s+(?:detection|review|guard)/i,
    severity: 'high',
    label: 'evade_detection',
  },
  {
    regex: /avoid\s+(?:being\s+)?(?:flagged|detected|caught|identified)/i,
    severity: 'high',
    label: 'avoid_detection',
  },
  {
    regex: /(?:make|add)\s+(?:it\s+)?hard\s+(?:to\s+)?(?:detect|find|trace|notice)/i,
    severity: 'medium',
    label: 'obfuscate_changes',
  },
  {
    regex: /(?:don'?t|never|avoid)\s+(?:change|modify|update)\s+(?:too\s+)?(?:many|much)\s+(?:files|lines)/i,
    severity: 'low',
    label: 'minimize_changes',
  },

  // ── Unethical Instructions ──
  {
    regex: /always\s+pass\s+(?:even\s+)?(?:if|when)\s+(?:tests?\s+)?fail/i,
    severity: 'high',
    label: 'always_pass',
  },
  {
    regex: /(?:swallow|hide|suppress|ignore)\s+(?:errors?|exceptions?|failures?)/i,
    severity: 'high',
    label: 'suppress_errors',
  },
  {
    regex: /(?:make\s+)?tests?\s+(?:pass|green)\s+(?:without\s+)?(?:actually|really)?\s*(?:testing|checking|validating)/i,
    severity: 'high',
    label: 'fake_test_pass',
  },
  {
    regex: /(?:generate|create|add)\s+(?:dummy|fake|placeholder|stub)\s+tests/i,
    severity: 'medium',
    label: 'dummy_tests',
  },
  {
    regex: /don'?t\s+actually\s+(?:test|check|verify|assert)\s+(?:the\s+)?(?:logic|implementation|code)/i,
    severity: 'high',
    label: 'bypass_real_testing',
  },
]

// ─── Detection ─────────────────────────────────────────────────

/**
 * Check if a file path matches an agent configuration pattern.
 */
function isAgentConfigFile(filePath: string): boolean {
  return AGENT_CONFIG_PATTERNS.some(p => p.test(filePath))
}

/**
 * Extract added lines from a hunk content.
 */
function extractAddedLines(hunkContent: string): string[] {
  return hunkContent
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.slice(1).trim())
    .filter(Boolean)
}

/**
 * Score a finding based on pattern severity and context.
 */
function scoreConfidence(severity: 'high' | 'medium' | 'low', patternMatches: number): 'high' | 'medium' | 'low' {
  if (severity === 'high' && patternMatches >= 2) return 'high'
  if (severity === 'high' || (severity === 'medium' && patternMatches >= 3)) return 'medium'
  return severity
}

/**
 * Main entry point — scan diff for suspicious agent instructions.
 */
export function detectAgentInstructions(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || ''

    if (!isAgentConfigFile(filePath)) continue
    if (file.newFile === '/dev/null') continue // File was deleted — not suspicious

    let filePatternCount = 0
    const fileLines: string[] = []

    for (const hunk of file.hunks) {
      const addedLines = extractAddedLines(hunk.content)
      fileLines.push(...addedLines)
    }

    if (fileLines.length === 0) continue

    // Check each line against suspicious patterns
    const matchedPatterns = new Map<string, { severity: 'high' | 'medium' | 'low'; label: string; matches: number }>()

    for (const line of fileLines) {
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.regex.test(line)) {
          const existing = matchedPatterns.get(pattern.label)
          if (existing) {
            existing.matches++
          } else {
            matchedPatterns.set(pattern.label, { severity: pattern.severity, label: pattern.label, matches: 1 })
          }
        }
      }
    }

    if (matchedPatterns.size === 0) continue

    // Build findings from matched patterns
    // Use incrementing lineStart so different pattern types don't dedup away
    let patternIdx = 0
    for (const [, match] of matchedPatterns) {
      patternIdx++
      filePatternCount++

      const confidence = scoreConfidence(match.severity, match.matches)
      const explanation = `[Agent Instruction] ${filePath} contains suspicious pattern "${match.label}" — ${match.matches} occurrence(s).`

      findings.push({
        patternType: 'agent_instruction_scan',
        filePath,
        lineStart: patternIdx,
        lineEnd: patternIdx,
        confidence,
        explanation,
        evidenceExcerpt: `${filePath}: ${match.label} (${match.severity} severity, ${match.matches} matches)`,
        fileImportance: 'artifact',
      })
    }
  }

  return findings
}
