import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { maxWorkers: 2, testTimeout: 60_000, hookTimeout: 60_000 },
});
