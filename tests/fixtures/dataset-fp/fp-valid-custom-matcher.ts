/**
 * False Positive Case: Valid custom matcher not in whitelist
 * Triggered Pattern: D6 (Hallucinated Assertion) — unknown matcher
 * Rationale: Project uses custom matchers via expect.extend()
 * Expected: HIGH but may have 1-2 findings from D6
 */
export const diff = `diff --git a/tests/custom-matchers.test.js b/tests/custom-matchers.test.js
index 111333..222444 100644
--- a/tests/custom-matchers.test.js
+++ b/tests/custom-matchers.test.js
@@ -1,11 +1,22 @@
 import { describe, it, expect } from 'vitest'
-import { formatCurrency } from '../src/format'
+import { formatCurrency, parseDate, validateEmail } from '../src/utils'
 
 describe('Custom Matchers', () => {
   it('should format currency correctly', () => {
     expect(formatCurrency(1000)).toBe('$1,000.00')
     expect(formatCurrency(0)).toBe('$0.00')
+    expect(formatCurrency(-500)).toBe('($500.00)')
   })
+
+  it('should parse dates correctly', () => {
+    expect(parseDate('2024-01-01').toISOString()).toBeString()     // custom matcher
+    expect(parseDate('invalid')).toBeNil()                          // custom matcher
+  })
+
+  it('should validate emails', () => {
+    expect(validateEmail('test@test.com')).toBeValidEmail()         // custom matcher
+    expect(validateEmail('invalid')).not.toBeValidEmail()           // custom matcher chain
+  })
 })`

export const expected = { trustScore: 30, label: 'False Positive', dataset: 'FP' }
