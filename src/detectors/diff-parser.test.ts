import { describe, it, expect } from 'vitest'
import { parseRawDiff } from './diff-parser'

describe('diff-parser', () => {

  it('returns empty array for empty input', () => {
    expect(parseRawDiff('')).toEqual([])
    expect(parseRawDiff('   ')).toEqual([])
  })

  it('parses a valid single-file diff with one hunk', () => {
    const diff = [
      'diff --git a/src/math.ts b/src/math.ts',
      'index 123..456 100644',
      '--- a/src/math.ts',
      '+++ b/src/math.ts',
      '@@ -1,4 +1,4 @@',
      ' export function add(a: number, b: number) {',
      '-  return a - b;',
      '+  return a + b;',
      ' }',
    ].join('\n')

    const result = parseRawDiff(diff)
    expect(result).toHaveLength(1)
    expect(result[0].hunks).toHaveLength(1)
    expect(result[0].hunks[0].newStart).toBe(1)
    expect(result[0].hunks[0].content).toContain('return a + b')
  })

  it('parses multiple files in one diff', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index 123..456 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/src/bar.ts b/src/bar.ts',
      'index 789..012 100644',
      '--- a/src/bar.ts',
      '+++ b/src/bar.ts',
      '@@ -1 +1 @@',
      '-oldbar',
      '+newbar',
    ].join('\n')

    const result = parseRawDiff(diff)
    expect(result).toHaveLength(2)
    // Both should have at least one hunk with content
    expect(result[0].hunks[0].content).toBeTruthy()
    expect(result[1].hunks[0].content).toBeTruthy()
  })

  it('handles multi-hunk diff', () => {
    const diff = [
      'diff --git a/src/math.ts b/src/math.ts',
      'index 123..456 100644',
      '--- a/src/math.ts',
      '+++ b/src/math.ts',
      '@@ -5,4 +5,5 @@',
      '  return a + b;',
      ' }',
      '+',
      '+export function subtract(a: number, b: number) {',
      '+  return a - b;',
      '+}',
      '@@ -12,4 +13,5 @@',
      '  return a * b;',
      ' }',
      '+',
      '+export function divide(a: number, b: number) {',
      '+  return a / b;',
      '+}',
    ].join('\n')

    const result = parseRawDiff(diff)
    expect(result).toHaveLength(1)
    expect(result[0].hunks).toHaveLength(2)
  })
})
