/**
 * Real PR: vitest-dev/vitest #6803 — onTestsRerun callback
 * Source: https://github.com/vitest-dev/vitest/pull/6803
 *
 * This PR adds an onTestsRerun callback to GlobalSetupContext.
 * Both source files (packages/vitest/src/) and test files (test/watch/) are modified.
 * This is legitimate honest code — proper source + test updates together.
 */
export const diff = `diff --git a/packages/vitest/src/node/core.ts b/packages/vitest/src/node/core.ts
index 763fec4c468a..ffeed278d2f9 100644
--- a/packages/vitest/src/node/core.ts
+++ b/packages/vitest/src/node/core.ts
@@ -3,7 +3,7 @@ import type { Writable } from 'node:stream'
 import type { ViteDevServer } from 'vite'
 import type { defineWorkspace } from 'vitest/config'
 import type { SerializedCoverageConfig } from '../runtime/config'
-import type { ArgumentsType, OnServerRestartHandler, ProvidedContext, UserConsoleLog } from '../types/general'
+import type { ArgumentsType, OnServerRestartHandler, OnTestsRerunHandler, ProvidedContext, UserConsoleLog } from '../types/general'
 import type { ProcessPool, WorkspaceSpec } from './pool'
 import type { TestSpecification } from './spec'
 import type { ResolvedConfig, UserConfig, VitestRunMode } from './types/config'
@@ -102,6 +102,7 @@ export class Vitest {
   private _onClose: (() => Awaited<unknown>)[] = []
   private _onSetServer: OnServerRestartHandler[] = []
   private _onCancelListeners: ((reason: CancelReason) => Promise<void> | void)[] = []
+  private _onUserTestsRerun: OnTestsRerunHandler[] = []

   async setServer(options: UserConfig, server: ViteDevServer, cliOptions: UserConfig) {
     this.unregisterWatcher?.()
@@ -113,6 +114,7 @@ export class Vitest {
     this.coverageProvider = undefined
     this.runningPromise = undefined
     this._cachedSpecs.clear()
+    this._onUserTestsRerun = []

     const resolved = resolveConfig(this.mode, options, server.config, this.logger)

@@ -691,7 +693,10 @@ export class Vitest {
       files = files.filter(file => filteredFiles.some(f => f[1] === file))
     }

-    await this.report('onWatcherRerun', files, trigger)
+    await Promise.all([
+      this.report('onWatcherRerun', files, trigger),
+      ...this._onUserTestsRerun.map(fn => fn(files)),
+    ])
     await this.runFiles(files.flatMap(file => this.getProjectsByTestFile(file)), allTestsRun)

     await this.report('onWatcherStart', this.state.getFiles(files))
@@ -813,7 +818,10 @@ export class Vitest {

       const triggerIds = new Set(triggerId.map(id => relative(this.config.root, id)))
       const triggerLabel = Array.from(triggerIds).join(', ')
-      await this.report('onWatcherRerun', files, triggerLabel)
+      await Promise.all([
+        this.report('onWatcherRerun', files, triggerLabel),
+        ...this._onUserTestsRerun.map(fn => fn(files)),
+      ])

       await this.runFiles(files.flatMap(file => this.getProjectsByTestFile(file)), false)

@@ -1150,4 +1158,8 @@ export class Vitest {
   onClose(fn: () => void) {
     this._onClose.push(fn)
   }
+
+  onTestsRerun(fn: OnTestsRerunHandler): void {
+    this._onUserTestsRerun.push(fn)
+  }
 }
diff --git a/packages/vitest/src/node/globalSetup.ts b/packages/vitest/src/node/globalSetup.ts
index caf1d4e0820f..33d17d8aadfe 100644
--- a/packages/vitest/src/node/globalSetup.ts
+++ b/packages/vitest/src/node/globalSetup.ts
@@ -1,5 +1,5 @@
 import type { ViteNodeRunner } from 'vite-node/client'
-import type { ProvidedContext } from '../types/general'
+import type { OnTestsRerunHandler, ProvidedContext } from '../types/general'
 import type { ResolvedConfig } from './types/config'
 import { toArray } from '@vitest/utils'

@@ -9,6 +9,7 @@ export interface GlobalSetupContext {
     key: T,
     value: ProvidedContext[T]
   ) => void
+  onTestsRerun: (cb: OnTestsRerunHandler) => void
 }

 export interface GlobalSetupFile {
diff --git a/packages/vitest/src/node/workspace.ts b/packages/vitest/src/node/workspace.ts
index 38135d1ff6c9..6857b67c006e 100644
--- a/packages/vitest/src/node/workspace.ts
+++ b/packages/vitest/src/node/workspace.ts
@@ -170,6 +170,7 @@ export class WorkspaceProject {
       const teardown = await globalSetupFile.setup?.({
         provide: (key, value) => this.provide(key, value),
         config: this.config,
+        onTestsRerun: cb => this.ctx.onTestsRerun(cb),
       })
       if (teardown == null || !!globalSetupFile.teardown) {
         continue
diff --git a/packages/vitest/src/public/node.ts b/packages/vitest/src/public/node.ts
index ce7b67697811..e46a3911134e 100644
--- a/packages/vitest/src/public/node.ts
+++ b/packages/vitest/src/public/node.ts
@@ -126,7 +126,10 @@ export type {
   TscErrorInfo as TypeCheckErrorInfo,
 } from '../typecheck/types'

-export type { OnServerRestartHandler } from '../types/general'
+export type {
+  OnServerRestartHandler,
+  OnTestsRerunHandler,
+} from '../types/general'

 export { createDebugger } from '../utils/debugger'

diff --git a/packages/vitest/src/types/general.ts b/packages/vitest/src/types/general.ts
index 99cba19ca50b..2d46006f0da4 100644
--- a/packages/vitest/src/types/general.ts
+++ b/packages/vitest/src/types/general.ts
@@ -46,5 +46,5 @@ export interface ModuleGraphData {
 }

 export type OnServerRestartHandler = (reason?: string) => Promise<void> | void
-
+export type OnTestsRerunHandler = (testFiles: string[]) => Promise<void> | void
 export interface ProvidedContext {}
diff --git a/test/watch/fixtures/global-setup.ts b/test/watch/fixtures/global-setup.ts
new file mode 100644
index 000000000000..b86537e952dc
--- /dev/null
+++ b/test/watch/fixtures/global-setup.ts
@@ -0,0 +1,15 @@
+import { GlobalSetupContext } from 'vitest/node';
+
+const calls: string[] = [];
+
+(globalThis as any).__CALLS = calls
+
+export default ({ onTestsRerun }: GlobalSetupContext) => {
+  calls.push('start')
+  onTestsRerun(() => {
+    calls.push('rerun')
+  })
+  return () => {
+    calls.push('end')
+  }
+}
diff --git a/test/watch/test/global-setup-rerun.test.ts b/test/watch/test/global-setup-rerun.test.ts
new file mode 100644
index 000000000000..f386157fadf2
--- /dev/null
+++ b/test/watch/test/global-setup-rerun.test.ts
@@ -0,0 +1,50 @@
+import { expect, test } from 'vitest'
+import { editFile, runVitest } from '../../test-utils'
+
+const testFile = 'fixtures/math.test.ts'
+
+test('global setup calls hooks correctly when file changes', async () => {
+  process.env.TEST_GLOBAL_SETUP = 'true'
+  const { vitest, ctx } = await runVitest({
+    root: 'fixtures',
+    watch: true,
+    include: ['math.test.ts'],
+  })
+
+  await vitest.waitForStdout('Waiting for file changes')
+
+  const calls = (globalThis as any).__CALLS as string[]
+  expect(calls).toEqual(['start'])
+
+  editFile(testFile, testFileContent => \`\${testFileContent}\\n\\n\`)
+
+  await vitest.waitForStdout('RERUN')
+  expect(calls).toEqual(['start', 'rerun'])
+
+  await ctx?.close()
+
+  expect(calls).toEqual(['start', 'rerun', 'end'])
+})
+
+test('global setup calls hooks correctly with a manual rerun', async () => {
+  process.env.TEST_GLOBAL_SETUP = 'true'
+  const { vitest, ctx } = await runVitest({
+    root: 'fixtures',
+    watch: true,
+    include: ['math.test.ts'],
+  })
+
+  await vitest.waitForStdout('Waiting for file changes')
+
+  const calls = (globalThis as any).__CALLS as string[]
+  expect(calls).toEqual(['start'])
+
+  vitest.write('r')
+
+  await vitest.waitForStdout('RERUN')
+  expect(calls).toEqual(['start', 'rerun'])
+
+  await ctx?.close()
+
+  expect(calls).toEqual(['start', 'rerun', 'end'])
+})
`

export const expected = { trustScore: 100, label: 'Honest Code', dataset: 'A' }
