import { describe, it, expect } from 'vitest'
import { detectHallucinatedAssertions } from './hallucination'

function makeTestDiff(path: string, lines: string[]): Parameters<typeof detectHallucinatedAssertions>[0] {
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

describe('detectHallucinatedAssertions', () => {

  it('detects known hallucinated matcher toNotExist', () => {
    const files = makeTestDiff('src/foo.test.ts', [
      ' describe("component", () => {',
      '   it("renders", () => {',
      '+    expect(element).toNotExist()',
      '   })',
      ' })',
    ])
    const result = detectHallucinatedAssertions(files)
    expect(result.some(f => f.patternType === 'hallucinated_assertion')).toBe(true)
  })

  it('detects known hallucinated matcher mustBe', () => {
    const files = makeTestDiff('src/foo.test.ts', [
      ' describe("data", () => {',
      '   it("validates", () => {',
      '+    expect(result).mustBe(true)',
      '   })',
      ' })',
    ])
    const result = detectHallucinatedAssertions(files)
    expect(result.some(f => f.patternType === 'hallucinated_assertion')).toBe(true)
  })

  it('does NOT flag valid Jest matcher toBe', () => {
    const files = makeTestDiff('src/foo.test.ts', [
      ' describe("math", () => {',
      '   it("adds", () => {',
      '+    expect(1 + 1).toBe(2)',
      '   })',
      ' })',
    ])
    const result = detectHallucinatedAssertions(files)
    expect(result.some(f => f.patternType === 'hallucinated_assertion')).toBe(false)
  })

  it('does NOT flag toHaveBeenCalled', () => {
    const files = makeTestDiff('src/foo.test.ts', [
      ' describe("mock", () => {',
      '   it("was called", () => {',
      '+    expect(mockFn).toHaveBeenCalled()',
      '   })',
      ' })',
    ])
    const result = detectHallucinatedAssertions(files)
    expect(result.some(f => f.patternType === 'hallucinated_assertion')).toBe(false)
  })

  it('does NOT flag non-assertion methods like toString', () => {
    const files = makeTestDiff('src/foo.test.ts', [
      ' describe("string", () => {',
      '   it("converts", () => {',
      '+    expect(num.toString()).toBe("5")',
      '   })',
      ' })',
    ])
    const result = detectHallucinatedAssertions(files)
    expect(result.some(f => f.patternType === 'hallucinated_assertion')).toBe(false)
  })

  it('skips non-test files', () => {
    const files = makeTestDiff('src/math.ts', [
      ' export function add(a: number, b: number) {',
      '+  return a + b;',
      ' }',
    ])
    const result = detectHallucinatedAssertions(files)
    expect(result).toHaveLength(0)
  })

  it('skips deleted files', () => {
    const files: Parameters<typeof detectHallucinatedAssertions>[0] = [{
      newFile: '/dev/null',
      oldFile: 'src/foo.test.ts',
      hunks: [{
        oldStart: 1,
        oldLines: 5,
        newStart: 0,
        newLines: 0,
        content: '+ expect(el).toNotExist()',
      }],
    }]
    const result = detectHallucinatedAssertions(files)
    expect(result).toHaveLength(0)
  })
})
