# @mantiz/core

**Detection engine for Mantiz — AI lie detector for coding agents.**

Pure TypeScript library with zero framework dependencies. Scans git diffs for AI agent cheating patterns.

## Installation

```bash
npm install @mantiz/core
```

## Usage

```typescript
import { scanDiff } from '@mantiz/core'

const diff = `
diff --git a/test.js b/test.js
index abc..def 100644
--- a/test.js
+++ b/test.js
@@ -1,5 +1,5 @@
 describe('math', () => {
-  it('adds numbers', () => {
+  it.skip('adds numbers', () => {
     expect(1 + 1).toBe(2)
   })
 })
`

const result = scanDiff(diff)
console.log(`Trust Score: ${result.trustScore}/100`)
console.log(`Findings: ${result.findings.length}`)
```

## API

### `scanDiff(rawDiff: string): ScanResult`

Synchronously run all 11 detectors and return results.

### `scanDiffAsync(rawDiff: string): Promise<ScanResult>`

Async version that also runs AI-assisted detection (via Fireworks/Groq).

### ScanResult

```typescript
{
  trustScore: number        // 0-100
  findings: Finding[]       // Detected cheating patterns
  summary: {                // Aggregate stats
    totalFindings: number
    highCount: number
    mediumCount: number
    lowCount: number
    filesScanned: number
  }
  fixInstructions: FixInstruction[]  // Auto-generated remediation
}
```

## Detectors (11 patterns)

| # | Detector | What It Catches |
|---|----------|----------------|
| 1 | Disabled Assertion | `.skip()`, `if(false)`, commented-out assertions |
| 2 | Assertion Tampering | Changed expected values without source fix |
| 3 | Mock-to-Avoid | Excessive mocking to bypass real errors |
| 4 | Claim-Diff Mismatch | Commit msg doesn't match actual changes |
| 5 | Silent Catch | Empty catch blocks that swallow errors |
| 6 | Hallucinated Assertion | Unknown/non-existent assertion matchers |
| 7 | AST Analyzer (Babel) | Parses JS/TS — detects trivial function bodies, async gutting, conditional wrapping |
| 8 | Tree-sitter AST | Multi-language AST via WASM — Python, Go, Java, Ruby, Rust, PHP |
| 9 | Historical Behavioral | Tracks author patterns — style changes, odd hours, score volatility |
| 10 | Mutation Susceptibility | Detects fragile tests with low assertion density |
| 11 | AI-Assisted | LLM-powered semantic analysis (Fireworks + Groq) |

### File Importance Scoring

Findings are weighted by file type:

| File Type | Multiplier | Examples |
|-----------|:----------:|---------|
| `core` / `test` / `source` | 1.0x | `*.ts`, `*.test.ts`, engine code |
| `config` | 0.5x | `package.json`, `tsconfig.json` |
| `docs` | 0.3x | `README.md`, `CHANGELOG.md` |
| `artifact` | 0.05x | Agent tool dirs (`.kuma/`, `.claude/`), gitignored paths |

### Claim-Diff Mismatch Nuance

When scanning via PR URL (with title + author context), Mantiz **downgrades** findings for:
- Bot authors (`renovate[bot]`, `dependabot[bot]`, etc.) — LOW confidence
- Honest docs-only PRs — LOW confidence

Manual diffs (without context) always get full severity.

## ScanResult

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
  fixInstructions: FixInstruction[]  // Auto-generated remediation
}
```
