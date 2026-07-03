import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Native Node.js modules that must not be bundled into the client.
// @swc/core uses native .node binaries.
const NODE_EXTERNALS = [
  '@swc/core',
]

const config = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    exclude: NODE_EXTERNALS,
  },
  build: {
    rollupOptions: {
      external: NODE_EXTERNALS,
    },
  },
  ssr: {
    external: NODE_EXTERNALS,
  },
  plugins: [
    devtools(),
    nitro({ config: { rollupConfig: { external: [/^@sentry\//] } } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
