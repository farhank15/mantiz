import { describe, it, expect } from 'vitest'
import { scanDiff } from './engine'

describe('Mantiz Scan Engine', () => {
  it('should flag a diff containing disabled assertions with low trust score', () => {
    const skipMethod = '.skip'
    const suspiciousDiff = `
diff --git a/src/math.test.ts b/src/math.test.ts
index 123456..789101 100644
--- a/src/math.test.ts
+++ b/src/math.test.ts
@@ -1,5 +1,5 @@
 describe('math', () => {
-  it('adds two numbers', () => {
+  it${skipMethod}('adds two numbers', () => {
     expect(1 + 1).toBe(2)
   })
 })
`
    const result = scanDiff(suspiciousDiff)
    expect(result.trustScore).toBeLessThanOrEqual(70)
    expect(result.findings.some(f => f.patternType === 'disabled_assertion')).toBe(true)
  })

  it('should pass an honest clean diff with high trust score', () => {
    const cleanDiff = `
diff --git a/src/math.ts b/src/math.ts
index 123456..789101 100644
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,3 +1,3 @@
 export function add(a: number, b: number): number {
-  return a - b;
+  return a + b;
 }
`
    const result = scanDiff(cleanDiff)
    expect(result.trustScore).toBeGreaterThanOrEqual(80)
    expect(result.findings.some(f => f.patternType === 'disabled_assertion')).toBe(false)
  })
})
