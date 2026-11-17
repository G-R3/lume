import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    hookTimeout: 30_000,
    include: ["e2e/**/*.test.ts"],
    testTimeout: 45_000,
  },
});
