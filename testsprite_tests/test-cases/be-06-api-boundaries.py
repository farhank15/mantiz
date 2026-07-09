"""
Backend test: API Boundary & Validation Checks — Multi-file, Size Limits,
              Malformed Input, and Rate Limiting Headers

Verifies:
1. Multi-file diff parsing groups findings with their respective file names.
2. Diff size limits (payload > 500KB is rejected with HTTP 413).
3. Malformed/invalid JSON requests are rejected with HTTP 400.
4. Empty or whitespace-only diffs are rejected with HTTP 400.
5. Presence of standard rate limiting headers in the response headers.
"""
import requests

TARGET_URL = "https://mantiz-wine.vercel.app"

def test_multifile_diff_grouping():
    """
    Checks that findings from different files are parsed and matched to their
    respective file paths in the diff output.
    """
    payload = {
        "diff": """diff --git a/tests/auth.test.ts b/tests/auth.test.ts
--- a/tests/auth.test.ts
+++ b/tests/auth.test.ts
@@ -1,3 +1,4 @@
+test.skip("should auth", () => { expect(true).toBe(true) })
diff --git a/tests/db.test.py b/tests/db.test.py
--- a/tests/db.test.py
+++ b/tests/db.test.py
@@ -1,3 +1,6 @@
+def test_save():
+    try:
+        db.save({})
+    except Exception as e:
+        pass"""
    }
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    data = r.json()
    assert data.get("filesScanned") == 2, f"Expected 2 files scanned, got {data.get('filesScanned')}"
    findings = data.get("findings", [])
    
    # We should have findings for both files
    auth_findings = [f for f in findings if f.get("filePath") == "tests/auth.test.ts"]
    db_findings = [f for f in findings if f.get("filePath") == "tests/db.test.py"]
    
    assert len(auth_findings) > 0, "Expected findings in tests/auth.test.ts (disabled_assertion)"
    assert len(db_findings) > 0, "Expected findings in tests/db.test.py (silent_catch_and_pass)"

def test_diff_size_limit_rejection():
    """
    Verifies that requests with diff contents exceeding the 500KB limit
    are rejected with HTTP 413 Payload Too Large.
    """
    large_diff = "+" + "A" * 500001
    payload = {"diff": large_diff}
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 413, f"Expected 413 Payload Too Large, got {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "error" in data, "Expected error payload in 413 response"
    assert "exceeds maximum size" in data["error"].lower()

def test_malformed_json_rejected():
    """
    Verifies that invalid/malformed JSON strings are rejected with HTTP 400 Bad Request.
    """
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        data="{invalid_json_payload",
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 400, f"Expected 400 Bad Request, got {r.status_code}"
    data = r.json()
    assert "error" in data, "Expected error payload in 400 response"

def test_empty_diff_rejected():
    """
    Verifies that empty string or whitespace-only diffs are rejected with HTTP 400.
    """
    payload = {"diff": "   \n   "}
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    data = r.json()
    assert "error" in data, "Expected error payload in 400 response"
    assert "cannot be empty" in data["error"].lower() or "missing" in data["error"].lower()

def test_rate_limiting_headers_present():
    """
    Verifies that standard rate limiting headers (X-RateLimit-Limit, etc.)
    are present in the response headers.
    """
    payload = {"diff": "+const x = 1"}
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    headers = r.headers
    
    # Check rate limit keys ignoring case
    headers_lower = {k.lower(): v for k, v in headers.items()}
    assert "x-ratelimit-limit" in headers_lower, "Missing x-ratelimit-limit header"
    assert "x-ratelimit-remaining" in headers_lower, "Missing x-ratelimit-remaining header"
    assert "x-ratelimit-reset" in headers_lower, "Missing x-ratelimit-reset header"

# Run all tests
test_multifile_diff_grouping()
test_diff_size_limit_rejection()
test_malformed_json_rejected()
test_empty_diff_rejected()
test_rate_limiting_headers_present()
