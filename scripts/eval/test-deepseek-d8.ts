/**
 * Quick smoke test for DeepSeek V4 Flash with D8.
 * Verifies the model responds correctly with response_format json_schema.
 */
import { detectWithAI } from '../../src/detectors/ai-assisted'
import type { ParsedDiff } from '../../src/detectors/types'

// A known deceptive diff: assertion wrapped in if(false)
const testFiles: ParsedDiff[] = [
  {
    oldFile: 'test/example.test.js',
    newFile: 'test/example.test.js',
    hunks: [
      {
        oldStart: 1,
        oldLines: 5,
        newStart: 1,
        newLines: 8,
        content: ` expect(result).toBe(42)
+if (false) {
+  expect(result).toBe(42)
+}
`,
      },
    ],
  },
]

async function main() {
  process.env.AI_DETECTION_ENABLED = 'true'
  console.log('Testing DeepSeek V4 Flash with known deceptive diff...\n')

  const start = Date.now()
  const findings = await detectWithAI(testFiles)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`Response time: ${elapsed}s`)
  console.log(`Findings: ${findings.length}`)

  if (findings.length > 0) {
    console.log('\n--- D8 CAUGHT IT! ---')
    for (const f of findings) {
      console.log(`  File: ${f.filePath}`)
      console.log(`  Confidence: ${f.confidence}`)
      console.log(`  Evidence: ${f.evidenceExcerpt}`)
      console.log(`  Explanation: ${f.explanation}`)
    }
    console.log('\nDeepSeek V4 Flash ✅ — bisa detect cheating!')
  } else {
    console.log('\nDeepSeek V4 Flash ❌ — tidak detect apa-apa')
  }
}

main().catch(console.error)
