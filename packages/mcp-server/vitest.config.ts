import { defineConfig } from "vitest/config";
import { BddReporter } from "./src/test/bddReporter.js";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: [new BddReporter()],
  },
});
