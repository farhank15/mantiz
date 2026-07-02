/**
 * Real PR: vitest-dev/vitest #8542 — project config filename validation
 * Source: https://github.com/vitest-dev/vitest/pull/8542
 *
 * Both source (packages/vitest/src/node/projects/) and test (test/config/test/) files modified.
 * Legitimate honest code — proper feature implementation with test coverage.
 */
export const diff = `diff --git a/packages/vitest/src/node/projects/resolveProjects.ts b/packages/vitest/src/node/projects/resolveProjects.ts
index 72406643637b..eb59b6dbc6fe 100644
--- a/packages/vitest/src/node/projects/resolveProjects.ts
+++ b/packages/vitest/src/node/projects/resolveProjects.ts
@@ -7,11 +7,11 @@ import type {
   UserConfig,
   UserWorkspaceConfig,
 } from '../types/config'
-import { existsSync, promises as fs } from 'node:fs'
+import { existsSync, readdirSync, statSync } from 'node:fs'
 import os from 'node:os'
 import { limitConcurrency } from '@vitest/runner/utils'
 import { deepClone } from '@vitest/utils'
-import { dirname, relative, resolve } from 'pathe'
+import { basename, dirname, relative, resolve } from 'pathe'
 import { glob, isDynamicPattern } from 'tinyglobby'
 import { mergeConfig } from 'vite'
 import { configFiles as defaultConfigFiles } from '../../constants'
@@ -20,6 +20,12 @@ import { VitestFilteredOutProjectError } from '../errors'
 import { initializeProject, TestProject } from '../project'
 import { withLabel } from '../reporters/renderers/utils'

+// vitest.config.*
+// vite.config.*
+// vitest.unit.config.*
+// vite.unit.config.*
+const CONFIG_REGEXP = /^vite(?:st)?(?:\\\\.\\\\w+)?\\\\.config\\\\./
+
 export async function resolveProjects(
   vitest: Vitest,
   cliOptions: UserConfig,
@@ -358,14 +364,22 @@ async function resolveTestProjectConfigs(
           throw new Error(\`\${note} references a non-existing file or a directory: \${file}\`)
         }

-        const stats = await fs.stat(file)
+        const stats = statSync(file)
         // user can specify a config file directly
         if (stats.isFile()) {
+          const name = basename(file)
+          if (!CONFIG_REGEXP.test(name)) {
+            throw new Error(
+              \`The file "\${relative(vitest.config.root, file)}" must start with "vitest.config"/"vite.config" \`
+              + \`or match the pattern "(vitest|vite).*.config.*" to be a valid project config.\`,
+            )
+          }
+
           projectsConfigFiles.push(file)
         }
         // user can specify a directory that should be used as a project
         else if (stats.isDirectory()) {
-          const configFile = await resolveDirectoryConfig(file)
+          const configFile = resolveDirectoryConfig(file)
           if (configFile) {
             projectsConfigFiles.push(configFile)
           }
@@ -418,11 +432,11 @@ async function resolveTestProjectConfigs(

     const projectsFs = await glob(projectsGlobMatches, globOptions)

-    await Promise.all(projectsFs.map(async (path) => {
+    projectsFs.forEach((path) => {
       // directories are allowed with a glob like \`packages/*\`
       // in this case every directory is treated as a project
       if (path.endsWith('/')) {
-        const configFile = await resolveDirectoryConfig(path)
+        const configFile = resolveDirectoryConfig(path)
         if (configFile) {
           projectsConfigFiles.push(configFile)
         }
@@ -431,9 +445,17 @@ async function resolveTestProjectConfigs(
         }
       }
       else {
+        const name = basename(path)
+        if (!CONFIG_REGEXP.test(name)) {
+          throw new Error(
+            \`The projects glob matched a file "\${relative(vitest.config.root, path)}", \`
+            + \`but it should also either start with "vitest.config"/"vite.config" \`
+            + \`or match the pattern "(vitest|vite).*.config.*".\`,
+          )
+        }
         projectsConfigFiles.push(path)
       }
-    }))
+    })
   }

   const projectConfigFiles = Array.from(new Set(projectsConfigFiles))
@@ -445,8 +467,8 @@ async function resolveTestProjectConfigs(
   }
 }

-async function resolveDirectoryConfig(directory: string) {
-  const files = new Set(await fs.readdir(directory))
+function resolveDirectoryConfig(directory: string) {
+  const files = new Set(readdirSync(directory))
   // default resolution looks for vitest.config.* or vite.config.* files
   // this simulates how \`findUp\` works in packages/vitest/src/node/create.ts:29
   const configFile = defaultConfigFiles.find(file => files.has(file))
diff --git a/test/config/test/projects.test.ts b/test/config/test/projects.test.ts
index 373ad5330d8b..a19a9d3be379 100644
--- a/test/config/test/projects.test.ts
+++ b/test/config/test/projects.test.ts
@@ -1,6 +1,6 @@
 import { resolve } from 'pathe'
-import { expect, it } from 'vitest'
-import { runVitest } from '../../test-utils'
+import { describe, expect, it } from 'vitest'
+import { runInlineTests, runVitest } from '../../test-utils'

 it('runs the workspace if there are several vitest config files', async () => {
   const { stderr, stdout } = await runVitest({
@@ -138,3 +138,60 @@ it('fails if workspace is filtered by the project', async () => {
     "./vitest.config.js"
 ].\`)
 })
+
+describe('the config file names', () => {
+  it('[glob] the name has "unit" between "vitest" and "config" and works', async () => {
+    const { exitCode } = await runInlineTests({
+      'vitest.unit.config.js': {},
+      'vitest.config.js': {
+        test: {
+          passWithNoTests: true,
+          projects: ['./vitest.*.config.js'],
+        },
+      },
+    })
+
+    expect(exitCode).toBe(0)
+  })
+
+  it('[glob] the name does not start with "vite"/"vitest" and throws an error', async () => {
+    const { stderr } = await runInlineTests({
+      'unit.config.js': {},
+      'vitest.config.js': {
+        test: {
+          projects: ['./*.config.js'],
+        },
+      },
+    }, {}, { fails: true })
+
+    expect(stderr).toContain('The projects glob matched a file "unit.config.js", but it should also either start with "vitest.config"/"vite.config" or match the pattern "(vitest|vite).*.config.*".')
+  })
+
+  it('[file] the name has "unit" between "vitest" and "config" and works', async () => {
+    const { exitCode } = await runInlineTests({
+      'vitest.unit.config.js': {},
+      'vitest.config.js': {
+        test: {
+          passWithNoTests: true,
+          projects: ['./vitest.unit.config.js'],
+        },
+      },
+    })
+
+    expect(exitCode).toBe(0)
+  })
+
+  it('[file] the name does not start with "vite"/"vitest" and throws an error', async () => {
+    const { stderr } = await runInlineTests({
+      'unit.config.js': {},
+      'vitest.config.js': {
+        test: {
+          passWithNoTests: true,
+          projects: ['./unit.config.js'],
+        },
+      },
+    }, {}, { fails: true })
+
+    expect(stderr).toContain('The file "unit.config.js" must start with "vitest.config"/"vite.config" or match the pattern "(vitest|vite).*.config.*" to be a valid project config.')
+  })
+})
`

export const expected = { trustScore: 74, label: 'Honest Code', dataset: 'A' }
