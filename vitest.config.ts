import { defineConfig } from "vitest/config";

// Tests mix UTC-based fixtures with code that uses the server-local clock
// (e.g. recurrence materialization horizon); pin the timezone so runs don't
// flake in the window where the local date lags the UTC date.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } }
  }
});
