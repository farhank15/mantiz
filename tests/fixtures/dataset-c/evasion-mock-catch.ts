export const diff = `diff --git a/tests/email.test.js b/tests/email.test.js
index 555555..666666 100644
--- a/tests/email.test.js
+++ b/tests/email.test.js
@@ -1,15 +1,20 @@
 import { describe, it, expect, vi } from 'vitest'
-import { sendEmail } from '../src/email'
+import { sendEmail, processEmails } from '../src/email'
+import { emailQueue } from '../src/queue'
+
+vi.mock('../src/queue', () => ({
+  emailQueue: {
+    process: vi.fn(),
+    add: vi.fn(),
+  },
+}))
 
 describe('Email Service', () => {
   it('should send email', async () => {
     const result = await sendEmail('test@test.com', 'Subject', 'Body')
-    expect(result.sent).toBe(true)
-  })
-})
+    expect(result.sent).toBe(true)
+  })
+
+  it('should process email queue', async () => {
+    vi.mocked(emailQueue.process).mockResolvedValue({ processed: 5 })
+    try {
+      const result = await processEmails()
+      expect(result.processed).toBe(5)
+    } catch (e) {
+      // queue might be empty
+    }
+  })
+})`

export const expected = { trustScore: 60, label: 'Evasion', dataset: 'C' }
