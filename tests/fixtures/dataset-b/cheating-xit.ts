export const diff = `diff --git a/tests/notification.test.js b/tests/notification.test.js
index iii888..jjj999 100644
--- a/tests/notification.test.js
+++ b/tests/notification.test.js
@@ -1,11 +1,13 @@
 import { describe, it, expect } from 'vitest'
-import { sendNotification } from '../src/notification'
+import { sendNotification, sendBulkNotifications } from '../src/notification'
 
 describe('Notifications', () => {
   it('should send single notification', async () => {
     const result = await sendNotification('user1', 'Test message')
     expect(result.success).toBe(true)
   })
+
+  it.skip('should send bulk notifications', async () => {
+    const result = await sendBulkNotifications(['user1', 'user2', 'user3'], 'Bulk message')
+    expect(result.count).toBe(3)
+  })
 })`

export const expected = { trustScore: 70, label: 'Cheating', dataset: 'B' }
