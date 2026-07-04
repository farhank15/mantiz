/**
 * Mantiz Custom Matcher Registry
 *
 * Maintains a set of custom assertion matchers registered via `expect.extend()`.
 * This prevents D6 (Hallucinated Assertion) from flagging legitimate custom matchers.
 *
 * Sources:
 * 1. Auto-extracted from `expect.extend({...})` calls in the diff
 * 2. Configurable via env var MANTIZ_CUSTOM_MATCHERS (comma-separated)
 *
 * Usage:
 *   import { registerCustomMatchers, isCustomMatcher } from './custom-matchers'
 *   registerCustomMatchersFromDiff(files)  // auto-detect from diff content
 *   isCustomMatcher('toOutput')  // true if registered
 */

const CUSTOM_MATCHER_SET = new Set<string>()

/**
 * Extract individual matcher names from an expect.extend() call body.
 * Supports both shorthand methods and key-value pairs:
 *   { toOutput() { ... } }        → 'toOutput'
 *   { toBeFoo, toBeBar }          → 'toBeFoo', 'toBeBar'
 *   { toBeFoo: fn, toBeBar: fn }  → 'toBeFoo', 'toBeBar'
 */
const MATCHER_NAME_PATTERN = /[,\s{]*\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::\s*\(|[:(,\s\]\}]|$)/g

/**
 * Register a single custom matcher name.
 */
export function registerCustomMatcher(name: string): void {
  CUSTOM_MATCHER_SET.add(name)
}

/**
 * Register multiple custom matchers at once.
 */
export function registerCustomMatchers(names: string[]): void {
  for (const name of names) {
    CUSTOM_MATCHER_SET.add(name)
  }
}

/**
 * Check if a matcher name is a known custom matcher.
 */
export function isCustomMatcher(name: string): boolean {
  return CUSTOM_MATCHER_SET.has(name)
}

/**
 * Get all registered custom matchers (for debugging/inspection).
 */
export function getCustomMatchers(): string[] {
  return Array.from(CUSTOM_MATCHER_SET)
}

/**
 * Clear all registered custom matchers (for testing).
 */
export function resetCustomMatchers(): void {
  CUSTOM_MATCHER_SET.clear()
}

/**
 * Parse `expect.extend({ ... })` calls from source content and register any
 * custom matchers found. Handles:
 *   - Object shorthand: { toOutput() { ... }, toMatchSnapshot() { ... } }
 *   - Variable references: { toBeFoo, toBeBar }
 *   - Key-value: { toBeFoo: myMatcherImpl }
 *
 * NOTE: Uses regex with brace-counting to handle simple nesting.
 * For deeply nested matcher implementations, prefer tree-sitter.
 */
function extractFromExpectExtend(content: string): void {
  // Find expect.extend(THIS_PART) using brace counting instead of [^}]+
  let idx = 0
  while (idx < content.length) {
    const extendStart = content.indexOf('expect.extend(', idx)
    if (extendStart === -1) break

    // Find the opening { after expect.extend(
    const parenStart = content.indexOf('(', extendStart)
    if (parenStart === -1) break

    // Find matching closing paren with brace counting
    let depth = 0
    let parenDepth = 1
    let bodyStart = -1
    let bodyEnd = -1

    for (let i = parenStart + 1; i < content.length; i++) {
      const ch = content[i]
      if (ch === '{') {
        if (bodyStart === -1) bodyStart = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && bodyStart !== -1) {
          bodyEnd = i
          parenDepth--
        }
      } else if (ch === '(') {
        parenDepth++
      } else if (ch === ')') {
        parenDepth--
        if (parenDepth === 0) {
          // Closing paren of expect.extend(...) — done
          break
        }
      }
    }

    if (bodyStart !== -1 && bodyEnd > bodyStart) {
      const body = content.slice(bodyStart + 1, bodyEnd)
      const nameMatches = body.matchAll(MATCHER_NAME_PATTERN)
      for (const nameMatch of nameMatches) {
        const name = nameMatch[1].trim()
        if (name && name !== '') {
          CUSTOM_MATCHER_SET.add(name)
        }
      }
    }

    idx = extendStart + 1
  }
}

/**
 * Scan diff content for `expect.extend()` calls and register custom matchers.
 * Call this at the start of each scan to ensure custom matchers are recognized.
 */
export function registerCustomMatchersFromDiff(files: Array<{ hunks: Array<{ content: string }> }>): void {
  for (const file of files) {
    for (const hunk of file.hunks) {
      // Only scan added lines (+) for expect.extend calls
      const addedLines = hunk.content.split('\n').filter(l => l.startsWith('+'))
      for (const line of addedLines) {
        const content = line.slice(1).trim()
        if (content.includes('expect.extend') || content.includes('expect.extend')) {
          // Found a line with expect.extend — extract from full hunk context
          extractFromExpectExtend(hunk.content)
          break
        }
      }
    }
  }
}

/**
 * Initialize custom matchers from environment config at startup.
 * Reads MANTIZ_CUSTOM_MATCHERS env var (comma-separated).
 */
export function initCustomMatchersFromEnv(): void {
  const envCustom = typeof process !== 'undefined' ? process.env.MANTIZ_CUSTOM_MATCHERS : undefined
  if (envCustom) {
    const names = envCustom.split(',').map(s => s.trim()).filter(Boolean)
    for (const name of names) {
      CUSTOM_MATCHER_SET.add(name)
    }
  }
}

/**
 * Register common @testing-library/jest-dom custom matchers that are
 * imported via `import '@testing-library/jest-dom'` (auto-registers via side-effect).
 * These don't appear as `expect.extend()` in user code, so we include them
 * by default to prevent FP.
 */
export function initJestDomMatchers(): void {
  // All @testing-library/jest-dom matchers that import via side-effect
  const jestDomMatchers = [
    'toBeDisabled', 'toBeEnabled', 'toBeEmptyDOMElement',
    'toBeInTheDocument', 'toBeInvalid', 'toBeRequired',
    'toBeValid', 'toBeVisible', 'toContainElement',
    'toContainHTML', 'toHaveAttribute', 'toHaveClass',
    'toHaveFocus', 'toHaveFormValues', 'toHaveStyle',
    'toHaveTextContent', 'toHaveValue', 'toHaveDisplayValue',
    'toHaveAccessibleDescription', 'toHaveAccessibleErrorMessage',
    'toHaveAccessibleName', 'toHaveRole', 'toHaveErrorMessage',
    'toBePartiallyChecked',
  ]
  for (const name of jestDomMatchers) {
    CUSTOM_MATCHER_SET.add(name)
  }
}

// Initialize at module load
initJestDomMatchers()
initCustomMatchersFromEnv()
