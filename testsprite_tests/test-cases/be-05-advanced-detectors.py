"""
Backend test: Advanced Detector Checks — Assertion Tampering, Hallucinated Assertions,
                Share Link API, and Multi-Pattern Scanning

Verifies that the Mantiz /api/scan production endpoint correctly detects:
1. Assertion tampering (expected value changed without source change) → score drops < 70
2. Hallucinated/non-existent assertion matchers → flagged as hallucinated_assertion
3. Combination of disabled assertion + silent catch → score drops significantly
4. /api/share/:id returns 404 for non-existent share IDs (not 500 server error)
5. Large diff with multiple patterns returns multiple finding types
"""
import requests

TARGET_URL = "https://mantiz-wine.vercel.app"

def test_assertion_tampering_detected():
    """
    D2 detector: When expected value changes (4→999) without source logic change,
    scanner must flag assertion_tampering and drop trust score below 70.
    """
    payload = {
        "diff": """diff --git a/tests/calc.test.ts b/tests/calc.test.ts
--- a/tests/calc.test.ts
+++ b/tests/calc.test.ts
@@ -1,5 +1,5 @@
-  expect(add(2,2)).toBe(4)
+  expect(add(2,2)).toBe(999)"""
    }
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    data = r.json()
    trust_score = data.get("trustScore", 100)
    findings = data.get("findings", [])
    tamper_findings = [f for f in findings if f.get("patternType") == "assertion_tampering"]
    assert len(tamper_findings) > 0, (
        f"Expected assertion_tampering finding, got: {[f.get('patternType') for f in findings]}"
    )
    assert trust_score < 70, (
        f"Expected trustScore < 70 for assertion tampering, got {trust_score}"
    )

def test_hallucinated_assertion_detected():
    """
    D6 detector: Non-existent matchers like toBeDefinitelyTruthy() or toExistInDatabase()
    are not in the valid Vitest/Jest matcher whitelist — must be flagged as hallucinated_assertion.
    """
    payload = {
        "diff": """diff --git a/tests/api.test.ts b/tests/api.test.ts
--- a/tests/api.test.ts
+++ b/tests/api.test.ts
@@ -1,3 +1,5 @@
+import { expect, test } from 'vitest'
+test('data exists', () => {
+  expect(result).toBeDefinitelyTruthy()
+  expect(data).toExistInDatabase()
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
    hallucinated = [f for f in findings if f.get("patternType") == "hallucinated_assertion"]
    assert len(hallucinated) > 0, (
        f"Expected hallucinated_assertion findings for fake matchers, got: "
        f"{[f.get('patternType') for f in findings]}"
    )

def test_combined_patterns_lower_score_significantly():
    """
    Multiple high-confidence findings (disabled assertion + mock + silent catch)
    must drive trustScore well below 50 (LIKELY_DECEPTIVE verdict).
    """
    payload = {
        "diff": """diff --git a/tests/payment.test.ts b/tests/payment.test.ts
--- a/tests/payment.test.ts
+++ b/tests/payment.test.ts
@@ -1,5 +1,12 @@
+import { vi, describe, it, expect } from 'vitest'
+vi.mock('./payment-processor')
+describe.skip('payment processing', () => {
+  it('should charge card', () => {
+    try {
+      const result = processPayment(card)
+    } catch(e) {}
+    expect(true).toBe(true)
+  })
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
    trust_score = data.get("trustScore", 100)
    findings = data.get("findings", [])
    assert len(findings) >= 2, (
        f"Expected >= 2 findings for multi-pattern diff, got {len(findings)}: "
        f"{[f.get('patternType') for f in findings]}"
    )
    assert trust_score < 60, (
        f"Expected trustScore < 60 for combined cheating patterns, got {trust_score}"
    )

def test_share_invalid_id_returns_404():
    """
    /api/share/:id should return 404 for a non-existent share ID,
    not 500 (server crash). This validates error handling in the share endpoint.
    """
    r = requests.get(
        f"{TARGET_URL}/api/share/00000000-0000-0000-0000-000000000000",
        timeout=30,
    )
    assert r.status_code == 404, (
        f"Expected 404 for non-existent share ID, got {r.status_code}: {r.text[:200]}"
    )

def test_scan_verdict_field_present():
    """
    /api/scan response must include a 'verdict' field with label, confidence, and reason.
    This is consumed by the dashboard and CLI to display human-readable output.
    """
    payload = {"diff": "+const x = 1"}
    r = requests.post(
        f"{TARGET_URL}/api/scan",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
    data = r.json()
    verdict = data.get("verdict")
    assert verdict is not None, f"Expected 'verdict' field in response, got: {list(data.keys())}"
    assert "label" in verdict, f"verdict missing 'label': {verdict}"
    assert verdict["label"] in ("CLEAN", "SUSPICIOUS", "LIKELY_DECEPTIVE"), (
        f"verdict.label must be one of CLEAN/SUSPICIOUS/LIKELY_DECEPTIVE, got: {verdict['label']}"
    )

def test_scan_fixinstructions_present_when_cheating():
    """
    When trustScore < 80, /api/scan must include fixInstructions array.
    This helps developers understand how to fix the detected cheating patterns.
    """
    payload = {
        "diff": """diff --git a/tests/foo.test.ts b/tests/foo.test.ts
+++ b/tests/foo.test.ts
@@ -1,3 +1,4 @@
+it.skip('should work', () => {
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
    trust_score = data.get("trustScore", 100)
    fix_instructions = data.get("fixInstructions", [])
    if trust_score < 80:
        assert len(fix_instructions) > 0, (
            f"Expected fixInstructions when trustScore={trust_score} < 80, got empty array. "
            f"Response: {data}"
        )

# Run all tests
test_assertion_tampering_detected()
test_hallucinated_assertion_detected()
test_combined_patterns_lower_score_significantly()
test_share_invalid_id_returns_404()
test_scan_verdict_field_present()
test_scan_fixinstructions_present_when_cheating()
