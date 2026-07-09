import { describe, it, expect } from 'vitest'
import { detectClaimDiffMismatch } from './claim-mismatch'
import type { ParsedDiff } from './types'

function makeFiles(paths: { newFile?: string; oldFile?: string; lines: string[] }[]): ParsedDiff[] {
  return paths.map(p => ({
    newFile: p.newFile ?? p.oldFile ?? 'unknown',
    oldFile: p.oldFile ?? p.newFile ?? 'unknown',
    hunks: [{
      oldStart: 1,
      oldLines: p.lines.length,
      newStart: 1,
      newLines: p.lines.length,
      content: p.lines.join('\n'),
    }],
  }))
}

describe('detectClaimDiffMismatch', () => {

  it('flags non-functional changes when PR claims tests', () => {
    const files = makeFiles([
      { newFile: 'README.md', lines: ['-# Old', '+# New'] },
    ])
    // Must use singular 'test' because TEST_CLAIM_KEYWORDS uses \btest\b
    const result = detectClaimDiffMismatch(files, { title: 'fix unit test for edge case' })
    expect(result.some(f => f.patternType === 'claim_diff_mismatch')).toBe(true)
  })

  it('does NOT flag non-functional changes when PR does NOT claim tests', () => {
    const files = makeFiles([
      { newFile: 'README.md', lines: ['-# Old', '+# New'] },
    ])
    const result = detectClaimDiffMismatch(files, { title: 'update docs' })
    expect(result.some(f => f.patternType === 'claim_diff_mismatch')).toBe(false)
  })

  it('does NOT flag non-functional changes without prContext', () => {
    const files = makeFiles([
      { newFile: 'README.md', lines: ['-# Old', '+# New'] },
    ])
    const result = detectClaimDiffMismatch(files)
    expect(result).toHaveLength(0)
  })

  it('flags source changes without test updates', () => {
    const files = makeFiles([
      { newFile: 'src/math.ts', lines: [
        ' export function add(a: number, b: number) {',
        '-  return a - b;',
        '+  return a + b;',
        ' }',
      ]},
    ])
    const result = detectClaimDiffMismatch(files, { title: 'fix unit test for math' })
    expect(result.some(f => f.patternType === 'claim_diff_mismatch')).toBe(true)
  })

  it('does NOT flag source+test changes together', () => {
    const files = makeFiles([
      { newFile: 'src/math.ts', lines: [
        ' export function add(a: number, b: number) {',
        '-  return a - b;',
        '+  return a + b;',
        ' }',
      ]},
      { newFile: 'src/math.test.ts', lines: [
        ' describe("math", () => {',
        '+  it("adds", () => { expect(add(1,2)).toBe(3) })',
        ' })',
      ]},
    ])
    const result = detectClaimDiffMismatch(files, { title: 'fix unit test for math' })
    expect(result.some(f => f.patternType === 'claim_diff_mismatch')).toBe(false)
  })

  it('flags with lower confidence for known bot authors', () => {
    const files = makeFiles([
      { newFile: 'README.md', lines: ['-# Old', '+# New'] },
    ])
    const result = detectClaimDiffMismatch(files, {
      title: 'fix unit test for edge case',
      author: 'dependabot[bot]',
    })
    // Bot author triggers isLegitimateDepUpdate → low confidence
    const findings = result.filter(f => f.patternType === 'claim_diff_mismatch')
    expect(findings.length).toBeGreaterThanOrEqual(1)
    // Bot should produce low confidence (it's a legit dep update)
    const allLow = findings.every(f => f.confidence === 'medium' || f.confidence === 'low')
    expect(allLow).toBe(true)
  })
})
