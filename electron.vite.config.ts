import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

export default defineConfig(({ command }) => ({
  main: {
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
      tailwindcss(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
  },
}));

function contentSecurityPolicy(command: "build" | "serve"): Plugin {
  const content =
    command === "serve"
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' lume:; connect-src 'self' ws:"
      : "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'none'";

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
