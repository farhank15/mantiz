/**
 * False Positive Case: Arrow function returning simple object (factory, not gutted)
 * Triggered Pattern: D7a (AST Analysis) — trivial_function
 * Rationale: Factory functions legitimately return simple objects
 * Expected: HIGH trustScore (this is a source file, not a test)
 */
export const diff = `diff --git a/src/factories.ts b/src/factories.ts
index 555666..777888 100644
--- a/src/factories.ts
+++ b/src/factories.ts
@@ -1,5 +1,18 @@
 export interface User {
   id: string
   name: string
-  role: string
+  role: 'admin' | 'user'
+  email: string
 }
+
+// Factory functions — legitimately return simple objects
+export const createUser = (name: string, email: string): User => ({
+  id: crypto.randomUUID(),
+  name,
+  email,
+  role: 'user',
+})
+
+export const createAdmin = (name: string, email: string): User => ({
+  ...createUser(name, email),
+  role: 'admin',
+})`

export const expected = { trustScore: 100, label: 'False Positive', dataset: 'FP' }
