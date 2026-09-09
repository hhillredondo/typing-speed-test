import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    // Kept as `build/` with hashed assets under `build/static/` to match what the
    // deploy workflow syncs: `build/static/` gets immutable caching, everything
    // else gets must-revalidate. Changing these paths breaks that split.
    outDir: "build",
    assetsDir: "static",
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
