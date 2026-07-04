import os
import requests

TARGET_URL = os.environ.get("TARGET_URL", "https://mantiz-wine.vercel.app")

def test_rate_limiter():
    """Verify that the rate limiter blocks requests and returns 429 when limits are exceeded."""
    valid_id = "YdwVtCJD"
    url = f"{TARGET_URL}/api/share/{valid_id}"
    
    # We will make up to 15 requests until we hit a 429.
    # We append a unique query parameter to bypass Vercel Edge caching.
    print("Starting rate limit verification...")
    
    hit_429 = False
    
    for i in range(15):
        url_with_param = f"{url}?bypass_cache={i}"
        r = requests.get(url_with_param, timeout=10)
        status = r.status_code
        print(f"Request {i+1}: Status {status}")
        
        if i == 0:
            assert status == 200, f"First request should succeed, got {status}: {r.text[:200]}"
            
        if status == 429:
            hit_429 = True
            # Verify rate limit headers on block
            assert "X-RateLimit-Limit" in r.headers, "X-RateLimit-Limit header missing"
            assert "X-RateLimit-Remaining" in r.headers, "X-RateLimit-Remaining header missing"
            assert r.headers["X-RateLimit-Remaining"] == "0", "X-RateLimit-Remaining should be 0 when blocked"
            data = r.json()
            assert "error" in data
            assert "rate limit exceeded" in data["error"].lower()
            # If we hit 429, the next one should also be blocked
            url_next = f"{url}?bypass_cache={i+1}"
            r_next = requests.get(url_next, timeout=10)
            assert r_next.status_code == 429, f"Subsequent request after block should also be 429, got {r_next.status_code}"
            print("Successfully verified rate limit block on consecutive requests!")
            break
            
    assert hit_429, "Rate limiter did not block requests after 15 attempts!"
    print("Rate limiter test passed successfully!")

test_rate_limiter()
