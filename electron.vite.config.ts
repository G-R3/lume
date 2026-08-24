import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";

export default defineConfig({
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
    plugins: [
      tailwindcss(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
  },
});
