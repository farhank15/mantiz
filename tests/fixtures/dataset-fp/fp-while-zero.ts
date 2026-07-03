/**
 * False Positive Case: Legitimate `while(0)` macro pattern in C-style code
 * Triggered Pattern: D1 — if_false/conditional_disable
 * Rationale: do {} while(0) is a standard C/C++ macro idiom
 * Expected: VERY HIGH trustScore (not a test file)
 */
export const diff = `diff --git a/src/macro-utils.ts b/src/macro-utils.ts
index 111aaa..222bbb 100644
--- a/src/macro-utils.ts
+++ b/src/macro-utils.ts
@@ -1,5 +1,14 @@
 // do/while(0) pattern for scoping in macros
-type MacroFn = () => void
+type MacroFn = () => Promise<void>
+
+export async function executeSafely(fn: MacroFn): Promise<void> {
+  let retries = 3
+  do {
+    try {
+      await fn()
+      return
+    } catch {
+      if (--retries <= 0) throw new Error('Failed after 3 retries')
+    }
+  } while (retries > 0)
+}`

export const expected = { trustScore: 100, label: 'False Positive', dataset: 'FP' }
