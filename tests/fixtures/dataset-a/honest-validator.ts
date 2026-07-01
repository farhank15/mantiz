export const diff = `diff --git a/src/validator.js b/src/validator.js
index eee444..fff555 100644
--- a/src/validator.js
+++ b/src/validator.js
@@ -1,3 +1,15 @@
-export function isValidUsername(name) {
-  return name.length >= 3
+export function isValidUsername(name) {
+  if (typeof name !== 'string') return false
+  return /^[a-zA-Z0-9_]{3,20}$/.test(name)
+}
+
+export function isValidEmail(email) {
+  if (typeof email !== 'string') return false
+  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)
+}
+
+export function isValidPassword(password) {
+  if (typeof password !== 'string') return false
+  if (password.length < 8) return false
+  if (!/[A-Z]/.test(password)) return false
+  if (!/[0-9]/.test(password)) return false
+  return true
+}
+
+export function sanitizeInput(input) {
+  return input.trim().replace(/<[^>]*>/g, '')
 }
diff --git a/tests/validator.test.js b/tests/validator.test.js
index ggg666..hhh777 100644
--- a/tests/validator.test.js
+++ b/tests/validator.test.js
@@ -1,9 +1,41 @@
 import { describe, it, expect } from 'vitest'
-import { isValidUsername } from '../src/validator'
+import { isValidUsername, isValidEmail, isValidPassword, sanitizeInput } from '../src/validator'
 
-describe('Username validation', () => {
-  it('should accept valid username', () => {
-    expect(isValidUsername('abc')).toBe(true)
+describe('Validator', () => {
+  describe('Username', () => {
+    it('should accept valid username', () => {
+      expect(isValidUsername('john_doe')).toBe(true)
+      expect(isValidUsername('abc')).toBe(true)
+    })
+
+    it('should reject short username', () => {
+      expect(isValidUsername('ab')).toBe(false)
+    })
+
+    it('should reject non-string input', () => {
+      expect(isValidUsername(null)).toBe(false)
+      expect(isValidUsername(123)).toBe(false)
+    })
+  })
+
+  describe('Email', () => {
+    it('should accept valid email', () => {
+      expect(isValidEmail('test@example.com')).toBe(true)
+    })
+
+    it('should reject invalid email', () => {
+      expect(isValidEmail('not-an-email')).toBe(false)
+      expect(isValidEmail('')).toBe(false)
+    })
+  })
+
+  describe('Password', () => {
+    it('should accept strong password', () => {
+      expect(isValidPassword('StrongPass1')).toBe(true)
+    })
+
+    it('should reject weak password', () => {
+      expect(isValidPassword('short')).toBe(false)
+      expect(isValidPassword('alllowercase1')).toBe(false)
+      expect(isValidPassword('NoNumbers')).toBe(false)
+    })
   })
 })`

export const expected = { trustScore: 100, label: 'Honest', dataset: 'A' }
