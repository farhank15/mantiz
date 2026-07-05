# Mantiz Benchmark

Live dashboard at [/benchmark](https://mantiz-wine.vercel.app/benchmark).

## Calibration v2 — 419 Labeled PRs (16 DECEPTIVE, 403 LEGIT)

Generated: 2026-07-04. Score distribution: avg **98.5** — 425 CLEAN, 6 SUSPICIOUS, 2 DECEPTIVE.

### Per-Detector Performance

| # | Detector | TP | FP | FN | Precision | Recall | F1 | High | Med | Low |
|:-:|:---------|:-:|:--:|:--:|:---------:|:------:|:--:|:----:|:---:|:---:|
| D10 | MutationSusceptibility | 13 | 17 | 3 | **43.3%** | 81.3% | 56.5 | 8 | 3 | 0 |
| D6 | HallucinatedAssertion | 5 | 5 | 11 | **50.0%** | 31.3% | 38.5 | 3 | 2 | 0 |
| D1 | DisabledAssertion | 3 | 5 | 13 | **37.5%** | 18.8% | 25.0 | 3 | 2 | 0 |
| D3 | MockToAvoid | 7 | 13 | 9 | **35.0%** | 43.8% | 38.9 | 5 | 2 | 1 |
| D2 | AssertionTampering | 3 | 7 | 13 | **30.0%** | 18.8% | 23.1 | 2 | 1 | 1 |
| D5 | SilentCatch | 2 | 24 | 14 | **7.7%** | 12.5% | 9.5 | 1 | 1 | 0 |
| D4 | ClaimDiffMismatch | 0 | 7 | 16 | **0.0%** | 0.0% | 0.0 | 0 | 0 | 0 |
| D8 | AIAssisted | 0 | 0 | 16 | **0.0%** | 0.0% | 0.0 | 0 | 0 | 0 |
| D9 | Historical | 0 | 0 | 16 | **0.0%** | 0.0% | 0.0 | 0 | 0 | 0 |
| D11 | AgentInstruction | 0 | 0 | 16 | **0.0%** | 0.0% | 0.0 | 0 | 0 | 0 |

> **Note:** D8/D9/D11 have 0 detections in calibration because they require external context (AI API keys, historical data, agent rules) not present in offline benchmarks. They are defense-in-depth layers that activate in production.

### Scoring Formula

```
penalty = sum(weight × file_importance_multiplier for each finding)
score   = max(30, 100 - min(penalty, 85))
```

**File Importance Multiplier:**

| Type | Multiplier | Examples |
|:-----|:----------:|:---------|
| `core` / `test` / `source` | 1.0x | Engine, test files, source code |
| `config` | 0.5x | package.json, tsconfig, yaml |
| `docs` | 0.3x | README, markdown, changelog |
| `artifact` | 0.05x | Agent cache dirs, .gitignored paths |

### Claim-Diff Mismatch Nuance

Scanned via PR URL (with title + author context), findings are downgraded:
- Bot authors (`renovate[bot]`, `dependabot[bot]`) → LOW confidence (−5pts)
- Honest docs-only PRs → LOW confidence (−5pts)
- Rebranding commits (package name change) → auto-cleared

Manual diffs (no context) always get full severity (−30pts).

---

## Calibration v1 — 203 PRs (20 DECEPTIVE, 183 LEGIT)

Previous baseline (superseded by v2):

| Detector | Precision | Recall | F1 |
|:---------|:---------:|:------:|:--:|
| D1 DisabledAssertion | 45.5% | 25.0% | 32.3 |
| D2 AssertionTampering | 100% | 15.0% | 26.1 |
| D3 MockToAvoid | 100% | 5.0% | 9.5 |
| D4 ClaimDiffMismatch | 0.0% | 0.0% | 0.0 |
| D5 SilentCatch | 33.3% | 10.0% | 15.4 |
| D6 HallucinatedAssertion | 77.8% | 70.0% | 73.7 |
| D10 MutationSusceptibility | 30.0% | 60.0% | 40.0 |

---

## Datasets

| Dataset | Fixtures | Description | Source |
|:--------|:--------:|:------------|:-------|
| A — Honest Code | 4 | Proper diff + valid test updates | Real PRs (vitest-dev/vitest) |
| B — Lazy Cheating AI | 11 | `.skip()`, `if(false)`, commented assertions | Research-based (DebugML/UC Berkeley) |
| C — Smart Evasion AI | 4 | Assertion tampering, mock + empty catch | Research-based (DebugML) |
| FP — False Positives | 23 | Legitimate code patterns | 2 real vitest PRs + 21 documented |

Run benchmark locally:

```bash
npx tsx scripts/run-benchmark.ts
npx tsx scripts/eval/ci-check.ts
```
