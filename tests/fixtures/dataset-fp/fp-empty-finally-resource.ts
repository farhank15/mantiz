
export const diff = `diff --git a/src/resource-manager.ts b/src/resource-manager.ts
index 555444..333222 100644
--- a/src/resource-manager.ts
+++ b/src/resource-manager.ts
@@ -1,5 +1,19 @@
 export class ResourceManager {
   async acquireConnection(id: string) {
-    // TODO
+    let conn = null
+    try {
+      conn = await this.pool.acquire()
+      return conn
+    } catch (err) {
+      console.error('Failed to acquire connection:', err)
+      throw err
+    } finally {
+      // Connection is returned to pool in caller's finally block
+    }
+  }
+
+  releaseConnection(conn: any) {
+    this.pool.release(conn)
   }
 }`

export const expected = { trustScore: 94, label: 'False Positive', dataset: 'FP' }
