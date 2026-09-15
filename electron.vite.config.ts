import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

export default defineConfig(({ command }) => ({
  main: {
    plugins: [migrationAssets()],
    build: {
      rollupOptions: {
        external: ["electron"],
        input: "electron/main.ts",
        output: {
          entryFileNames: "[name].cjs",
          format: "cjs",
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ["electron"],
        input: "electron/preload.ts",
        output: {
          entryFileNames: "[name].cjs",
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    root: ".",
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, "index.html"),
      },
    },
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "src"),
      },
    },
    plugins: [
      contentSecurityPolicy(command),
      tanstackRouter({ autoCodeSplitting: true, target: "react" }),
      tailwindcss(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
  },
}));

function migrationAssets(): Plugin {
  return {
    name: "migration-assets",
    async writeBundle(options) {
      if (!options.dir) throw new Error("The main-process build requires an output directory");

      const destination = resolve(options.dir, "drizzle");
      await rm(destination, { force: true, recursive: true });
      await cp(resolve(import.meta.dirname, "drizzle"), destination, { recursive: true });
    },
  };
}

function contentSecurityPolicy(command: "build" | "serve"): Plugin {
  const content =
    command === "serve"
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: lume:; media-src 'self' lume:; connect-src 'self' ws:"
      : "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: lume:; media-src 'self'; connect-src 'none'";

  return {
    name: "content-security-policy",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content,
        },
        injectTo: "head-prepend",
      },
    ],
  };
}
