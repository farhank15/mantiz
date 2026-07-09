import { describe, it, expect } from 'vitest'
import { detectSilentCatch } from './silent-catch'

function makeSourceDiff(path: string, lines: string[]): Parameters<typeof detectSilentCatch>[0] {
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

describe('detectSilentCatch', () => {

  it('detects empty catch block', () => {
    const files = makeSourceDiff('src/api.ts', [
      ' export async function fetchData() {',
      '   try {',
      '     const res = await fetch("/api/data")',
      '+    return await res.json()',
      '+  } catch {}',
      ' }',
    ])
    const result = detectSilentCatch(files)
    expect(result.some(f => f.patternType === 'silent_catch_and_pass')).toBe(true)
  })

  it('detects catch with only TODO comment', () => {
    const files = makeSourceDiff('src/api.ts', [
      ' export async function fetchData() {',
      '   try {',
      '     const res = await fetch("/api/data")',
      '+    return await res.json()',
      '+  } catch (e) {',
      '+    // TODO: handle error properly',
      '+  }',
      ' }',
    ])
    const result = detectSilentCatch(files)
    expect(result.some(f => f.patternType === 'silent_catch_and_pass')).toBe(true)
  })

  it('detects catch that returns null (single-line)', () => {
    const files = makeSourceDiff('src/api.ts', [
      ' export async function fetchData() {',
      '   try {',
      '+    return await fetch("/api/data").then(r => r.json())',
      '+  } catch { return null }',
      ' }',
    ])
    const result = detectSilentCatch(files)
    expect(result.some(f => f.patternType === 'silent_catch_and_pass')).toBe(true)
  })

  it('skips .tsx files (React components)', () => {
    const files = makeSourceDiff('src/App.tsx', [
      ' export function App() {',
      '   try {',
      '     doSomething()',
      '   } catch {}',
      ' }',
    ])
    const result = detectSilentCatch(files)
    expect(result).toHaveLength(0)
  })

  it('detects Python except:pass', () => {
    const files = makeSourceDiff('src/api.py', [
      ' def fetch_data():',
      '   try:',
      '     return requests.get("/api/data")',
      '+  except:',
      '+    pass',
    ])
    const result = detectSilentCatch(files)
    expect(result.some(f => f.patternType === 'silent_catch_and_pass')).toBe(true)
  })

  it('detects Python except Exception as e: pass', () => {
    const files = makeSourceDiff('src/api.py', [
      ' def fetch_data():',
      '   try:',
      '     return requests.get("/api/data")',
      '+  except Exception as e:',
      '+    pass',
    ])
    const result = detectSilentCatch(files)
    expect(result.some(f => f.patternType === 'silent_catch_and_pass')).toBe(true)
  })

  it('detects empty finally block (single-line)', () => {
    const files = makeSourceDiff('src/api.ts', [
      ' export async function fetchData() {',
      '   try {',
      '     const res = await fetch("/api/data")',
      '     return await res.json()',
      '+  } finally {}',
      ' }',
    ])
    const result = detectSilentCatch(files)
    expect(result.some(f => f.patternType === 'silent_catch_and_pass')).toBe(true)
  })

  it('skips deleted files', () => {
    const files: Parameters<typeof detectSilentCatch>[0] = [{
      newFile: '/dev/null',
      oldFile: 'src/api.ts',
      hunks: [{
        oldStart: 1,
        oldLines: 5,
        newStart: 0,
        newLines: 0,
        content: '+  } catch {}',
      }],
    }]
    const result = detectSilentCatch(files)
    expect(result).toHaveLength(0)
  })
})
