"""
Backend test: /api/scan accepts Authorization: Bearer header
Bug fix verified: previously the API only read token from body.token,
now it also falls back to Authorization: Bearer <token> header.
"""
import requests

TARGET_URL = "https://mantiz-wine.vercel.app"

def test_scan_anonymous_returns_json():
    """Anonymous scan (no token) should return JSON with trustScore + findings."""
    payload = {
        "diff": """+++ b/test/auth.test.ts
+if (true) {
+  test.skip('should validate token', () => {
+    expect(auth.validate('')).toBe(false)
+  })
+}"""
    }
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "trustScore" in data, f"No trustScore in response: {data}"
    assert isinstance(data["trustScore"], (int, float)), "trustScore must be numeric"
    assert "findings" in data, "No findings key in response"
    assert "totalFindings" in data, "No totalFindings in response"

def test_scan_authorization_bearer_header():
    """
    Fix: API should accept token via Authorization: Bearer header,
    not only via body.token. An invalid token should return 401
    (proves the header IS being read, not silently ignored).
    """
    payload = {"diff": "+const x = 1"}
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer mtz_invalid_test_token_xyz123",
        },
        timeout=30,
    )
    assert r.status_code == 401, (
        f"Expected 401 for invalid Bearer token, got {r.status_code}: {r.text[:200]}"
    )
    data = r.json()
    assert "error" in data, "Expected error field in 401 response"

def test_scan_missing_diff_returns_400():
    """Empty body without diff should return 400 with helpful error."""
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json={},
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    data = r.json()
    assert "error" in data

def test_scan_empty_diff_returns_400():
    """Empty string diff should return 400."""
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json={"diff": "   "},
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 400, f"Expected 400 for empty diff, got {r.status_code}"

def test_scan_wrong_content_type_returns_415():
    """Non-JSON content type should return 415."""
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        data="diff=hello",
        headers={"Content-Type": "text/plain"},
        timeout=30,
    )
    assert r.status_code == 415, f"Expected 415, got {r.status_code}"

def test_scan_x_mantiz_source_header_accepted():
    """
    Source tracking: /api/scan accepts X-Mantiz-Source header.
    CLI sends 'CLI' and GH Actions sends 'GitHub Action'.
    API should not reject requests with this header.
    """
    payload = {"diff": "+const ok = true"}
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={
            "Content-Type": "application/json",
            "X-Mantiz-Source": "CLI",
        },
        timeout=30,
    )
    assert r.status_code == 200, (
        f"Expected 200 when X-Mantiz-Source: CLI sent, got {r.status_code}: {r.text[:200]}"
    )
    data = r.json()
    assert "trustScore" in data

def test_scan_detects_todo():
    """Scan containing .todo() should return a finding of type disabled_assertion and pattern todo."""
    payload = {
        "diff": """diff --git a/tests/auth.test.ts b/tests/auth.test.ts
--- a/tests/auth.test.ts
+++ b/tests/auth.test.ts
@@ -1,4 +1,4 @@
+test.todo('should validate token', () => {
+  expect(auth.validate('')).toBe(false)
+})"""
    }
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
    data = r.json()
    findings = data.get("findings", [])
    todo_findings = [
        f for f in findings
        if f.get("patternType") == "disabled_assertion"
        and ("todo" in f.get("explanation", "").lower() or "todo" in f.get("patternType", "").lower())
    ]
    assert len(todo_findings) > 0, f"Expected to find a .todo() disabled_assertion, findings: {findings}"

# Run all tests
test_scan_anonymous_returns_json()
test_scan_authorization_bearer_header()
test_scan_missing_diff_returns_400()
test_scan_empty_diff_returns_400()
test_scan_wrong_content_type_returns_415()
test_scan_x_mantiz_source_header_accepted()
test_scan_detects_todo()
