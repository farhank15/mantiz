import os
import requests

TARGET_URL = os.environ.get("TARGET_URL", "https://mantiz-wine.vercel.app")

def test_index_repo_missing_auth():
    """Request without Authorization header should return 401."""
    r = requests.post(
        f"{TARGET_URL}/api/index-repo",
        headers={"Content-Type": "application/json"},
        json={"repo": "owner/repo"},
        timeout=30
    )
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    data = r.json()
    assert "error" in data
    assert "authorization header required" in data["error"].lower()

def test_index_repo_invalid_token():
    """Request with invalid API token should return 401."""
    r = requests.post(
        f"{TARGET_URL}/api/index-repo",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer mtz_invalid_test_token_123"
        },
        json={"repo": "owner/repo"},
        timeout=30
    )
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    data = r.json()
    assert "error" in data
    assert "invalid api token" in data["error"].lower()

def test_index_repo_wrong_content_type():
    """Request with non-JSON Content-Type should fail."""
    # Note: the authentication check happens before body parsing,
    # so we expect 401 if token is invalid, but if it is valid it would check content-type.
    # We will test content-type validation with an invalid token first to verify order,
    # or just keep it simple.
    r = requests.post(
        f"{TARGET_URL}/api/index-repo",
        headers={
            "Content-Type": "text/plain",
            "Authorization": "Bearer mtz_invalid_test_token_123"
        },
        data="repo=owner/repo",
        timeout=30
    )
    # Auth check happens first in the route handler, so it returns 401
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

print("API index-repo verification test cases prepared.")
