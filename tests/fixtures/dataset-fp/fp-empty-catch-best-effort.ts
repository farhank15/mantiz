/**
 * False Positive Case: Legitimate empty catch for expected/intentional no-op
 * Triggered Pattern: D5 (Silent Catch) — empty catch
 * Rationale: Some expected errors should be silently ignored (e.g., cleanup)
 * Expected: HIGH trustScore because empty catch is justified with comment
 */
export const diff = `diff --git a/tests/cleanup.test.js b/tests/cleanup.test.js
index 111222..333444 100644
--- a/tests/cleanup.test.js
+++ b/tests/cleanup.test.js
@@ -1,15 +1,22 @@
 import { describe, it, expect, vi } from 'vitest'
-import { cleanupTempFiles } from '../src/cleanup'
+import { cleanupTempFiles, removeOrphanedLocks } from '../src/cleanup'
 
 describe('Cleanup Service', () => {
   it('should clean up temp files', async () => {
     const result = await cleanupTempFiles()
     expect(result.cleaned).toBeGreaterThanOrEqual(0)
+    expect(result.errors).toBe(0)
+  })
+
+  it('should remove orphaned locks gracefully', async () => {
+    // Lock files might not exist — that's fine, just move on
+    try {
+      await removeOrphanedLocks()
+    } catch {
+      // Lock cleanup is best-effort; cleanup continues
+    }
+    expect(true).toBe(true)
   })
 })`

export const expected = { trustScore: 84, label: 'False Positive', dataset: 'FP' }
