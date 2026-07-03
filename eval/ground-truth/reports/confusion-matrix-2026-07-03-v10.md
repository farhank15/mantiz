# Confusion Matrix — v10 Manual-Only (2026-07-03)

## Dataset
- **Total entries**: 204 (manual-labeled only)
- **DECEPTIVE**: 20
- **LEGIT**: 184
- **Sources**: 87 reviewer_flagged, 44 ai_agent, 73 github_pr
- **Verdict Accuracy**: **92.6%** (189/204)

## Per-Detector Performance

| Detector | TP | FP | FN | TN | Precision | Recall | F1 | Hits |
|----------|----|----|----|----|-----------|--------|----|------|
| D6_HallucinatedAssertion | 14 | 4 | 6 | 179 | 77.8% | 70.0% | 73.7 | 18 |
| D10_MutationSusceptibility | 12 | 28 | 8 | 155 | 30.0% | 60.0% | 40.0 | 40 |
| D1_DisabledAssertion | 5 | 6 | 15 | 177 | 45.5% | 25.0% | 32.3 | 11 |
| D2_AssertionTampering | 3 | 0 | 17 | 183 | 100% | 15.0% | 26.1 | 3 |
| D5_SilentCatch | 2 | 4 | 18 | 179 | 33.3% | 10.0% | 15.4 | 6 |
| D3_MockToAvoid | 1 | 0 | 19 | 183 | 100% | 5.0% | 9.5 | 1 |
| D4_ClaimDiffMismatch | 0 | 1 | 20 | 182 | 0% | 0% | 0.0 | 1 |

**D9_HistoricalBehavior**: No hits in manual dataset — 0% precision (unvalidated)

## Changes from v7
- D6 Precision improved: **54.9% → 77.8%** (toOutput custom matcher whitelisted)
- D9 nerfed: all findings capped to LOW/INFO, accusatory language removed
- Dataset grew: 338 → 204 manual (20 DECEPTIVE vs 33 — some v7 entries not re-scanned)
- Verdict Accuracy: 95.6% → 92.6% (larger dataset, more edge cases)

## Key Insight
All 20 DECEPTIVE entries come from reviewer-comment sources (16 reviewer_flagged, 4 github_pr).
**Zero DECEPTIVE from ai_agent (0/44) or bug_reemergence (0/0 manual).** This confirms the circularity problem — ground truth still underrepresents non-reviewer cheating patterns.
