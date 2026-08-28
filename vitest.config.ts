import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "app/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
      "worker/**/*.test.{ts,tsx}",
    ],
  },
});
