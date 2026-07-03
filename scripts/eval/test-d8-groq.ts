#!/usr/bin/env tsx
/**
 * Quick test: verify D8 AI-assisted detection works with GROQ API key.
 *
 * Usage:
 *   AI_DETECTION_ENABLED=true GROQ_API_KEY=gsk_... npx tsx scripts/eval/test-d8-groq.ts
 */

import { detectWithAI } from '../../src/detectors/ai-assisted'
import { parseRawDiff } from '../../src/detectors/diff-parser'
import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  // Check env
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY not set')
    process.exit(1)
  }
  if (process.env.AI_DETECTION_ENABLED !== 'true') {
    console.error('❌ AI_DETECTION_ENABLED not set to true')
    process.exit(1)
  }

  // Find a sample fixture
  const fixturesDir = path.resolve(import.meta.dirname, '../../tests/fixtures/dataset-b')
  if (!fs.existsSync(fixturesDir)) {
    console.error('❌ fixtures dir not found')
    process.exit(1)
  }

  const files = fs.readdirSync(fixturesDir)
  const sampleFile = files.find(f => f.endsWith('.ts'))
  if (!sampleFile) {
    console.error('❌ no .ts fixture found')
    process.exit(1)
  }

  const content = fs.readFileSync(path.join(fixturesDir, sampleFile), 'utf-8')
  console.log(`📄 Fixture: ${sampleFile}`)
  console.log(`📏 Diff length: ${content.length} chars`)
  console.log()

  // Parse and run AI detection
  const parsed = parseRawDiff(content)
  console.log(`📦 Files parsed: ${parsed.length}`)
  parsed.forEach(f => console.log(`  - ${f.newFile || f.oldFile}`))
  console.log()

  console.log('🤖 Running D8 AI-assisted detection (GROQ)...')
  const start = Date.now()
  const findings = await detectWithAI(parsed)
  const elapsed = Date.now() - start

  console.log(`⏱️  ${elapsed}ms`)
  console.log(`🔍 Findings: ${findings.length}`)

  if (findings.length > 0) {
    for (const f of findings) {
      console.log(`  ${f.patternType} | ${f.confidence} | ${f.explanation.slice(0, 120)}`)
    }
  } else {
    console.log('  No AI findings')
  }
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
