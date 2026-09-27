import { defineConfig } from "vitest/config";

// The tests never touch a network or a database: the setup file takes the
// database url out of the environment and points the file store at a scratch
// directory, so a run cannot reach a real one by accident.

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
