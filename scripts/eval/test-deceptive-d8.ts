/**
 * Quick test: run D8 (DeepSeek V4 Flash) only on CONFIRMED_DECEPTIVE PRs.
 * Uses shared-scan.ts helpers for consistency with calibration pipeline.
 */
import { loadRawCandidates, loadGroundTruth, standaloneScanAsync } from './shared-scan'

async function main() {
  process.env.AI_DETECTION_ENABLED = 'true'

  const candidates = loadRawCandidates()
  const groundTruth = loadGroundTruth()

  const deceptive = candidates.filter(c => {
    const gt = groundTruth.get(c.pr_url)
    return gt?.ground_truth_label === 'CONFIRMED_DECEPTIVE'
  })

  console.log(`Total candidates: ${candidates.length}`)
  console.log(`Ground truth entries: ${groundTruth.size}`)
  console.log(`Deceptive PRs with diffs: ${deceptive.length}\n`)

  let caught = 0
  let missed = 0
  const start = Date.now()

  for (let i = 0; i < deceptive.length; i++) {
    const pr = deceptive[i]
    const result = await standaloneScanAsync(pr.diff, pr.title)

    // Check if D8 caught anything
    const d8Findings = result.findings.filter(f => f.patternType === 'ai_assisted_detection')

    if (d8Findings.length > 0) {
      console.log(`✅ [${i + 1}/${deceptive.length}] CAUGHT — ${pr.pr_url}`)
      for (const f of d8Findings) {
        console.log(`   ${f.confidence}: ${f.explanation.slice(0, 150)}`)
      }
      caught++
    } else {
      console.log(`❌ [${i + 1}/${deceptive.length}] MISS — ${pr.pr_url} (score: ${result.trustScore}, other findings: ${result.findings.length})`)
      missed++
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  const tpRate = ((caught / deceptive.length) * 100).toFixed(0)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`D8 (DeepSeek V4 Flash) on ${deceptive.length} DECEPTIVE PRs`)
  console.log(`${'='.repeat(60)}`)
  console.log(`  TP: ${caught}/${deceptive.length} (${tpRate}%)`)
  console.log(`  FN: ${missed}/${deceptive.length}`)
  console.log(`  Time: ${elapsed}s (avg ${(parseFloat(elapsed) / deceptive.length).toFixed(1)}s/PR)`)

  if (caught > 0) {
    console.log(`\n🔥 DeepSeek V4 Flash catches ${caught} deceptive PRs!`)
    // Check which detectors also caught these — is D8 providing unique value?
    console.log(`   (need to check if other detectors also caught these)`)
  } else {
    console.log(`\n❌ DeepSeek V4 Flash masih 0 TP. D8 belum siap aktif.`)
  }
}

main().catch(console.error)
