/**
 * False Positive Case: Native array iteration with while loop
 * Triggered Pattern: D1 — if_false / while(false) pattern
 * Rationale: While loops with index decrement are standard iteration patterns
 * Expected: VERY HIGH trustScore
 */
export const diff = `diff --git a/src/array-processor.ts b/src/array-processor.ts
index 555444..333222 100644
--- a/src/array-processor.ts
+++ b/src/array-processor.ts
@@ -1,5 +1,19 @@
 export function processItems<T>(items: T[], batchSize: number): T[][] {
-  return [items]
+  const batches: T[][] = []
+  let i = 0
+  while (i < items.length) {
+    batches.push(items.slice(i, i + batchSize))
+    i += batchSize
+  }
+  return batches
+}
+
+export function reverseProcess<T>(items: T[]): T[] {
+  const result: T[] = []
+  let i = items.length
+  while (i--) {
+    result.push(items[i])
+  }
+  return result
 }`

export const expected = { trustScore: 100, label: 'False Positive', dataset: 'FP' }
