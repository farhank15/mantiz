/**
 * False Positive Case: Legitimate `test.todo` for planned feature
 * Triggered Pattern: D1 (Disabled Assertion) — todo pattern
 * Rationale: test.todo is a standard Jest/Vitest feature for planned tests
 * Expected: HIGH trustScore because test.todo is legit usage
 */
export const diff = `diff --git a/tests/planned/roadmap.test.js b/tests/planned/roadmap.test.js
index 555555..666666 100644
--- a/tests/planned/roadmap.test.js
+++ b/tests/planned/roadmap.test.js
@@ -1,13 +1,24 @@
 import { describe, it, test, expect } from 'vitest'
-import { currentFeature } from '../src/current'
+import { currentFeature } from '../src/current'
+import { paymentFeature } from '../src/payment'
 
 describe('Current Sprint', () => {
   it('should implement current feature', () => {
     expect(currentFeature()).toBe('done')
   })
+
+  it('should handle payment processing', () => {
+    const result = paymentFeature({ amount: 100 })
+    expect(result.success).toBe(true)
+    expect(result.transactionId).toBeDefined()
+    expect(result.amount).toBe(100)
+  })
+})
+
+// Planned for next sprint - placeholder tests
+describe('Next Sprint Features', () => {
+  test.todo('should implement user preferences')
+  test.todo('should handle email notifications')
+  test.todo('should support dark mode')
 })`

export const expected = { trustScore: 30, label: 'False Positive', dataset: 'FP' }
