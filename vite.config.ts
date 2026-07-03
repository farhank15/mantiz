import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const config = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: { tsconfigPaths: true },
  // Exclude native modules from Vite's dependency pre-bundling
  // to avoid rolldown trying to load .node binaries as JS/TS.
  optimizeDeps: {
    exclude: ['@swc/core'],
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
