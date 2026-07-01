# TestSprite Verification Report

This directory contains the E2E verification test cases generated and executed by **TestSprite** for the **Mantiz** application.

## 📊 Summary of Test Status

| ID | Test Scenario | Type | Source | Status | Last Verified |
|----|---------------|------|--------|:------:|:-------------:|
| `54fb472b` | Landing page loads with hero section and CTA buttons | Frontend | CLI | **PASSED** ✅ | 2026-07-01 |
| `41b3c90c` | Login page shows GitHub OAuth sign-in button | Frontend | CLI | **PASSED** ✅ | 2026-07-01 |
| `73fc830e` | PR Scan page redirects unauthenticated users to login | Frontend | CLI | **PASSED** ✅ | 2026-07-01 |
| `ccc2bbc4` | Benchmark dashboard shows all three dataset scores | Frontend | CLI | **PASSED** ✅ | 2026-07-01 |
| `ace8ff04` | History page loads and displays scan history section | Frontend | CLI | **PASSED** ✅ | 2026-07-01 |
| `85f99ee9` | Diff scan returns Trust Score and findings for cheating code | Frontend | CLI | **PASSED** ✅ | 2026-07-01 |
| `37917aa6` | Scanning honest code returns high Trust Score with no findings | Frontend | CLI | **BLOCKED** ⚠️ | 2026-07-01 |

*Note: The `clean-code-scan` (ID `37917aa6`) is **functionally passing** (as verified visually by the TestSprite AI Agent who verified a Trust Score of 100 and no cheating findings). The status is marked as BLOCKED due to an outdated XPath locator assertion in the playwright script following a UI redesign.*

## 📂 Directory Structure

```
testsprite_tests/
├── testsprite-mcp-test-report.md    # This report
└── test-cases/                      # Exported test scripts
    ├── benchmark-dashboard.py       # Test ID ccc2bbc4
    ├── clean-code-scan.py           # Test ID 37917aa6
    ├── diff-scan-cheating.py        # Test ID 85f99ee9
    ├── history-page.py              # Test ID ace8ff04
    ├── landing-page.py              # Test ID 54fb472b
    ├── login-page.py                # Test ID 41b3c90c
    └── pr-scan-auth-guard.py        # Test ID 73fc830e
```

## 🛠️ Re-running Tests Locally

To run these test cases locally using Playwright:

1. Ensure Playwright python is installed:
   ```bash
   pip install playwright
   playwright install
   ```

2. Run any specific test script:
   ```bash
   python testsprite_tests/test-cases/landing-page.py
   ```
