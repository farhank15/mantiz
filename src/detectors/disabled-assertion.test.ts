import { describe, it, expect } from 'vitest'
import { detectDisabledAssertions } from './disabled-assertion'
import type { ParsedDiff } from './types'

function makeDiff(path: string, lines: string[]): ParsedDiff[] {
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

describe('detectDisabledAssertions', () => {

  it('flags .skip() in test file', () => {
    const files = makeDiff('src/foo.test.ts', [
      ' describe("math", () => {',
      // No reason string → pattern 'skip' → high confidence
      '+ it.skip(() => {',
      '+   expect(1 + 1).toBe(2)',
      '+ })',
      ' })',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })

  it('flags .todo() in test file as low confidence', () => {
    const files = makeDiff('src/foo.test.ts', [
      ' describe("math", () => {',
      '+ it.todo("adds two numbers")',
      ' })',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion' && f.confidence === 'low')).toBe(true)
  })

  it('flags xit in test file', () => {
    const files = makeDiff('src/foo.test.ts', [
      ' describe("math", () => {',
      '+ xit("adds two numbers", () => {',
      '+   expect(1 + 1).toBe(2)',
      '+ })',
      ' })',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })

  it('flags .only() as focus pattern', () => {
    const files = makeDiff('src/foo.test.ts', [
      ' describe("math", () => {',
      '+ it.only("adds two numbers", () => {',
      '+   expect(1 + 1).toBe(2)',
      '+ })',
      ' })',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })

  it('flags if (false) wrapper', () => {
    const files = makeDiff('src/foo.test.ts', [
      ' describe("math", () => {',
      '+ if (false) {',
      '+   it("adds two numbers", () => {',
      '+     expect(1 + 1).toBe(2)',
      '+   })',
      '+ }',
      ' })',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })

  it('flags commented-out assertion', () => {
    const files = makeDiff('src/foo.test.ts', [
      ' describe("math", () => {',
      '+   // expect(1 + 1).toBe(2)',
      ' })',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })

  it('does NOT flag non-test files', () => {
    const files = makeDiff('src/math.ts', [
      ' export function add(a: number, b: number) {',
      '+  return a + b;',
      ' }',
    ])
    const result = detectDisabledAssertions(files)
    expect(result).toHaveLength(0)
  })

  it('does NOT flag deleted files', () => {
    const files: ParsedDiff[] = [{
      newFile: '/dev/null',
      oldFile: 'src/foo.test.ts',
      hunks: [{
        oldStart: 1,
        oldLines: 5,
        newStart: 0,
        newLines: 0,
        content: '- console.log("removed")',
      }],
    }]
    const result = detectDisabledAssertions(files)
    expect(result).toHaveLength(0)
  })

  it('detects Python @pytest.mark.skip', () => {
    const files = makeDiff('tests/test_foo.py', [
      ' import pytest',
      '+ @pytest.mark.skip',
      '+ def test_add():',
      '+     assert 1 + 1 == 2',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })

  it('detects Go t.Skip()', () => {
    const files = makeDiff('src/foo_test.go', [
      ' func TestAdd(t *testing.T) {',
      '+   t.Skip("not implemented")',
      ' }',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })

  it('detects Java @Disabled', () => {
    const files = makeDiff('src/test/java/FooTest.java', [
      ' import org.junit.jupiter.api.Test;',
      '+ @Disabled',
      '+ @Test',
      '+ void testAdd() {',
      '+     assertEquals(2, 1 + 1);',
      '+ }',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })

  it('detects Rust #[ignore]', () => {
    const files = makeDiff('src/tests.rs', [
      ' #[cfg(test)]',
      ' mod tests {',
      '+   #[test]',
      '+   #[ignore]',
      '+   fn test_add() {',
      '+     assert_eq!(2, 1 + 1);',
      '+   }',
      ' }',
    ])
    const result = detectDisabledAssertions(files)
    expect(result.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })
})
