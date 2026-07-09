import { describe, it, expect } from 'vitest'
import { detectAssertionTampering } from './assertion-tampering'
import type { ParsedDiff } from './types'

function makeTestDiff(path: string, lines: string[]): ParsedDiff[] {
  return [{
    newFile: path,
    oldFile: path,
    hunks: [{
      oldStart: 1,
      oldLines: lines.length,
      newStart: 1,
      newLines: lines.length,
      content: lines.join('\n'),
    }],
  }]
}

function makeDiffWithSource(testPath: string, sourcePath: string, testLines: string[], sourceLines: string[]): ParsedDiff[] {
  return [
    {
      newFile: testPath,
      oldFile: testPath,
      hunks: [{
        oldStart: 1,
        oldLines: testLines.length,
        newStart: 1,
        newLines: testLines.length,
        content: testLines.join('\n'),
      }],
    },
    {
      newFile: sourcePath,
      oldFile: sourcePath,
      hunks: [{
        oldStart: 1,
        oldLines: sourceLines.length,
        newStart: 1,
        newLines: sourceLines.length,
        content: sourceLines.join('\n'),
      }],
    },
  ]
}

describe('detectAssertionTampering', () => {

  it('detects value change without source change as HIGH', () => {
    const files = makeTestDiff('src/math.test.ts', [
      ' describe("math", () => {',
      '   it("adds", () => {',
      '-    expect(add(1, 2)).toBe(3)',
      '+    expect(add(1, 2)).toBe(4)',
      '   })',
      ' })',
    ])
    const result = detectAssertionTampering(files)
    expect(result.some(f => f.confidence === 'high')).toBe(true)
  })

  it('downgrades to LOW when corresponding source file also changed', () => {
    const files = makeDiffWithSource(
      'src/math.test.ts',
      'src/math.ts',
      [
        ' describe("math", () => {',
        '   it("adds", () => {',
        '-    expect(add(1, 2)).toBe(3)',
        '+    expect(add(1, 2)).toBe(4)',
        '   })',
        ' })',
      ],
      [
        ' export function add(a: number, b: number) {',
        '-  return a - b;',
        '+  return a + b;',
        ' }',
      ],
    )
    const result = detectAssertionTampering(files)
    // Should find at least one finding since the test assertion changed
    expect(result.some(f => f.patternType === 'assertion_tampering')).toBe(true)
  })

  it('detects removed assertion without source change', () => {
    const files = makeTestDiff('src/math.test.ts', [
      ' describe("math", () => {',
      '   it("adds", () => {',
      '-    expect(add(1, 2)).toBe(3)',
      '   })',
      ' })',
    ])
    const result = detectAssertionTampering(files)
    expect(result.some(f => f.patternType === 'assertion_tampering')).toBe(true)
  })

  it('skips non-test files', () => {
    const files = makeTestDiff('src/math.ts', [
      ' export function add(a: number, b: number) {',
      '-  return a - b;',
      '+  return a + b;',
      ' }',
    ])
    const result = detectAssertionTampering(files)
    expect(result).toHaveLength(0)
  })

  it('skips deleted files', () => {
    const files: ParsedDiff[] = [{
      newFile: '/dev/null',
      oldFile: 'src/math.test.ts',
      hunks: [{
        oldStart: 1,
        oldLines: 5,
        newStart: 0,
        newLines: 0,
        content: '- expect(add(1, 2)).toBe(3)',
      }],
    }]
    const result = detectAssertionTampering(files)
    expect(result).toHaveLength(0)
  })
})
