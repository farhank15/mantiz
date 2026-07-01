export const diff = `diff --git a/src/auth.js b/src/auth.js
index 111aaa..222bbb 100644
--- a/src/auth.js
+++ b/src/auth.js
@@ -1,5 +1,18 @@
-export function validateEmail(email) {
-  return email.includes('@')
+export async function login(email, password) {
+  const user = await db.findUser({ email })
+  if (!user) throw new Error('User not found')
+  const valid = await bcrypt.compare(password, user.passwordHash)
+  if (!valid) throw new Error('Invalid password')
+  return { token: generateJWT(user.id), user: { id: user.id, email: user.email } }
+}
+
+export async function signup(email, password, name) {
+  const existing = await db.findUser({ email })
+  if (existing) throw new Error('Email already registered')
+  const hash = await bcrypt.hash(password, 12)
+  const user = await db.createUser({ email, passwordHash: hash, name })
+  return { id: user.id, email: user.email, name: user.name }
 }
diff --git a/tests/auth.test.js b/tests/auth.test.js
index 333ccc..444ddd 100644
--- a/tests/auth.test.js
+++ b/tests/auth.test.js
@@ -1,12 +1,38 @@
-import { describe, it, expect } from 'vitest'
-import { validateEmail } from '../src/auth'
+import { describe, it, expect, vi } from 'vitest'
+import { login, signup } from '../src/auth'
+import { db } from '../src/db'
 
-describe('Email validation', () => {
-  it('should validate correct email', () => {
-    expect(validateEmail('test@test.com')).toBe(true)
+vi.mock('../src/db', () => ({
+  db: {
+    findUser: vi.fn(),
+    createUser: vi.fn(),
+  },
+}))
+
+describe('Auth', () => {
+  it('should login with valid credentials', async () => {
+    vi.mocked(db.findUser).mockResolvedValue({ id: 1, email: 'test@test.com', passwordHash: '$2b$12$hash' })
+    const result = await login('test@test.com', 'password123')
+    expect(result.token).toBeDefined()
+    expect(result.user.email).toBe('test@test.com')
+  })
+
+  it('should reject invalid email', async () => {
+    vi.mocked(db.findUser).mockResolvedValue(null)
+    await expect(login('wrong@test.com', 'pass')).rejects.toThrow('User not found')
+  })
+
+  it('should signup a new user', async () => {
+    vi.mocked(db.findUser).mockResolvedValue(null)
+    vi.mocked(db.createUser).mockResolvedValue({ id: 2, email: 'new@test.com', name: 'New User' })
+    const result = await signup('new@test.com', 'securePass123', 'New User')
+    expect(result.id).toBe(2)
+    expect(result.name).toBe('New User')
   })
-})
+
+  it('should reject duplicate signup', async () => {
+    vi.mocked(db.findUser).mockResolvedValue({ id: 1 })
+    await expect(signup('existing@test.com', 'pass', 'Name')).rejects.toThrow('Email already registered')
+  })
+})`

export const expected = { trustScore: 90, label: 'Honest', dataset: 'A' }
