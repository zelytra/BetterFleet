import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Reuse the site's Vite config (the "@" -> ./src alias) so tests resolve imports
// exactly like the app does.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      include: ["src/**/*.spec.ts"],
    },
  }),
);
