/**
 * False Positive Case: Legitimate `xit` for known flaky test
 * Triggered Pattern: D1 (Disabled Assertion) — xit pattern
 * Rationale: xit is used to temporarily disable flaky tests while debugging
 * Expected: HIGH trustScore because only 1 xit, other tests active
 */
export const diff = `diff --git a/tests/flaky/timer.test.js b/tests/flaky/timer.test.js
index 777777..888888 100644
--- a/tests/flaky/timer.test.js
+++ b/tests/flaky/timer.test.js
@@ -1,13 +1,20 @@
 import { describe, it, expect } from 'vitest'
 import { debounce, throttle, delay } from '../src/timer'
 
 describe('Timer Functions', () => {
   it('should debounce calls', async () => {
     const fn = vi.fn()
     const debounced = debounce(fn, 100)
-    debounced()
-    debounced()
     await delay(200)
+    expect(fn).toHaveBeenCalledTimes(1)
   })
+
+  it('should throttle calls', async () => {
+    const fn = vi.fn()
+    const throttled = throttle(fn, 100)
+    throttled()
+    throttled()
+    expect(fn).toHaveBeenCalledTimes(1)
+  })
+
+  // Flaky on CI due to timing - investigating in https://github.com/org/repo/issues/123
+  xit('should delay execution', async () => {
+    const start = Date.now()
+    await delay(50)
+    expect(Date.now() - start).toBeGreaterThanOrEqual(45)
+  })
 })`

export const expected = { trustScore: 71, label: 'False Positive', dataset: 'FP' }
