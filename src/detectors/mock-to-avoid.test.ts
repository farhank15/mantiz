import { describe, it, expect } from 'vitest'
import { detectMockToAvoid } from './mock-to-avoid'

function makeTestDiff(path: string, lines: string[]): Parameters<typeof detectMockToAvoid>[0] {
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

describe('detectMockToAvoid', () => {

  it('detects vi.mock() in test file', () => {
    const files = makeTestDiff('src/foo.test.ts', [
      ' import { describe, it, expect, vi } from "vitest"',
      '+ vi.mock("./database")',
      '',
      ' describe("api", () => {',
      '   it("works", () => {',
      '     expect(true).toBe(true)',
      '   })',
      ' })',
    ])
    const result = detectMockToAvoid(files)
    expect(result.some(f => f.patternType === 'mock_to_avoid_failure')).toBe(true)
  })

  it('detects vi.fn() with lower confidence', () => {
    const files = makeTestDiff('src/foo.test.ts', [
      ' import { vi } from "vitest"',
      '+ const mockFn = vi.fn()',
      '',
      ' describe("api", () => {',
      '   it("works", () => {',
      '     expect(mockFn).toHaveBeenCalled()',
      '   })',
      ' })',
    ])
    const result = detectMockToAvoid(files)
    const fnFindings = result.filter(f => f.patternType === 'mock_to_avoid_failure')
    expect(fnFindings.length).toBeGreaterThanOrEqual(1)
  })

  it('detects vi.spyOn()', () => {
    const files = makeTestDiff('src/foo.test.ts', [
      ' import { vi } from "vitest"',
      '+ vi.spyOn(console, "log")',
      '',
      ' describe("logger", () => {',
      '   it("logs", () => {',
      '     console.log("test")',
      '   })',
      ' })',
    ])
    const result = detectMockToAvoid(files)
    const spyFindings = result.filter(f => f.patternType === 'mock_to_avoid_failure')
    expect(spyFindings.length).toBeGreaterThanOrEqual(1)
  })

  it('skips non-test files', () => {
    const files = makeTestDiff('src/math.ts', [
      ' import { vi } from "vitest"',
      '+ vi.mock("./database")',
    ])
    const result = detectMockToAvoid(files)
    expect(result).toHaveLength(0)
  })

  it('skips deleted files', () => {
    const files: Parameters<typeof detectMockToAvoid>[0] = [{
      newFile: '/dev/null',
      oldFile: 'src/foo.test.ts',
      hunks: [{
        oldStart: 1,
        oldLines: 5,
        newStart: 0,
        newLines: 0,
        content: '+ vi.mock("./database")',
      }],
    }]
    const result = detectMockToAvoid(files)
    expect(result).toHaveLength(0)
  })
})
