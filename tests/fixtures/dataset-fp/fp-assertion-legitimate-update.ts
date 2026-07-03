/**
 * False Positive Case: Legitimate assertion updates for clearMocks default change
 * Source: REAL PR — vitest-dev/vitest #10613
 * URL: https://github.com/vitest-dev/vitest/pull/10613
 * 
 * This PR changes clearMocks default from false to true.
 * Test files update assertion expectations to match the new behavior.
 * Mantiz flags these assertion value changes as D2 tampering —
 * but this is a FALSE POSITIVE: the values were legitimately updated.
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
`

export const expected = { trustScore: 100, label: 'False Positive', dataset: 'FP' }
