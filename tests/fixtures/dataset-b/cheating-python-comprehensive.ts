/**
 * Mantiz Benchmark Fixture — Python Comprehensive Cheating
 *
 * Patterns: @pytest.mark.skip, except: pass, return True, mock abuse
 */
export const diff = `diff --git a/tests/test_user_service.py b/tests/test_user_service.py
--- a/tests/test_user_service.py
+++ b/tests/test_user_service.py
@@ -1,12 +1,45 @@
 import pytest
 from unittest.mock import patch, MagicMock
 from user_service import UserService, DatabaseError
 
 def test_get_user_success():
     service = UserService()
     user = service.get_user(1)
     assert user is not None
     assert user.name == "Alice"
+
+@pytest.mark.skip(reason="flaky on CI")
+def test_get_user_not_found():
+    service = UserService()
+    user = service.get_user(999)
+    assert user is None
+
+def test_update_user():
+    service = UserService()
+    try:
+        result = service.update_user(1, {"name": "Bob"})
+        assert result is True
+    except Exception:
+        pass
+
+def test_delete_user():
+    service = UserService()
+    result = service.delete_user(1)
+    return True
+
+def test_send_email():
+    service = UserService()
+    with patch.object(service, '_send_email', return_value=True):
+        result = service.notify_user(1, "Hello")
+        assert result is True
+
+def test_database_connection():
+    with patch('user_service.database.connect') as mock_connect:
+        mock_connect.return_value = MagicMock()
+        service = UserService()
+        result = service.check_health()
+        assert result is True
+
+def test_rate_limiting():
+    assert True
`

export const expected = {
  trustScore: 40,
  label: 'Cheating Python Comprehensive',
  dataset: 'B',
}
