import os
import requests

TARGET_URL = os.environ.get("TARGET_URL", "https://mantiz-wine.vercel.app")

def test_get_shared_scan_valid_id():
    """GET /api/share/:id should return 200 and scan details for a valid ID."""
    valid_id = "YdwVtCJD"
    r = requests.get(f"{TARGET_URL}/api/share/{valid_id}", timeout=30)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
    
    data = r.json()
    assert data["id"] == valid_id, f"Expected id to be {valid_id}, got {data.get('id')}"
    assert "scanData" in data, "No scanData in response"
    assert "sourceType" in data, "No sourceType in response"
    assert "createdAt" in data, "No createdAt in response"
    
    scan_data = data["scanData"]
    assert "trustScore" in scan_data, "No trustScore in scanData"
    assert "findings" in scan_data, "No findings in scanData"

def test_get_shared_scan_invalid_id():
    """GET /api/share/:id should return 404 for a non-existent ID."""
    invalid_id = "nonexistent_id_123_abc"
    r = requests.get(f"{TARGET_URL}/api/share/{invalid_id}", timeout=30)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text[:200]}"
    
    data = r.json()
    assert "error" in data, "Expected error key in 404 response"
    assert "not found" in data["error"].lower() or "expired" in data["error"].lower()

def test_get_shared_scan_id_too_long():
    """GET /api/share/:id should return 400 if the ID exceeds MAX_ID_LENGTH (64 chars)."""
    long_id = "a" * 65
    r = requests.get(f"{TARGET_URL}/api/share/{long_id}", timeout=30)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:200]}"
    
    data = r.json()
    assert "error" in data, "Expected error key in 400 response"
    assert "invalid share url" in data["error"].lower()

# Run all tests
test_get_shared_scan_valid_id()
test_get_shared_scan_invalid_id()
test_get_shared_scan_id_too_long()
print("All api-share backend tests passed successfully!")
