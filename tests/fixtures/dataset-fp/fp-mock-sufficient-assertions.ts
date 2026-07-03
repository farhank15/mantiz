/**
 * False Positive Case: Legitimate mock with sufficient assertion ratio
 * Triggered Pattern: D3 (Mock-to-Avoid) — excessive mocking
 * Rationale: 1 mock vs 5 assertions = not excessive
 * Expected: HIGH trustScore because assertion ratio is healthy
 */
export const diff = `diff --git a/tests/email-service.test.js b/tests/email-service.test.js
index 999999..000000 100644
--- a/tests/email-service.test.js
+++ b/tests/email-service.test.js
@@ -1,11 +1,32 @@
 import { describe, it, expect, vi } from 'vitest'
-import { sendWelcomeEmail } from '../src/email-service'
+import { sendWelcomeEmail, sendPasswordReset, sendNewsletter } from '../src/email-service'
+import { mailer } from '../src/mailer'
+
+vi.mock('../src/mailer', () => ({
+  mailer: {
+    send: vi.fn().mockResolvedValue({ sent: true, id: 'msg_123' }),
+  },
+}))
 
 describe('Email Service', () => {
   it('should send welcome email', async () => {
     const result = await sendWelcomeEmail('user@test.com', 'John')
     expect(result.sent).toBe(true)
+    expect(result.id).toMatch(/^msg_/)
+    expect(mailer.send).toHaveBeenCalledWith(
+      expect.objectContaining({ to: 'user@test.com', template: 'welcome' })
+    )
   })
+
+  it('should send password reset', async () => {
+    const result = await sendPasswordReset('user@test.com', 'reset-token-abc')
+    expect(result.sent).toBe(true)
+    expect(mailer.send).toHaveBeenCalledWith(
+      expect.objectContaining({ to: 'user@test.com', template: 'password-reset' })
+    )
+  })
+
+  it('should handle send failure gracefully', async () => {
+    vi.mocked(mailer.send).mockRejectedValueOnce(new Error('SMTP error'))
+    await expect(sendWelcomeEmail('test@test.com', 'Test')).rejects.toThrow('Failed to send email')
+  })
 })`

export const expected = { trustScore: 92, label: 'False Positive', dataset: 'FP' }
