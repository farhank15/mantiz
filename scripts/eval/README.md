# Mantiz Evaluation Pipeline — Reproducibility Guide

## Pipeline Overview

```
scrape-github.ts → raw_candidates.jsonl → standalone-scan.ts → labeled_v1.jsonl
                                                                       ↓
                                                          [Manual Labeling]
                                                                       ↓
                                                          labeled_v1.jsonl (dengan label)
                                                                       ↓
                                                          confusion-matrix.ts → reports/*.md
```

## Step-by-Step

### 1. Scrape GitHub PR Candidates

```bash
npx tsx scripts/eval/scrape-github.ts --token ghp_xxx --limit 20
```

This searches GitHub for PRs matching reviewer-flagged comments, AI agent PRs, and disabled assertion patterns. Results are saved to `eval/ground-truth/raw_candidates.jsonl`.

**Rate limits:**
- Authenticated: 5,000 req/hour — ✅ recommended
- Unauthenticated: 60 req/hour — ❌ not recommended

### 2. Scan Candidates with Detector

```bash
npx tsx scripts/eval/standalone-scan.ts
```

Runs D1-D6 + D10 detectors (fast regex-only, skips D7a AST, D7b Tree-sitter, D8 AI, D9 historical yang butuh server).
Injects the **current git commit hash** into every entry for version freeze. Output: `eval/ground-truth/labeled_v1.jsonl`.

**Limit to first N:**
```bash
npx tsx scripts/eval/standalone-scan.ts --max 50
```

**Parallel scan (worker threads):**
```bash
npx tsx scripts/eval/standalone-scan.ts --concurrency 8
```

**Dry run:**
```bash
npx tsx scripts/eval/standalone-scan.ts --dry-run
```

> ⚠️ **Legacy:** `scripts/eval/scan-candidates.ts` (import engine.ts) is broken for CLI use —
> gunakan `standalone-scan.ts` sebagai ganti.

### 3. Manual Labeling

Open `labeled_v1.jsonl` and add `label`, `label_source`, `label_evidence`, `labeler`, and `labeled_at` fields to each entry.

**Label options:**
- `CONFIRMED_DECEPTIVE` — PR contains test manipulation
- `CONFIRMED_LEGIT` — PR is legitimate code change
- `AMBIGUOUS` — unsure after >5 min review (excluded from training)

See `eval/ground-truth/schema.json` for full field definitions.

### 4. Compute Confusion Matrix

```bash
npx tsx scripts/eval/confusion-matrix.ts
```

Outputs precision/recall/F1 per detector + verdict accuracy. Auto-saves report to `eval/ground-truth/reports/`.

## Detector Version Freeze

**Critical:** Before labeling, note the git hash:

```bash
git rev-parse HEAD   # current detector version
```

The `standalone-scan.ts` script automatically injects this hash into every entry.

If you update detectors mid-way through labeling:
1. Re-scan with `scan-candidates.ts`
2. Save as `labeled_v2.jsonl` (not v1)
3. Update version in the meta file

## Environment for Reproducibility

| Requirement | Value |
|-------------|-------|
| Node.js | v22.14.0 |
| Dependencies | `npm ls --depth=0` (run this and save output) |
| OS | Windows (win32) |
| Detector commit | Auto-injected by `standalone-scan.ts` |

## Data Files Structure

```
eval/ground-truth/
├── schema.json               ← Data format specification
├── raw_candidates.jsonl      ← Scraped GitHub PRs (before labeling)
├── labeled_v1.jsonl          ← Scanned + labeled data (versioned)
├── labeled_v1_meta.json      ← Metadata: dates, counts, version
├── ambiguous_excluded.jsonl  ← AMBIGUOUS entries (excluded from training)
└── reports/
    └── confusion-matrix-*.md ← Auto-generated reports
```

## Meta File Format (`labeled_v1_meta.json`)

```json
{
  "version": "v1",
  "created_at": "2026-07-02",
  "total_entries": 50,
  "deceptive_count": 15,
  "legit_count": 30,
  "ambiguous_count": 5,
  "detector_version_commit": "abc123def",
  "labeler": "your_name",
  "labeling_sessions": 3,
  "self_agreement_pct": 95,
  "notes": "PRELIMINARY — N < 100 per class, treat as directional"
}
```

## Tips

- **Label in sessions ≤ 2 hours** to avoid fatigue
- **Self-agreement check:** After 2 weeks, re-label random 10% and compare
- **Redact sensitive info** from `label_evidence` (emails, names, internal URLs)
- **Do not mix detector versions** in one file — snapshot if you update
