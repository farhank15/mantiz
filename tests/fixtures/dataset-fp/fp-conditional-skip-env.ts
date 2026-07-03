/**
 * False Positive Case: Conditional skip based on environment (OS/platform-specific tests)
 * Triggered Pattern: D1 (Disabled Assertion) — conditional skip / if_false
 * Rationale: Platform-specific tests should be skipped conditionally
 * Expected: HIGH trustScore
 */
export const diff = `diff --git a/tests/platform/windows-specific.test.js b/tests/platform/windows-specific.test.js
index 777777..888888 100644
--- a/tests/platform/windows-specific.test.js
+++ b/tests/platform/windows-specific.test.js
@@ -1,10 +1,18 @@
 import { describe, it, expect } from 'vitest'
-import { getOSInfo } from '../src/platform'
+import { getOSInfo, getSystemPath } from '../src/platform'
 
 describe('Platform-specific', () => {
   it('should detect OS', () => {
     const info = getOSInfo()
     expect(info.platform).toBeDefined()
+    expect(info.arch).toBeDefined()
+  })
+
+  const isWindows = process.platform === 'win32'
+  const itIf = (condition) => condition ? it : it.skip
+
+  itIf(isWindows)('should get Windows system path', () => {
+    const path = getSystemPath()
+    expect(path).toContain('C:\\\\Windows')
   })
 })`

export const expected = { trustScore: 100, label: 'False Positive', dataset: 'FP' }
