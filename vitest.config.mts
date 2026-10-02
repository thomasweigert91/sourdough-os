import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    // Ohne die "react-server"-Bedingung von Next wirft server-only beim Import; in Tests ist es ein No-op.
    // Absoluter Pfad, weil die exports-Map von server-only den Unterpfad ./empty.js nicht freigibt.
    alias: {
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    // Kalter better-auth-Import nach vi.resetModules() dauert unter voller Parallelität über 5 s (auth.test.ts).
    testTimeout: 15000,
    // Begrenzte Parallelität: Unter voller Last werden zeitabhängige Tests (u. a. offline-sync, auth) flaky.
    maxWorkers: 4,
  },
});
