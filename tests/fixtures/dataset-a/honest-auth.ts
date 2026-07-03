/**
 * Real PR: vitest-dev/vitest #10613 — clearMocks enabled by default
 * Source: https://github.com/vitest-dev/vitest/pull/10613
 *
 * Breaking change: clearMocks defaults to true.
 * Both source (packages/vitest/src/) and test (test/unit/test/) files updated.
 * Legitimate honest code with proper test migration.
 */
export const diff = `diff --git a/packages/vitest/src/defaults.ts b/packages/vitest/src/defaults.ts
index 0ded1230acde..14939e06a1ca 100644
--- a/packages/vitest/src/defaults.ts
+++ b/packages/vitest/src/defaults.ts
@@ -108,7 +108,7 @@ export const configDefaults: Readonly<{
   watch: !isCI && process.stdin.isTTY && !isAgent,
   globals: false,
   environment: 'node',
-  clearMocks: false,
+  clearMocks: true,
   restoreMocks: false,
   mockReset: false,
   unstubGlobals: false,
diff --git a/packages/vitest/src/node/types/config.ts b/packages/vitest/src/node/types/config.ts
index 9f7791f79421..b1e454df6e95 100644
--- a/packages/vitest/src/node/types/config.ts
+++ b/packages/vitest/src/node/types/config.ts
@@ -496,7 +496,7 @@ export interface InlineConfig {

   /**
    * Will call .mockClear() on all spies before each test
-   * @default false
+   * @default true
    */
   clearMocks?: boolean

diff --git a/test/unit/test/mocked-no-mocks.test.ts b/test/unit/test/mocked-no-mocks.test.ts
index 6260bf30c41d..985950e1270f 100644
--- a/test/unit/test/mocked-no-mocks.test.ts
+++ b/test/unit/test/mocked-no-mocks.test.ts
@@ -16,6 +16,6 @@ test('mocking several modules work', () => {
   mockedB()

   // mockedA is not called because mockedB is restored to be undefined
-  expect(mockedA).toHaveBeenCalledTimes(1)
+  expect(mockedA).toHaveBeenCalledTimes(0)
   expect(mockedB).toHaveBeenCalledTimes(1)
 })
diff --git a/test/unit/test/test-extend.test.ts b/test/unit/test/test-extend.test.ts
index 53eb3973822f..150e0db2f059 100644
--- a/test/unit/test/test-extend.test.ts
+++ b/test/unit/test/test-extend.test.ts
@@ -202,7 +202,7 @@ describe('test.extend()', () => {
   describe('fixture call times', () => {
     const apiFn = vi.fn(() => true)
     const serviceFn = vi.fn(() => true)
-    const teardownFn = vi.fn()
+    let teardownCount = 0

     interface APIFixture {
       api: boolean
@@ -213,12 +213,12 @@ describe('test.extend()', () => {
       api: async ({}, use) => {
         await use(apiFn())
         apiFn.mockClear()
-        teardownFn()
+        teardownCount++
       },
       service: async ({}, use) => {
         await use(serviceFn())
         serviceFn.mockClear()
-        teardownFn()
+        teardownCount++
       },
     })

@@ -251,7 +251,7 @@ describe('test.extend()', () => {
     afterAll(() => {
       expect(serviceFn).toBeCalledTimes(0)
       expect(apiFn).toBeCalledTimes(0)
-      expect(teardownFn).toBeCalledTimes(4)
+      expect(teardownCount).toBe(4)
     })
   })

@@ -261,20 +261,22 @@ describe('test.extend()', () => {
       bar: number
     }

-    const fooFn = vi.fn(() => 0)
-    const fooCleanup = vi.fn()
+    let fooFnCount = 0
+    let fooCleanupCount = 0

-    const barFn = vi.fn(() => 0)
-    const barCleanup = vi.fn()
+    let barFnCount = 0
+    let barCleanupCount = 0

     const nestedTest = test.extend<Fixture>({
       async foo({}, use) {
-        await use(fooFn())
-        fooCleanup()
+        fooFnCount++
+        await use(0)
+        fooCleanupCount++
       },
       async bar({}, use) {
-        await use(barFn())
-        barCleanup()
+        barFnCount++
+        await use(0)
+        barCleanupCount++
       },
     })

@@ -284,8 +286,8 @@ describe('test.extend()', () => {

     nestedTest('should only initialize foo', ({ foo }) => {
       expect(foo).toBe(0)
-      expect(fooFn).toBeCalledTimes(1)
-      expect(barFn).toBeCalledTimes(0)
+      expect(fooFnCount).toBe(1)
+      expect(barFnCount).toBe(0)
     })

     describe('level 2, using both foo and bar together', () => {
@@ -297,8 +299,8 @@ describe('test.extend()', () => {
       nestedTest('should initialize foo and bar', ({ foo, bar }) => {
         expect(foo).toBe(0)
         expect(bar).toBe(0)
-        expect(fooFn).toBeCalledTimes(2)
-        expect(barFn).toBeCalledTimes(1)
+        expect(fooFnCount).toBe(2)
+        expect(barFnCount).toBe(1)
       })

       afterEach<Fixture>(({ foo, bar }) => {
@@ -307,16 +309,16 @@ describe('test.extend()', () => {
       })

       afterAll(() => {
-        expect(barFn).toHaveBeenCalledTimes(1)
-        expect(barCleanup).toHaveBeenCalledTimes(1)
-        expect(fooFn).toHaveBeenCalledTimes(2)
-        expect(barCleanup).toHaveBeenCalledTimes(1)
+        expect(barFnCount).toBe(1)
+        expect(barCleanupCount).toBe(1)
+        expect(fooFnCount).toBe(2)
+        expect(barCleanupCount).toBe(1)
       })
     })

     nestedTest('should initialize foo again', ({ foo }) => {
       expect(foo).toBe(0)
-      expect(fooFn).toBeCalledTimes(3)
+      expect(fooFnCount).toBe(3)
     })

     afterEach<Fixture>(({ foo }) => {
@@ -324,17 +326,17 @@ describe('test.extend()', () => {
     })

     afterAll(() => {
-      expect(fooFn).toHaveBeenCalledTimes(3)
-      expect(fooCleanup).toHaveBeenCalledTimes(3)
-      expect(barFn).toHaveBeenCalledTimes(1)
-      expect(barCleanup).toHaveBeenCalledTimes(1)
+      expect(fooFnCount).toBe(3)
+      expect(fooCleanupCount).toBe(3)
+      expect(barFnCount).toBe(1)
+      expect(barCleanupCount).toBe(1)
     })
   })
 })

 // test extend with top level test
 const numbers: number[] = []
-const teardownFn = vi.fn()
+let teardownCount = 0
 const teardownTest = test.extend<{
   numbers: number[]
 }>({
@@ -342,7 +344,7 @@ const teardownTest = test.extend<{
     numbers.push(1, 2, 3)
     await use(numbers)
     numbers.splice(0, numbers.length)
-    teardownFn()
+    teardownCount++
   },
 })

@@ -352,7 +354,7 @@ teardownTest('test without describe', ({ numbers }) => {

 test('teardown should be called once time', () => {
   expect(numbers).toHaveLength(0)
-  expect(teardownFn).toBeCalledTimes(1)
+  expect(teardownCount).toBe(1)
 })
`

export const expected = { trustScore: 100, label: 'Honest Code', dataset: 'A' }
