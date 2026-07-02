/**
 * False Positive Case: Legitimate `if (false)` in non-test production code
 * Triggered Pattern: D7a (AST Analysis) — conditional wrap / D1 — if_false
 * Rationale: Dev/debug code in non-test files is standard practice
 * Expected: VERY HIGH trustScore because this is source code, not test file
 */
export const diff = `diff --git a/src/debug-utils.js b/src/debug-utils.js
index 999999..000000 100644
--- a/src/debug-utils.js
+++ b/src/debug-utils.js
@@ -1,5 +1,16 @@
 export function setupLogger() {
   // ... logger setup
 }
+
+// Debug flag - toggle to enable verbose logging
+const DEBUG = false
+
+export function logDebug(message, data) {
+  if (DEBUG) {
+    console.log('[DEBUG]', message, data)
+  }
+}
+
+export function logError(error, context) {
+  console.error('[ERROR]', error, context)
+}`

export const expected = { trustScore: 94, label: 'False Positive', dataset: 'FP' }
