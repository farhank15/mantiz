"""
Backend test: Mock Login & Session Injection Validation

Verifies the E2E testing auth bypass endpoint (/api/mock-login) at the HTTP layer:
1. Valid secret: Returns 307 redirect to /pr-scan, sets HttpOnly mantiz_session cookie with Lax SameSite.
2. Invalid secret: Returns 307 redirect to /login with error query parameter, sets no cookies.
3. No secret: Returns 307 redirect to /login, sets no cookies.
"""
import requests

TARGET_URL = "https://mantiz-wine.vercel.app"

def test_mock_login_valid_secret():
    """
    HTTP-level validation: Passing the correct secret should result in a 307 redirect
    to /pr-scan and a 'Set-Cookie' header specifying the HttpOnly session cookie.
    """
    url = f"{TARGET_URL}/api/mock-login?secret=mantiz_e2e_bypass_2026"
    r = requests.get(url, allow_redirects=False, timeout=30)
    
    assert r.status_code == 307, f"Expected 307 Redirect, got {r.status_code}"
    
    # Check redirect location
    headers_lower = {k.lower(): v for k, v in r.headers.items()}
    assert "location" in headers_lower, "Missing Location header on redirect"
    assert headers_lower["location"] == "/pr-scan"
    
    # Check session cookie injection
    assert "set-cookie" in headers_lower, "Missing Set-Cookie header"
    cookie_str = headers_lower["set-cookie"]
    assert "mantiz_session=" in cookie_str, "mantiz_session cookie not found"
    assert "httponly" in cookie_str.lower(), "Session cookie must be HttpOnly"
    assert "samesite=lax" in cookie_str.lower(), "Session cookie must have SameSite=Lax"

def test_mock_login_invalid_secret():
    """
    Security check: Passing an invalid secret must not inject a session cookie,
    and must redirect to /login?error=UnauthorizedMock.
    """
    url = f"{TARGET_URL}/api/mock-login?secret=incorrect_secret_attempt"
    r = requests.get(url, allow_redirects=False, timeout=30)
    
    assert r.status_code == 307, f"Expected 307 Redirect, got {r.status_code}"
    
    # Check redirect location
    headers_lower = {k.lower(): v for k, v in r.headers.items()}
    assert "location" in headers_lower, "Missing Location header on redirect"
    assert "/login" in headers_lower["location"]
    assert "error=UnauthorizedMock" in headers_lower["location"]
    
    # Verify NO session cookie is injected
    assert "set-cookie" not in headers_lower, "Should not inject cookies on unauthorized attempt"

def test_mock_login_missing_secret():
    """
    Security check: Passing no secret parameter must redirect to login with no session cookies.
    """
    url = f"{TARGET_URL}/api/mock-login"
    r = requests.get(url, allow_redirects=False, timeout=30)
    
    assert r.status_code == 307, f"Expected 307 Redirect, got {r.status_code}"
    
    # Check redirect location
    headers_lower = {k.lower(): v for k, v in r.headers.items()}
    assert "location" in headers_lower, "Missing Location header on redirect"
    assert "/login" in headers_lower["location"]
    
    # Verify NO session cookie is injected
    assert "set-cookie" not in headers_lower, "Should not inject cookies when secret is missing"

# Run all tests
test_mock_login_valid_secret()
test_mock_login_invalid_secret()
test_mock_login_missing_secret()
