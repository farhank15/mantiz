/**
 * False Positive Case: Getter/setter test — minimal assertions by nature
 * Triggered Pattern: D10 (Mutation Susceptibility) — low assertion density
 * Rationale: Getters/setters naturally have few assertions
 * Expected: HIGH trustScore
 */
export const diff = `diff --git a/tests/models/user-model.test.js b/tests/models/user-model.test.js
index 333333..444444 100644
--- a/tests/models/user-model.test.js
+++ b/tests/models/user-model.test.js
@@ -1,11 +1,20 @@
 import { describe, it, expect } from 'vitest'
-import { UserModel } from '../src/models/user'
+import { UserModel, AdminModel } from '../src/models/user'
 
 describe('UserModel', () => {
   it('should create user with defaults', () => {
     const user = new UserModel({ name: 'John' })
     expect(user.name).toBe('John')
+    expect(user.role).toBe('user')
+    expect(user.isActive).toBe(false)
+  })
+
+  it('should set and get name', () => {
+    const user = new UserModel()
+    user.name = 'Jane'
+    expect(user.name).toBe('Jane')
   })
 })`

export const expected = { trustScore: 94, label: 'False Positive', dataset: 'FP' }
