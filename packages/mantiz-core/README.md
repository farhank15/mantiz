# @mantiz/core

**Detection engine for Mantiz — AI lie detector for coding agents.**

Pure TypeScript library with zero framework dependencies. Scans git diffs for AI agent cheating patterns across **7 languages** (JS/TS, Python, Go, Java, Ruby, Rust, PHP).

## Installation

```bash
pnpm add @mantiz/core
```

## Usage

```typescript
import { scanDiff, scanDiffAsync } from '@mantiz/core'

const result = scanDiff(diff)
console.log(`Trust Score: ${result.trustScore}/100`)

// Async with AI + PR context
const resultAI = await scanDiffAsync(diff, {
  title: 'fix: handle edge case',
  author: 'ai-agent-bot'
})
```

## API

### `scanDiff(rawDiff: string): ScanResult`

Synchronously run all detectors and return results.

### `scanDiffAsync(rawDiff: string, prContext?: { title?: string; description?: string }, ragContext?: string): Promise<ScanResult>`

Async version with:
- **prContext** — PR title + author for claim-diff mismatch nuance (bot vs human)
- **ragContext** — Code definitions from Qdrant search, injected into AI prompt to prevent false positives on custom APIs

### Types

```typescript
type PatternType =
  | 'disabled_assertion'
  | 'assertion_tampering'
  | 'mock_to_avoid_failure'
  | 'claim_diff_mismatch'
  | 'silent_catch_and_pass'
  | 'hallucinated_assertion'
  | 'ai_assisted_detection'

type Confidence = 'low' | 'medium' | 'high'

type FileImportance = 'core' | 'test' | 'source' | 'config' | 'artifact' | 'docs'

interface Finding {
  patternType: PatternType
  filePath: string
  lineStart: number
  lineEnd: number
  confidence: Confidence
  explanation: string
  evidenceExcerpt: string
  fileImportance?: FileImportance
}
```

### ScanResult

```typescript
{
  trustScore: number        // 0-100, weighted by file importance
  findings: Finding[]       // Detected cheating patterns
  summary: {
    totalFindings: number
    highCount: number
    mediumCount: number
    lowCount: number
    filesScanned: number
  }
  fixInstructions: FixInstruction[]
}
```

## Detectors (Multi-Language)

All detectors use `language-registry.ts` for per-language test framework patterns:

### Disabled Assertion
| Language | Patterns |
|:---------|:---------|
| JS/TS | `test.skip()`, `describe.skip()`, `xit()`, `xdescribe()`, `if (false)` |
| Python | `@pytest.mark.skip`, `@unittest.skip`, `self.skipTest()`, `if False:` |
| Go | `t.Skip()`, `t.Skipf()`, `t.SkipNow()` |
| Java | `@Disabled`, `@Ignore`, `assumeTrue(false)` |
| Ruby | `xit`, `xdescribe`, `pending`, `skip` |
| Rust | `#[ignore]` |
| PHP | `markTestSkipped()`, `markTestIncomplete()` |

### Assertion Tampering
| Language | Patterns |
|:---------|:---------|
| JS/TS | `expect(x).toBe(y)` — value changed without source fix |
| Python | `assert x == y` — condition manipulation |
| Go | `assert.Equal(t, expected, actual)` — tampered expected |
| Java | `assertEquals(expected, actual)` — swapped/tampered |

### Mock-to-Avoid
| Language | Patterns |
|:---------|:---------|
| JS/TS | `vi.mock()`, `jest.mock()`, `vi.spyOn()` |
| Python | `@patch`, `unittest.mock.patch` |
| Go | `testify .On().Return()` |
| Java | `Mockito.mock()`, `@Mock` |
| Ruby | `allow().to receive` |
| PHP | `createMock()`, `getMockBuilder()` |

### Silent Catch
| Language | Patterns |
|:---------|:---------|
| JS/TS | `catch (e) {}` — empty body |
| Python | `except: pass` |
| Go | `if err != nil { return nil }` — no error handling |
| Java | `catch (E e) {}` — empty |
| Ruby | `rescue; end` — no handling |
| PHP | `catch (Exception $e) {}` — empty |

### File Importance Scoring

| File Type | Multiplier | Examples |
|-----------|:----------:|---------|
| `core` / `test` / `source` | 1.0x | `*.ts`, `*.test.ts`, engine code |
| `config` | 0.5x | `package.json`, `tsconfig.json` |
| `docs` | 0.3x | `README.md`, `CHANGELOG.md` |
| `artifact` | 0.05x | Agent tool dirs (`.kuma/`, `.claude/`) |

### Claim-Diff Mismatch Nuance

When scanning with PR context (title + author), findings are **downgraded** for:
- Bot authors (`renovate[bot]`, `dependabot[bot]`) → LOW confidence
- Honest docs-only PRs → LOW confidence
- Rebranding commits (package name change) → auto-cleared

Manual diffs (no context) always get full severity.

## Scoring

Per-detector weights calibrated from 423 labeled PRs.
Score = `max(30, 100 - min(penalty, 85))`. File importance multiplier applies.

## Exports

```typescript
export { scanDiff, scanDiffAsync } from './engine'
export type { ScanResult, FixInstruction } from './engine'
export type { Finding, ParsedDiff, DiffHunk, PatternType, Confidence, FileImportance } from './types'
export { parseRawDiff } from './diff-parser'
export { detectDisabledAssertions } from './detectors/disabled-assertion'
export { detectAssertionTampering } from './detectors/assertion-tampering'
export { detectMockToAvoid } from './detectors/mock-to-avoid'
export { detectClaimDiffMismatch, isNonFunctional, classifyImportance } from './detectors/claim-mismatch'
export { detectSilentCatch } from './detectors/silent-catch'
export { detectHallucinatedAssertions } from './detectors/hallucination'
export { detectWithAI } from './detectors/ai-assisted'
export { evaluateFindings, isAIJudgeEnabled } from './detectors/ai-judge'
```
