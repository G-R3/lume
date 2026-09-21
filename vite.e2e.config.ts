import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    hookTimeout: 30_000,
    include: ["e2e/**/*.test.ts"],
    testTimeout: 45_000,
  },
});
