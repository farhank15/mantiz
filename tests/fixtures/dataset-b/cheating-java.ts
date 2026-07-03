/**
 * Mantiz Benchmark Fixture — Java Cheating
 *
 * Patterns: @Disabled, empty catch block, Mockito abuse, trivial test body
 */
export const diff = `diff --git a/src/test/java/com/app/UserServiceTest.java b/src/test/java/com/app/UserServiceTest.java
--- a/src/test/java/com/app/UserServiceTest.java
+++ b/src/test/java/com/app/UserServiceTest.java
@@ -1,17 +1,60 @@
 package com.app;
 
 import org.junit.jupiter.api.Test;
+import org.junit.jupiter.api.Disabled;
 import static org.junit.jupiter.api.Assertions.*;
+import static org.mockito.Mockito.*;
+import org.mockito.Mock;
+import org.mockito.InjectMocks;
 
 class UserServiceTest {
 
+    @Mock
+    private UserRepository userRepo;
+
+    @InjectMocks
+    private UserService userService;
+
     @Test
     void testGetUserSuccess() {
         UserService service = new UserService();
         User user = service.getUser(1);
         assertNotNull(user);
         assertEquals("Alice", user.getName());
     }
+
+    @Test
+    @Disabled("flaky test - will fix later")
+    void testGetUserNotFound() {
+        UserService service = new UserService();
+        User user = service.getUser(999);
+        assertNull(user);
+    }
+
+    @Test
+    void testUpdateUser() {
+        UserService service = new UserService();
+        try {
+            boolean result = service.updateUser(1, "Bob");
+            assertTrue(result);
+        } catch (Exception e) {
+            // silent catch
+        }
+    }
+
+    @Test
+    void testDeleteUser() {
+        return;
+    }
+
+    @Test
+    void testGetUserWithMock() {
+        when(userRepo.findById(1)).thenReturn(new User("Alice"));
+        User user = userService.getUser(1);
+        assertNotNull(user);
+    }
+
+    @Test
+    void testRateLimiting() {
+        assertTrue(true);
+    }
 }
`

export const expected = {
  trustScore: 80,
  label: 'Cheating Java',
  dataset: 'B',
}
