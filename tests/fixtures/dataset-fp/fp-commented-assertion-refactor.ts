/**
 * False Positive Case: Commented-out assertion during active refactoring (with TODO, not permanent)
 * Triggered Pattern: D1 (Disabled Assertion) — comment pattern
 * Rationale: Temporary during refactoring — has TODO + active assertions nearby
 * Expected: HIGH trustScore because refactoring is active and temporary
 */
export const diff = `diff --git a/tests/refactor/legacy-module.test.js b/tests/refactor/legacy-module.test.js
index 111999..222888 100644
--- a/tests/refactor/legacy-module.test.js
+++ b/tests/refactor/legacy-module.test.js
@@ -1,14 +1,27 @@
 import { describe, it, expect } from 'vitest'
-import { legacyFunction, newFunction } from '../src/module'
+import { legacyFunction, newFunction, migratedFunction } from '../src/module'
 
 describe('Module Refactoring', () => {
   it('should work with legacy function', () => {
     const result = legacyFunction({ input: 'test' })
-    expect(result.value).toBe('expected')
+    expect(result.value).toBe('expected')
+    expect(result.timestamp).toBeDefined()
   })
 
   it('should work with new function', () => {
     const result = newFunction({ input: 'test' })
-    expect(result.value).toBe('expected')
+    expect(result.value).toBe('expected')
+    expect(result.version).toBe('2.0')
+  })
+
+  it('should handle migrated function with new API', () => {
+    // TODO: Re-enable after migration is complete (tracked in JIRA-456)
+    // expect(migratedFunction({ input: 'legacy' })).toBe('legacy_result')
+    const result = migratedFunction({ input: 'new' })
+    expect(result).toBeDefined()
+    expect(result.newFormat).toBe(true)
+    expect(result.legacyCompat).toBe(true)
   })
 })`

export const expected = { trustScore: 95, label: 'False Positive', dataset: 'FP' }
