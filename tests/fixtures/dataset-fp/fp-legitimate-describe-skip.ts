/**
 * False Positive Case: Legitimate `describe.skip` for WIP feature
 * Triggered Pattern: D1 (Disabled Assertion) — skip pattern
 * Rationale: Feature development often has WIP tests
 * Expected: HIGH trustScore karena skip explicit untuk WIP, test lainnya aktif
 */
export const diff = `diff --git a/tests/feature/new-feature.test.js b/tests/feature/new-feature.test.js
index 333333..444444 100644
--- a/tests/feature/new-feature.test.js
+++ b/tests/feature/new-feature.test.js
@@ -1,9 +1,30 @@
 import { describe, it, expect } from 'vitest'
-import { existingFeature } from '../src/existing'
+import { existingFeature, newFeature } from '../src/new-feature'
 
 describe('Existing Feature', () => {
   it('should work correctly', () => {
     const result = existingFeature()
     expect(result).toBe('expected')
   })
+
+  it('should handle edge cases', () => {
+    expect(existingFeature(null)).toBeNull()
+    expect(existingFeature(undefined)).toBeNull()
+    expect(existingFeature('')).toBe('expected')
+  })
+})
+
+// New feature - still in development, tests written upfront (TDD)
+describe.skip('New Feature', () => {
+  it('should process data correctly', () => {
+    const result = newFeature({ input: 'test' })
+    expect(result).toBeDefined()
+    expect(result.status).toBe('processed')
+  })
+
+  it('should handle validation errors', () => {
+    expect(() => newFeature(null)).toThrow('Invalid input')
+    expect(() => newFeature({})).toThrow('Missing required field')
+  })
 })`

export const expected = { trustScore: 63, label: 'False Positive', dataset: 'FP' }
