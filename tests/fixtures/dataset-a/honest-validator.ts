/**
 * Real PR: vitest-dev/vitest #10676 — remove axios from tests
 * Source: https://github.com/vitest-dev/vitest/pull/10676
 *
 * Internal cleanup removing axios dependency from test infrastructure.
 * Both source configuration and test files updated.
 * Legitimate honest code — proper dependency management.
 */
export const diff = `diff --git a/test/e2e/fixtures/no-module-runner/test/suite.test.ts b/test/e2e/fixtures/no-module-runner/test/suite.test.ts
index dba27a7bbd17..7ac9f26973fb 100644
--- a/test/e2e/fixtures/no-module-runner/test/suite.test.ts
+++ b/test/e2e/fixtures/no-module-runner/test/suite.test.ts
@@ -1,5 +1,5 @@
 import { assert, describe, expect, it } from 'vitest'
-import { getSetupStates, initJsSetup, initTsSetup } from '../src/setups.ts'
+import { getSetupStates } from '../src/setups.ts'

 describe('suite name', () => {
   it('foo', () => {
@@ -8,9 +8,6 @@ describe('suite name', () => {

   it('setups work', () => {
     // TODO: a separate CLI test that confirms --maxWorkers=1 --no-isolate runs the setup file for every test file
-    expect(initJsSetup).toHaveBeenCalled()
-    expect(initTsSetup).toHaveBeenCalled()
-
     expect(getSetupStates()).toEqual({
       jsSetup: true,
       tsSetup: true,
diff --git a/test/unit/test/vi.spec.ts b/test/unit/test/vi.spec.ts
index ed642430b29c..4a75217eb63c 100644
--- a/test/unit/test/vi.spec.ts
+++ b/test/unit/test/vi.spec.ts
@@ -263,13 +263,13 @@ describe('testing vi utils', () => {
   test('can change config', () => {
     const state = getWorkerState()
     expect(state.config.hookTimeout).toBe(10000)
-    expect(state.config.clearMocks).toBe(false)
-    vi.setConfig({ hookTimeout: 6000, clearMocks: true })
-    expect(state.config.hookTimeout).toBe(6000)
     expect(state.config.clearMocks).toBe(true)
+    vi.setConfig({ hookTimeout: 6000, clearMocks: false })
+    expect(state.config.hookTimeout).toBe(6000)
+    expect(state.config.clearMocks).toBe(false)
     vi.resetConfig()
     expect(state.config.hookTimeout).toBe(10000)
-    expect(state.config.clearMocks).toBe(false)
+    expect(state.config.clearMocks).toBe(true)
   })

   test('loads unloaded module', async () => {
`

export const expected = { trustScore: 91, label: 'Honest Code', dataset: 'A' }
