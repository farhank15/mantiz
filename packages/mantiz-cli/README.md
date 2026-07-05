# mantiz-cli

**Mantiz CLI — AI lie detector for coding agents.**

Scan git diffs for AI agent cheating patterns — no server or API key needed for local scans.

## Installation

```bash
pnpm add -g mantiz-cli
```

Or run without installation:

```bash
npx mantiz-cli
```

## Usage

```bash
# Scan your current git diff
mantiz-scan

# Scan with AI-assisted detection
mantiz-scan --ai

# Scan with JSON output (for CI)
mantiz-scan --json

# Scan a specific diff text
mantiz-scan --diff "$(cat my-diff.diff)"

# Scan from stdin
cat my-diff.diff | mantiz-scan --diff -

# Auto-fix detected issues
mantiz-scan --fix

# Interactive fix mode (review each fix before applying)
mantiz-scan --fix=interactive

# Cloud scan with history persistence
mantiz-scan --token mtz_abc123 --save

# Cloud scan with AI + save
mantiz-scan --token mtz_abc123 --ai --save

# Help
mantiz-scan --help
```

## 100% Local — No Server Required (Default)

All detectors run entirely on your machine with zero dependencies:

| Detector | What It Catches |
|:---------|:----------------|
| D1 Disabled Assertion | `.skip()`, `if(false)`, commented assertions |
| D2 Assertion Tampering | Changed expected values without source fix |
| D3 Mock-to-Avoid | Excessive mocking to bypass real errors |
| D4 Claim-Diff Mismatch | Commit msg doesn't match actual changes |
| D5 Silent Catch | Empty catch blocks that swallow errors |
| D6 Hallucinated Assertion | Unknown/non-existent assertion matchers |
| D10 Mutation Susceptibility | Fragile tests with low assertion density |

**Multi-language support:** Python, Go, Java, Ruby, Rust, PHP — in addition to JS/TS.

No API key, no internet connection, no database needed for local mode. Set `--token` and `--save` to persist results to the cloud.

## Auto-Fix (`--fix`)

Mantiz can auto-generate code patches for detected issues:

| Pattern | Auto-Fix |
|:---------|:---------|
| **Disabled Assertion** | Re-enables `.skip()`, removes `if(false)`, removes `@pytest.mark.skip` |
| **Assertion Tampering** | Flags the tampered value with a fix comment |
| **Silent Catch** | Wraps empty catch body with `console.error` / logging |
| **Mock-to-Avoid** | Adds comment suggesting real integration test |

```bash
mantiz-scan --fix           # Auto-apply all safe fixes
mantiz-scan --fix=interactive # Review each fix before applying
```

## CI/CD Integration

```yaml
name: Mantiz Scan
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx mantiz-cli
```

Or use the reusable action with cloud persistence:

```yaml
- name: Run Mantiz Scan
  uses: farhank15/mantiz@main
  with:
    api-token: ${{ secrets.MANTIZ_API_TOKEN }}
    threshold: 70
```

## Exit Codes

- `0` — All clean (Trust Score ≥ 70)
- `1` — Cheating detected (Trust Score < 70)

## Precision / Recall

Empirically validated against **203 unique pull requests** (20 DECEPTIVE, 183 LEGIT):

| Detector | Precision | Recall | F1 |
|:---------|:---------:|:------:|:--:|
| D6 HallucinatedAssertion | 77.8% | 70.0% | 73.7 |
| D2 AssertionTampering | 100% | 15.0% | 26.1 |
| D3 MockToAvoid | 100% | 5.0% | 9.5 |
| D1 DisabledAssertion | 45.5% | 25.0% | 32.3 |
| D5 SilentCatch | 33.3% | 10.0% | 15.4 |
| D10 MutationSusceptibility | 30.0% | 60.0% | 40.0 |
| D4 ClaimDiffMismatch | 0.0% | 0.0% | 0.0 |

**Verdict Accuracy: 97.0%** (preliminary, N=20 DECEPTIVE — confidence interval ±15-25%)
