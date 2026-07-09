"""
Backend test: Org Dashboard Feature — BE API Regression & Evasion Bypass Checks
Test ID: 73a111c6-7b03-47f7-a6b8-39ebcbb2a666

Verifies:
1. /api/scan still works after webhook refactor for org installs (regression)
2. vi.doMock() detected as mock_to_avoid_failure (new evasion bypass fix)
3. /api/index-repo POST requires auth — returns 401 without valid session
4. Webhook rejects requests with invalid GitHub signature
5. Python except Exception as e: pass detected as silent_catch_and_pass
"""
import requests

TARGET_URL = "https://mantiz-wine.vercel.app"

def test_scan_still_works_after_webhook_refactor():
    """
    Regression: After refactoring webhook save logic to support org installs,
    /api/scan should still return valid JSON with trustScore for anonymous scan.
    """
    payload = {
        "diff": """+++ b/tests/api.test.ts
+vi.mock('./database')
+test('should return 200', () => {
+  expect(true).toBe(true)
+})"""
    }
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    data = r.json()
    assert "trustScore" in data, f"No trustScore in response: {data}"
    assert isinstance(data["trustScore"], (int, float)), "trustScore must be numeric"
    assert "findings" in data, "No findings in response"

def test_scan_detects_domock_evasion():
    """
    New fix (Iteration 61): vi.doMock() is a dynamic mocking function that bypasses
    module hoisting. It was previously undetected — now it must be flagged as mock_to_avoid_failure.
    """
    payload = {
        "diff": """diff --git a/tests/auth.test.ts b/tests/auth.test.ts
--- a/tests/auth.test.ts
+++ b/tests/auth.test.ts
@@ -1,3 +1,5 @@
+import { vi, test, expect } from 'vitest'
+vi.doMock('./database', () => ({ db: { query: vi.fn() } }))
+test('auth works', () => {
+  expect(true).toBe(true)
+})"""
    }
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    data = r.json()
    findings = data.get("findings", [])
    mock_findings = [f for f in findings if f.get("patternType") == "mock_to_avoid_failure"]
    assert len(mock_findings) > 0, (
        f"Expected vi.doMock() to be flagged as mock_to_avoid_failure, "
        f"but got findings: {[f.get('patternType') for f in findings]}"
    )

def test_index_repo_api_requires_auth():
    """
    /api/index-repo POST should return 401 for unauthenticated requests.
    Org scans must not allow arbitrary repo indexing without valid session.
    """
    r = requests.post(
        f"{TARGET_URL}/api/index-repo",
        json={"repoFullName": "test/repo"},
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 401, (
        f"Expected 401 for unauthenticated /api/index-repo, got {r.status_code}: {r.text[:200]}"
    )

def test_webhook_endpoint_rejects_invalid_signature():
    """
    Security: GitHub webhook endpoint must reject requests with invalid signature.
    Prevents spoofed org PR webhook events from poisoning dashboard history.
    """
    fake_payload = '{"action":"opened","pull_request":{"number":1}}'
    r = requests.post(
        f"{TARGET_URL}/api/github/webhook",
        data=fake_payload,
        headers={
            "Content-Type": "application/json",
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": "sha256=invalidsignature000",
        },
        timeout=30,
    )
    assert r.status_code in (400, 401, 403), (
        f"Expected 400/401/403 for invalid webhook signature, got {r.status_code}: {r.text[:200]}"
    )

def test_scan_detects_python_except_alias():
    """
    Regression (Iteration 59): except Exception as e: pass must be detected
    as silent_catch_and_pass. Previously the regex missed exception aliases.
    """
    payload = {
        "diff": """diff --git a/tests/math_test.py b/tests/math_test.py
--- a/tests/math_test.py
+++ b/tests/math_test.py
@@ -1,4 +1,7 @@
+def test_divide():
+    try:
+        result = 10 / 0
+    except Exception as e:
+        pass
+    assert True"""
    }
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    data = r.json()
    findings = data.get("findings", [])
    silent_catch = [f for f in findings if f.get("patternType") == "silent_catch_and_pass"]
    assert len(silent_catch) > 0, (
        f"Expected 'except Exception as e: pass' to be flagged as silent_catch_and_pass, "
        f"findings: {[f.get('patternType') for f in findings]}"
    )

def test_scan_org_install_regression_clean_diff():
    """
    Regression: After org dashboard refactor, clean diffs should still return
    a high trust score (>=80) with no findings. Ensures the refactor didn't
    accidentally break the scoring pipeline.
    """
    payload = {
        "diff": """diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,7 @@
+export function formatDate(date: Date): string {
+  return date.toISOString().split('T')[0]
+}"""
    }
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    data = r.json()
    assert data.get("trustScore", 0) >= 80, (
        f"Expected trustScore >= 80 for clean diff after refactor, got {data.get('trustScore')}"
    )

# Run all tests
test_scan_still_works_after_webhook_refactor()
test_scan_detects_domock_evasion()
test_index_repo_api_requires_auth()
test_webhook_endpoint_rejects_invalid_signature()
test_scan_detects_python_except_alias()
test_scan_org_install_regression_clean_diff()
