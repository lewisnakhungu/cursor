import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/tenant-scope.ts",
        "src/lib/stock-unit.ts",
        "src/lib/auth/permissions.ts",
        "src/lib/auth/rate-limit.ts",
        "src/lib/auth/password-policy.ts",
        "src/stores/cart-store.ts",
        "src/lib/offline/offline-dispense.ts",
      ],
    },
  },
});
