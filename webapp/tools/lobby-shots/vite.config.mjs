import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const here = fileURLToPath(new URL(".", import.meta.url));
const webappRoot = fileURLToPath(new URL("../../", import.meta.url));
const webappSrc = webappRoot + "src";

// Renders the real lobby for the website's tutorial screenshots: see tools/lobby-shots/README.md.
// "@/main.ts" and "@/router" are stubbed: the real ones boot keycloak and the Tauri game poll at
// import time, neither of which exists outside the desktop app.
export default defineConfig({
  root: here,
  publicDir: webappRoot + "public",
  plugins: [vue()],
  // The header prints the version the real build injects from the environment.
  define: { "import.meta.env.VITE_VERSION": JSON.stringify("dev") },
  resolve: {
    alias: [
      { find: /^@\/main\.ts$/, replacement: here + "main-stub.ts" },
      { find: /^@\/router$/, replacement: here + "router-stub.ts" },
      { find: "@assets", replacement: webappSrc + "/assets" },
      { find: "@", replacement: webappSrc },
    ],
  },
});
