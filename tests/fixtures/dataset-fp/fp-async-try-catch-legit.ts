/**
 * False Positive Case: Async function with legitimate try/catch (not gutted/silent)
 * Triggered Pattern: D7a (AST Analysis) — async_gutted
 * Rationale: Function handles errors properly (re-throws wrapped error)
 * Expected: HIGH trustScore because error handling is meaningful
 */
export const diff = `diff --git a/src/api-client.ts b/src/api-client.ts
index 999888..777666 100644
--- a/src/api-client.ts
+++ b/src/api-client.ts
@@ -1,5 +1,22 @@
 export class ApiClient {
   async fetchUserData(userId: string) {
-    // TODO
+    try {
+      const response = await fetch(\`/api/users/\${userId}\`)
+      if (!response.ok) {
+        throw new Error(\`HTTP \${response.status}\`)
+      }
+      return await response.json()
+    } catch (err) {
+      // Wrap and re-throw with context — proper error handling
+      throw new Error(\`Failed to fetch user \${userId}: \${(err as Error).message}\`)
+    }
+  }
+
+  async fetchUserPosts(userId: string) {
+    const user = await this.fetchUserData(userId)
+    const response = await fetch(\`/api/users/\${userId}/posts\`)
+    const posts = await response.json()
+    return { user, posts }
   }
 }`

export const expected = { trustScore: 100, label: 'False Positive', dataset: 'FP' }
