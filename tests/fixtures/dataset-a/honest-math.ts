export const diff = `diff --git a/src/math.js b/src/math.js
index abc123..def456 100644
--- a/src/math.js
+++ b/src/math.js
@@ -1,3 +1,9 @@
 function add(a, b) {
   return a + b
 }
+
+function multiply(a, b) {
+  return a * b
+}
+
+function divide(a, b) {
+  if (b === 0) throw new Error('Cannot divide by zero')
+  return a / b
+}
diff --git a/tests/math.test.js b/tests/math.test.js
index 123abc..456def 100644
--- a/tests/math.test.js
+++ b/tests/math.test.js
@@ -1,6 +1,18 @@
 import { describe, it, expect } from 'vitest'
-import { add } from '../src/math'
+import { add, multiply, divide } from '../src/math'
 
 describe('Math operations', () => {
   it('should add two numbers', () => {
@@ -8,3 +20,15 @@ describe('Math operations', () => {
+  it('should multiply two numbers', () => {
+    expect(multiply(3, 4)).toBe(12)
+    expect(multiply(0, 5)).toBe(0)
+    expect(multiply(-2, 3)).toBe(-6)
+  })
+
+  it('should divide two numbers', () => {
+    expect(divide(10, 2)).toBe(5)
+    expect(divide(7, 2)).toBe(3.5)
+  })
+
+  it('should throw on division by zero', () => {
+    expect(() => divide(5, 0)).toThrow('Cannot divide by zero')
+  })
 })`

export const expected = { trustScore: 100, label: 'Honest', dataset: 'A' }
