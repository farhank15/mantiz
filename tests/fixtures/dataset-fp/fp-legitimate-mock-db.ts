/**
 * False Positive Case: Legitimate mock for external database in unit test
 * Triggered Pattern: D3 (Mock-to-Avoid) — mock introduced
 * Rationale: Database IS an external dependency — should be mocked in unit tests
 * Expected: HIGH trustScore because mocking DB is standard unit testing practice
 */
export const diff = `diff --git a/tests/user-service.test.js b/tests/user-service.test.js
index 555555..666666 100644
--- a/tests/user-service.test.js
+++ b/tests/user-service.test.js
@@ -1,12 +1,28 @@
 import { describe, it, expect, vi } from 'vitest'
-import { getUser } from '../src/user-service'
+import { getUser, createUser, deleteUser } from '../src/user-service'
+import { db } from '../src/database'
+
+vi.mock('../src/database', () => ({
+  db: {
+    query: vi.fn(),
+    insert: vi.fn(),
+    delete: vi.fn(),
+  },
+}))
 
 describe('User Service', () => {
   it('should get user by id', async () => {
     vi.mocked(db.query).mockResolvedValue({ id: 1, name: 'John' })
     const user = await getUser(1)
     expect(user).toBeDefined()
     expect(user.name).toBe('John')
   })
+
+  it('should create user', async () => {
+    vi.mocked(db.insert).mockResolvedValue({ id: 2 })
+    const result = await createUser({ name: 'Jane', email: 'jane@test.com' })
+    expect(result.id).toBe(2)
+    expect(result.name).toBe('Jane')
+  })
 })`

export const expected = { trustScore: 93, label: 'False Positive', dataset: 'FP' }
