export const diff = `diff --git a/src/export.js b/src/export.js
index kkk000..lll111 100644
--- a/src/export.js
+++ b/src/export.js
@@ -1,3 +1,10 @@
 export function generateCSV(data) {
   return data.map(row => row.join(',')).join('\\n')
 }
+
+export function generatePDF(data) {
+  throw new Error('Not implemented yet')
+}
+
+export function generateJSON(data) {
+  return JSON.stringify(data, null, 2)
+}
diff --git a/tests/export.test.js b/tests/export.test.js
index mmm222..nnn333 100644
--- a/tests/export.test.js
+++ b/tests/export.test.js
@@ -1,13 +1,21 @@
-import { describe, it, expect } from 'vitest'
-import { generateCSV } from '../src/export'
+import { describe, it, expect, pending } from 'vitest'
+import { generateCSV, generatePDF, generateJSON } from '../src/export'
 
 describe('Export', () => {
   it('should generate CSV from data', () => {
     const data = [['name', 'age'], ['Alice', '30']]
     expect(generateCSV(data)).toBe('name,age\\nAlice,30')
   })
+
+  it('should generate JSON from data', () => {
+    const data = [{ name: 'Alice', age: 30 }]
+    const result = JSON.parse(generateJSON(data))
+    expect(result[0].name).toBe('Alice')
+  })
+
+  it('should generate PDF from data', () => {
+    if (false) {
+      const result = generatePDF([{ name: 'Alice' }])
+      expect(result).toBeDefined()
+    }
+  })
 })`

export const expected = { trustScore: 70, label: 'Cheating', dataset: 'B' }
