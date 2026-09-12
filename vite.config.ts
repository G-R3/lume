import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";
import { defineConfig } from "vite-plus";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          exclude: ["**/*.browser.test.{ts,tsx}"],
          include: ["{electron,src}/**/*.test.{ts,tsx}"],
          name: "unit",
        },
      },
      {
        extends: true,
        optimizeDeps: {
          include: ["vite-plus/test/browser"],
        },
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
            provider: playwright(),
            viewport: { height: 900, width: 1440 },
          },
          include: ["**/*.browser.test.{ts,tsx}"],
          name: "browser",
        },
      },
    ],
  },
  fmt: {
    ignorePatterns: [
      ".agent/**",
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".continue/**",
      ".cursor/**",
      ".gemini/**",
      ".opencode/**",
      ".pi/**",
      ".roo/**",
      ".windsurf/**",
      "src/routeTree.gen.ts",
      "tools/oxlint/anti-slop/**",
    ],
  },
  lint: {
    ignorePatterns: [
      ".agent/**",
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".continue/**",
      ".cursor/**",
      ".gemini/**",
      ".opencode/**",
      ".pi/**",
      ".roo/**",
      ".windsurf/**",
      "src/routeTree.gen.ts",
      "tools/oxlint/anti-slop/**",
    ],
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "oxc/no-accumulating-spread": "error",
      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-readable-spacing": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "anti-slop",
        specifier: "./tools/oxlint/anti-slop/index.ts",
      },
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
});
