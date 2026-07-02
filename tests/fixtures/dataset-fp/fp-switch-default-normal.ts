/**
 * False Positive Case: Switch with default case for normal routing logic
 * Triggered Pattern: D7a (AST Analysis) — switch with trivial default
 * Rationale: Switch with default IS normal control flow
 * Expected: VERY HIGH trustScore (non-test file)
 */
export const diff = `diff --git a/src/router.ts b/src/router.ts
index 111222..333444 100644
--- a/src/router.ts
+++ b/src/router.ts
@@ -1,5 +1,24 @@
 export function routeRequest(method: string, path: string) {
-  return 'Not implemented'
+  switch (method.toUpperCase()) {
+    case 'GET':
+      return handleGet(path)
+    case 'POST':
+      return handlePost(path)
+    case 'PUT':
+      return handlePut(path)
+    case 'DELETE':
+      return handleDelete(path)
+    default:
+      return { status: 405, body: 'Method not allowed' }
+  }
+}
+
+function handleGet(path: string) {
+  if (path === '/users') return { status: 200, body: { users: [] } }
+  if (path === '/health') return { status: 200, body: { ok: true } }
+  return { status: 404, body: 'Not found' }
+}
+
+function handlePost(path: string) {
+  return { status: 201, body: { created: true } }
 }`

export const expected = { trustScore: 94, label: 'False Positive', dataset: 'FP' }
