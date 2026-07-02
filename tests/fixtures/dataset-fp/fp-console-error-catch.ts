/**
 * False Positive Case: Legitimate console.error catch for error logging
 * Triggered Pattern: D5 (Silent Catch) — console_only catch
 * Rationale: console.error IS proper error handling in services
 * Expected: HIGH trustScore because console.error is valid error handling
 */
export const diff = `diff --git a/src/monitoring-service.ts b/src/monitoring-service.ts
index 999888..777666 100644
--- a/src/monitoring-service.ts
+++ b/src/monitoring-service.ts
@@ -1,5 +1,15 @@
 export class MonitoringService {
   async reportMetrics(metrics: Record<string, number>) {
-    // TODO: implement
+    try {
+      await this.sendToDashboard(metrics)
+    } catch (err) {
+      console.error('[Monitoring] Failed to report metrics:', err)
+      // Non-critical: monitoring failure shouldn't crash the app
+    }
   }
+
+  async reportError(error: Error, context: string) {
+    console.error('[Monitoring] Error:', error.message, { context })
+    // Error logging is best-effort
+  }
 }`

export const expected = { trustScore: 84, label: 'False Positive', dataset: 'FP' }
