/**
 * False Positive Case: Simple utility test with few assertions (naturally simple functions)
 * Triggered Pattern: D10 (Mutation Susceptibility) — low assertion density
 * Rationale: Some functions are trivially simple — don't need many assertions
 * Expected: HIGH trustScore (simple functions need simple tests)
 */
export const diff = `diff --git a/tests/string-utils.test.js b/tests/string-utils.test.js
index 111111..222222 100644
--- a/tests/string-utils.test.js
+++ b/tests/string-utils.test.js
@@ -1,9 +1,17 @@
 import { describe, it, expect } from 'vitest'
-import { capitalize } from '../src/string-utils'
+import { capitalize, truncate, slugify } from '../src/string-utils'
 
 describe('String Utils', () => {
   it('should capitalize a string', () => {
     expect(capitalize('hello')).toBe('Hello')
+    expect(capitalize('')).toBe('')
+    expect(capitalize('already Capital')).toBe('Already Capital')
+  })
+
+  it('should truncate a string', () => {
+    expect(truncate('Hello World', 5)).toBe('He...')
+    expect(truncate('Hi', 10)).toBe('Hi')
+    expect(truncate('', 3)).toBe('')
   })
 })`

export const expected = { trustScore: 94, label: 'False Positive', dataset: 'FP' }
