# mantiz-cli

**Mantiz CLI — AI lie detector for coding agents.**

Scan git diffs for AI agent cheating patterns — no server or API key needed.

## Installation

```bash
npm install -g mantiz-cli
```

Or run without installation:

```bash
npx mantiz-cli
```

## Usage

```bash
# Scan your current git diff
mantiz-scan

# Scan with JSON output (for CI)
mantiz-scan --json

# Scan a specific diff text
mantiz-scan --diff "$(cat my-diff.diff)"

# Scan diff from stdin
cat my-diff.diff | mantiz-scan --diff -

# Help
mantiz-scan --help
```

## 100% Local — No Server Required

All detectors run entirely on your machine:
- **D1** Disabled Assertion Detection
- **D2** Assertion Tampering Detection
- **D3** Mock-to-Avoid Detection
- **D4** Claim-Diff Mismatch Detection
- **D5** Silent Catch Detection
- **D6** Hallucinated Assertion Detection
- **D10** Mutation Susceptibility Analysis

No API key, no internet connection, no database needed. Results are purely local.

## CI/CD Integration

```yaml
# .github/workflows/mantiz.yml
name: Mantiz Scan
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx mantiz-cli
```

## Exit Codes

- `0` — All clean (Trust Score ≥ 70)
- `1` — Cheating detected (Trust Score < 70)

## Precision / Recall

Mantiz has been empirically validated against 135 labeled pull requests:

| Detector | Precision | Recall | F1 |
|:---------|:---------:|:------:|:--:|
| D6 HallucinatedAssertion | 73.7% | 82.4% | 77.8 |
| D1 DisabledAssertion | 62.5% | 29.4% | 40.0 |
| D5 SilentCatch | 40.0% | 11.8% | 18.2 |
| D10 MutationSusceptibility | 34.5% | 58.8% | 43.5 |
| D2 AssertionTampering | 100% | 11.8% | 21.1 |
| D3 MockToAvoid | 100% | 5.9% | 11.1 |

**Verdict Accuracy: 89.9%** (preliminary, N=17 DECEPTIVE)

## Features

- **Local scan** — zero external dependencies
- **--json** — output results as JSON for CI/CD pipelines
- **--diff** — scan specific diff text instead of git diff
- **Threshold** — default 70, configurable per scan
